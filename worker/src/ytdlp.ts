import { spawn } from 'node:child_process';
import { readdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { config } from './config.js';
import { classifyYtdlpError, UserError } from './errors.js';
import { CaptionPlan, CaptionTracks, readCaptionFile } from './captions.js';
import { Segment } from './types.js';

let cookiesFile: string | null = null;
async function getCookiesFile(): Promise<string | null> {
  if (!config.cookiesB64) return null;
  if (!cookiesFile) {
    cookiesFile = path.join(os.tmpdir(), 'yt-cookies.txt');
    await writeFile(cookiesFile, Buffer.from(config.cookiesB64, 'base64'), { mode: 0o600 });
  }
  return cookiesFile;
}

/** True when this URL's host should be fetched through the configured proxy. */
export function shouldProxy(url: string, proxy = config.proxy, domains = config.proxyDomains): boolean {
  if (!proxy) return false;
  if (domains.includes('*')) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return domains.some((d) => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

async function baseArgs(url: string): Promise<string[]> {
  const a = [
    '--no-playlist', '--no-warnings', '--ignore-config',
    '--js-runtimes', 'node',                 // YouTube needs an external JS runtime (EJS challenge solver)
    '--remote-components', 'ejs:github',     // fetch solver scripts if the binary does not bundle them
    '--socket-timeout', '30', '--retries', '5', '--fragment-retries', '5',
    '--max-filesize', `${config.maxDownloadMb}M`,
    '--restrict-filenames',
  ];
  if (shouldProxy(url)) a.push('--proxy', config.proxy);
  const c = await getCookiesFile();
  if (c) a.push('--cookies', c);
  return a;
}

function run(args: string[], onLine?: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn('yt-dlp', args);
    let out = '';
    let err = '';
    let buf = '';
    p.stdout.on('data', (d) => {
      const s = d.toString();
      out += s;
      if (onLine) {
        buf += s;
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        lines.forEach(onLine);
      }
    });
    p.stderr.on('data', (d) => (err = (err + d).slice(-10000)));
    p.on('error', (e) => reject(new Error(`Failed to start yt-dlp: ${e.message}`)));
    p.on('close', (code) => {
      if (code === 0) return resolve(out);
      console.error(`[yt-dlp] exit ${code}: ${(err || out).trim().split('\n').slice(-6).join(' | ').slice(0, 900)}`);
      reject(classifyYtdlpError(err || out));
    });
  });
}

export interface RemoteMeta {
  title: string;
  duration: number;
  thumbnail: string | null;
  platform: string;
  isLive: boolean;
  captions?: CaptionTracks;
}

export async function probeUrl(url: string): Promise<RemoteMeta> {
  const out = await run([...(await baseArgs(url)), '-J', '--skip-download', url]);
  const j = JSON.parse(out);
  const info = j.entries?.[0] ?? j;
  if (info.is_live || info.live_status === 'is_live' || info.live_status === 'is_upcoming')
    throw new UserError('Live streams and upcoming premieres cannot be processed until they finish.', 'live');
  return {
    title: String(info.title ?? 'Untitled').slice(0, 200),
    duration: Number(info.duration ?? 0),
    thumbnail: info.thumbnail ?? null,
    platform: String(info.extractor_key ?? info.extractor ?? 'web'),
    isLive: false,
    captions: {
      language: typeof info.language === 'string' ? info.language : null,
      manual: Object.keys(info.subtitles ?? {}),
      auto: Object.keys(info.automatic_captions ?? {}),
    },
  };
}

/** Fetch one caption track (YouTube json3) without downloading any media. Throws if nothing usable came back. */
export async function fetchCaptions(url: string, dir: string, plan: CaptionPlan): Promise<Segment[]> {
  await run([
    ...(await baseArgs(url)), '--skip-download', plan.auto ? '--write-auto-subs' : '--write-subs', '--sub-langs', plan.key,
    '--sub-format', 'json3', '-o', path.join(dir, 'cap.%(ext)s'), url,
  ]);
  return readCaptionFile(dir);
}

/** Download to `dir`; returns the resulting file path. `onProgress` gets 0-100. */
export async function downloadMedia(
  url: string,
  dir: string,
  opts: { kind: 'video' | 'audio'; audioFormat?: 'mp3' | 'raw'; quality?: number },
  onProgress: (pct: number) => void,
): Promise<string> {
  const args = [...(await baseArgs(url)), '--newline', '--progress-template', 'download:PROGRESS %(progress._percent_str)s', '-o', path.join(dir, 'src.%(ext)s')];
  if (opts.kind === 'video') {
    const q = opts.quality ?? 1080;
    args.push('-f', 'bv*+ba/b', '-S', `res:${q},vcodec:h264,acodec:m4a`, '--merge-output-format', 'mp4');
  } else if (opts.audioFormat === 'mp3') {
    args.push('-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    args.push('-f', 'ba/b'); // raw best audio; ffmpeg normalises it later
  }
  args.push(url);
  await run(args, (line) => {
    const m = line.match(/PROGRESS\s+([\d.]+)%/);
    if (m) onProgress(Math.min(100, parseFloat(m[1])));
  });
  const files = (await readdir(dir)).filter((f) => f.startsWith('src.') && !f.endsWith('.part') && !f.endsWith('.ytdl'));
  if (!files.length) throw new UserError('The download finished but produced no file.', 'download_failed');
  // pick the largest (in case of leftover fragments)
  let best = files[0];
  let bestSize = 0;
  for (const f of files) {
    const s = (await stat(path.join(dir, f))).size;
    if (s > bestSize) { best = f; bestSize = s; }
  }
  return path.join(dir, best);
}

export async function updateYtdlp(): Promise<void> {
  await new Promise<void>((resolve) => {
    const p = spawn('yt-dlp', ['-U']);
    p.on('close', () => resolve());
    p.on('error', () => resolve());
  });
}
