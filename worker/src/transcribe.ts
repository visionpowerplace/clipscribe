import fs from 'node:fs';
import OpenAI from 'openai';
import { config } from './config.js';
import { Chunk } from './ffmpeg.js';
import { whisperLanguageToCode } from './languages.js';
import { Segment } from './types.js';

const openai = new OpenAI({ apiKey: config.transcribeKey, baseURL: config.transcribeBaseUrl, maxRetries: 6, timeout: 5 * 60_000 });

export interface TranscriptResult {
  segments: Segment[];
  language: string | null; // ISO code
}

async function transcribeChunk(chunk: Chunk, language: string | null, prompt: string): Promise<{ segments: Segment[]; language?: string }> {
  const res: any = await openai.audio.transcriptions.create({
    file: fs.createReadStream(chunk.file),
    model: config.transcribeModel,
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
    ...(language ? { language } : {}),
    ...(prompt ? { prompt } : {}),
    temperature: 0,
  } as any);
  const raw: any[] = res.segments ?? [];
  const segments: Segment[] = [];
  for (const s of raw) {
    const text = String(s.text ?? '').trim();
    if (!text) continue;
    // Drop classic Whisper hallucinations on silence/music.
    if ((s.no_speech_prob ?? 0) > 0.85 && (s.avg_logprob ?? 0) < -1) continue;
    segments.push({
      start: round(chunk.offset + Number(s.start)),
      end: round(chunk.offset + Number(s.end)),
      text,
    });
  }
  // Some models return only text with no segments: fall back to one segment for the whole chunk.
  if (!segments.length && res.text && String(res.text).trim()) {
    segments.push({ start: round(chunk.offset), end: round(chunk.offset + chunk.duration), text: String(res.text).trim() });
  }
  return { segments, language: res.language };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Transcribe chunks with limited concurrency. The first chunk runs alone to auto-detect the
 * language; the rest are pinned to it (avoids mid-video language flapping). Each chunk gets the
 * tail of the previous one as a prompt for continuity of names/terms.
 */
export async function transcribeChunks(
  chunks: Chunk[],
  sourceLanguage: string | null,
  onProgress: (done: number, total: number) => void,
): Promise<TranscriptResult> {
  const results: Segment[][] = new Array(chunks.length);
  let lang = sourceLanguage;
  let detected: string | null = sourceLanguage;

  const first = await transcribeChunk(chunks[0], lang, '');
  results[0] = first.segments;
  if (!lang) {
    detected = whisperLanguageToCode(first.language);
    lang = detected; // pin (may be null if unmapped: then stay on auto)
  }
  onProgress(1, chunks.length);

  let next = 1;
  let done = 1;
  const workers = Array.from({ length: Math.min(3, chunks.length - 1) }, async () => {
    while (true) {
      const i = next++;
      if (i >= chunks.length) return;
      const prevTail = results[i - 1]?.slice(-3).map((s) => s.text).join(' ').slice(-200) ?? '';
      const r = await transcribeChunk(chunks[i], lang, prevTail);
      results[i] = r.segments;
      onProgress(++done, chunks.length);
    }
  });
  await Promise.all(workers);

  const segments = results.flat().sort((a, b) => a.start - b.start);
  return { segments, language: detected };
}
