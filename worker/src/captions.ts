import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Segment } from './types.js';

export interface CaptionTracks { language: string | null; manual: string[]; auto: string[] }
export interface CaptionPlan { key: string; auto: boolean; lang: string }

const base = (k: string) => k.toLowerCase().split(/[-_]/)[0];

/** Pick which YouTube caption track (if any) to use instead of running speech recognition. */
export function planCaptions(tracks: CaptionTracks | undefined, wantedLang: string | null, mode: 'manual' | 'any' | 'off'): CaptionPlan | null {
  if (!tracks || mode === 'off') return null;
  const manual = tracks.manual.filter((k) => !k.startsWith('live_chat'));
  const lang = wantedLang ? base(wantedLang) : tracks.language ? base(tracks.language) : null;
  // 1. human-made track in the spoken language
  if (lang) {
    const m = manual.find((k) => k.toLowerCase() === lang) ?? manual.find((k) => base(k) === lang);
    if (m) return { key: m, auto: false, lang };
  } else if (manual.length === 1) {
    // language unknown but the uploader supplied exactly one track: it is almost certainly the spoken language
    return { key: manual[0], auto: false, lang: base(manual[0]) };
  }
  // 2. YouTube's own speech recognition in the original language (opt-in: lower quality than Whisper)
  if (mode === 'any' && lang) {
    const orig = tracks.auto.find((k) => k.toLowerCase() === `${lang}-orig`);
    if (orig) return { key: orig, auto: true, lang };
    if (tracks.language && base(tracks.language) === lang) {
      const a = tracks.auto.find((k) => k.toLowerCase() === lang) ?? tracks.auto.find((k) => base(k) === lang && !k.includes('-'));
      if (a) return { key: a, auto: true, lang };
    }
  }
  return null;
}

/** Parse YouTube's json3 caption format into tidy, sentence-sized segments. */
export function parseJson3(raw: string): Segment[] {
  let j: any;
  try { j = JSON.parse(raw); } catch { return []; }
  const items: Segment[] = [];
  for (const ev of j?.events ?? []) {
    if (!Array.isArray(ev.segs)) continue;
    const text = ev.segs.map((s: any) => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const start = (ev.tStartMs ?? 0) / 1000;
    const end = start + (ev.dDurationMs ?? 0) / 1000;
    items.push({ start, end: Math.max(end, start + 0.5), text });
  }
  items.sort((a, b) => a.start - b.start);
  // make sure segments never overlap, then merge fragments into readable blocks
  for (let i = 0; i < items.length - 1; i++) if (items[i].end > items[i + 1].start) items[i].end = items[i + 1].start;
  const out: Segment[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    const joinable = last && it.start - last.end < 1.2 && last.text.length < 90 && it.end - last.start < 12 && !/[.!?。！？]$/.test(last.text);
    if (joinable) { last.text = `${last.text} ${it.text}`; last.end = it.end; } else out.push({ ...it });
  }
  return out.filter((s) => s.end > s.start);
}

/** Read the caption file yt-dlp wrote into `dir`. */
export async function readCaptionFile(dir: string): Promise<Segment[]> {
  const f = (await readdir(dir)).find((n) => n.startsWith('cap.') && n.endsWith('.json3'));
  if (!f) return [];
  return parseJson3(await readFile(path.join(dir, f), 'utf8'));
}
