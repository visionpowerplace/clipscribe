import { chat } from './llm.js';
import { LANGUAGES } from './languages.js';
import { Segment, Summary } from './types.js';

const CHUNK_CHARS = 9000; // ~2.3k tokens: keeps us inside free-tier per-minute token limits

const clock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** Turn segments into "[seconds] text" lines, grouped into chunks of roughly CHUNK_CHARS. */
export function toChunks(segments: Segment[]): string[] {
  const out: string[] = [];
  let cur = '';
  for (const s of segments) {
    const line = `[${Math.floor(s.start)}] ${s.text.trim()}\n`;
    if (cur && cur.length + line.length > CHUNK_CHARS) { out.push(cur); cur = ''; }
    cur += line;
  }
  if (cur) out.push(cur);
  return out;
}

function lenientJson(content: string): any | null {
  const tryParse = (t: string) => { try { return JSON.parse(t); } catch { return null; } };
  return tryParse(content) ?? tryParse(content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()) ?? (() => {
    const m = content.match(/\{[\s\S]*\}/);
    return m ? tryParse(m[0]) : null;
  })();
}

async function askJson(system: string, user: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const content = await chat([{ role: 'system', content: system }, { role: 'user', content: user }], { json: true, temperature: 0.3 });
    const j = lenientJson(content);
    if (j && typeof j === 'object') return j;
  }
  throw new Error('Summary model did not return valid JSON');
}

const str = (v: unknown, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v: unknown, n: number, max = 300) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

/** Snap a model-provided timestamp to the closest real segment start so links/times are never invented. */
function snap(t: unknown, segments: Segment[]): number {
  const n = typeof t === 'number' ? t : parseFloat(String(t));
  if (!Number.isFinite(n)) return segments[0]?.start ?? 0;
  let best = segments[0]?.start ?? 0;
  for (const s of segments) if (Math.abs(s.start - n) < Math.abs(best - n)) best = s.start;
  return best;
}

export async function summarizeTranscript(segments: Segment[], langCode: string | null, title: string): Promise<Summary> {
  const language = langCode && LANGUAGES[langCode] ? LANGUAGES[langCode] : 'the same language as the transcript';
  const lang = langCode ?? 'und';
  const chunks = toChunks(segments);
  const shared =
    `Write in ${language}. Timestamps in the transcript are seconds in square brackets like [125]. ` +
    `Only use facts stated in the transcript: never invent details, names or numbers. Return valid JSON only.`;

  let digest: string;
  if (chunks.length === 1) {
    digest = chunks[0];
  } else {
    // Map step: condense each chunk into topic notes that keep their timestamps.
    const notes: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const j = await askJson(
        `You take notes on part ${i + 1} of ${chunks.length} of a video transcript titled "${title}". ${shared} ` +
          `Return {"topics":[{"start":<seconds from the transcript>,"title":"short topic title","points":["1-3 concise facts or arguments"]}],"quotes":[{"start":<seconds>,"text":"a striking short verbatim quote"}]}. ` +
          `Use 1-4 topics and at most 2 quotes for this part.`,
        chunks[i],
      );
      const topics = Array.isArray(j.topics) ? j.topics : [];
      for (const t of topics) notes.push(`[${Math.floor(Number(t.start) || 0)}] TOPIC ${str(t.title, 120)}: ${strs(t.points, 4, 200).join(' | ')}`);
      for (const q of Array.isArray(j.quotes) ? j.quotes.slice(0, 2) : []) notes.push(`[${Math.floor(Number(q.start) || 0)}] QUOTE "${str(q.text, 240)}"`);
    }
    digest = notes.join('\n');
  }

  const j = await askJson(
    `You write a structured summary of a video transcript titled "${title}". ${shared} ` +
      `Return exactly {"tldr":"2-3 sentence overview","key_points":["5-8 key takeaways, one sentence each"],` +
      `"chapters":[{"start":<seconds>,"title":"chapter title"}],"quotes":[{"start":<seconds>,"text":"verbatim quote"}]}. ` +
      `Use 3-12 chapters in chronological order (more for longer videos), the first chapter starting at the beginning. Use up to 4 quotes; quotes must be verbatim from the input.`,
    digest.slice(0, 60_000),
  );

  const chapters = (Array.isArray(j.chapters) ? j.chapters : [])
    .map((c: any) => ({ start: snap(c?.start, segments), title: str(c?.title, 120) }))
    .filter((c: { title: string }) => c.title)
    .sort((a: { start: number }, b: { start: number }) => a.start - b.start)
    .slice(0, 20);
  const quotes = (Array.isArray(j.quotes) ? j.quotes : [])
    .map((q: any) => ({ start: snap(q?.start, segments), text: str(q?.text, 300) }))
    .filter((q: { text: string }) => q.text)
    .slice(0, 4);
  const summary: Summary = { lang, tldr: str(j.tldr, 900), key_points: strs(j.key_points, 10), chapters, quotes };
  if (!summary.tldr && !summary.key_points.length) throw new Error('Summary model returned an empty summary');
  return summary;
}
