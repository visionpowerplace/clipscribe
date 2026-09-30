import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { UserError } from './errors.js';

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr = (stderr + d).slice(-8000)));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-600)}`)),
    );
  });
}

export interface MediaInfo {
  duration: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

export async function probeMedia(file: string): Promise<MediaInfo> {
  let out: string;
  try {
    ({ stdout: out } = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
  } catch {
    throw new UserError('This file is not a valid audio or video file, or it is corrupted.', 'bad_media');
  }
  const j = JSON.parse(out);
  const streams: any[] = j.streams ?? [];
  const hasAudio = streams.some((s) => s.codec_type === 'audio');
  const hasVideo = streams.some((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  let duration = parseFloat(j.format?.duration ?? '0');
  if (!Number.isFinite(duration) || duration <= 0) {
    duration = Math.max(0, ...streams.map((s) => parseFloat(s.duration ?? '0')).filter(Number.isFinite));
  }
  return { duration, hasAudio, hasVideo };
}

export interface Chunk {
  file: string;
  offset: number; // seconds from start of the source
  duration: number;
}

/**
 * Convert any media to speech-optimised mono 16 kHz MP3 and split into fixed-length chunks
 * (each well under the 25 MB API limit: 10 min @ 48 kbps ≈ 3.6 MB).
 * Offsets are accumulated from the real duration of every chunk so timestamps stay accurate.
 */
export async function makeChunks(input: string, dir: string, chunkSeconds: number): Promise<Chunk[]> {
  await run('ffmpeg', [
    '-y', '-v', 'error', '-i', input, '-vn', '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-b:a', '48k',
    '-f', 'segment', '-segment_time', String(chunkSeconds), '-reset_timestamps', '1',
    path.join(dir, 'chunk_%04d.mp3'),
  ]);
  const files = (await readdir(dir)).filter((f) => /^chunk_\d+\.mp3$/.test(f)).sort();
  const chunks: Chunk[] = [];
  let offset = 0;
  for (const f of files) {
    const full = path.join(dir, f);
    const { duration } = await probeMedia(full);
    if (duration < 0.3) continue; // sliver at the end
    chunks.push({ file: full, offset, duration });
    offset += duration;
  }
  if (!chunks.length) throw new UserError('No audio could be extracted from this file.', 'no_audio');
  return chunks;
}
