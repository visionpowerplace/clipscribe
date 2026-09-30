import { chat } from './llm.js';
import { LANGUAGES } from './languages.js';
import { Segment } from './types.js';

const BATCH_LINES = 40;
const BATCH_CHARS = 5000;

function batches(segments: Segment[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  let chars = 0;
  segments.forEach((s, i) => {
    if (cur.length && (cur.length >= BATCH_LINES || chars + s.text.length > BATCH_CHARS)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(i);
    chars += s.text.length;
  });
  if (cur.length) out.push(cur);
  return out;
}

async function translateLines(lines: string[], context: string[], src: string, tgt: string): Promise<string[] | null> {
  const system =
    `You are a professional subtitle translator. Translate from ${src} to ${tgt}. ` +
    `Input is JSON: {"context_before": [...previous lines for context only, do NOT translate...], "lines": [...]}. ` +
    `Return JSON exactly like {"lines": [...]} with the SAME number of items as the input "lines", in the same order. ` +
    `One output line per input line: never merge, split, drop or add lines. Preserve meaning, tone, names and numbers. ` +
    `Keep lines concise like subtitles. Do not add commentary.`;
  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: JSON.stringify({ context_before: context, lines }) },
  ];
  const content = await chat(messages, { json: true, temperature: 0.2 });
  return parseLines(content, lines.length);
}

/** Extract {"lines": [...]} even if the model wrapped it in prose or a code fence. */
function parseLines(content: string, expected: number): string[] | null {
  const tryParse = (t: string) => {
    try {
      const j = JSON.parse(t);
      const arr = Array.isArray(j) ? j : j?.lines;
      if (Array.isArray(arr) && arr.length === expected && arr.every((x: unknown) => typeof x === 'string')) return arr as string[];
    } catch {}
    return null;
  };
  return tryParse(content) ?? tryParse(content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()) ?? (() => {
    const m = content.match(/\{[\s\S]*\}/);
    return m ? tryParse(m[0]) : null;
  })();
}

/** Translate all segments into `tgt`, preserving timestamps and line count. */
export async function translateSegments(
  segments: Segment[],
  srcCode: string | null,
  tgtCode: string,
  onProgress?: (frac: number) => void,
): Promise<Segment[]> {
  const src = srcCode ? (LANGUAGES[srcCode] ?? srcCode) : 'the source language (auto-detect)';
  const tgt = LANGUAGES[tgtCode] ?? tgtCode;
  const out: string[] = new Array(segments.length);
  const groups = batches(segments);
  let done = 0;

  for (const idxs of groups) {
    const lines = idxs.map((i) => segments[i].text);
    const context = segments.slice(Math.max(0, idxs[0] - 3), idxs[0]).map((s) => s.text);
    let result: string[] | null = null;
    for (let attempt = 0; attempt < 3 && !result; attempt++) result = await translateLines(lines, context, src, tgt);
    if (!result) {
      // Last resort: translate line by line so the count can never drift.
      result = [];
      for (let k = 0; k < lines.length; k++) {
        const one = await translateLines([lines[k]], k ? [lines[k - 1]] : context, src, tgt);
        result.push(one?.[0] ?? lines[k]);
      }
    }
    idxs.forEach((segIdx, k) => (out[segIdx] = result![k].trim()));
    onProgress?.(++done / groups.length);
  }
  return segments.map((s, i) => ({ start: s.start, end: s.end, text: out[i] || s.text }));
}
