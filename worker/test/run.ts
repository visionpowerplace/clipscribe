// Offline tests for the pieces that don't need Supabase/OpenAI credentials.
process.env.SUPABASE_URL ||= 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
process.env.OPENAI_API_KEY ||= 'x';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { computeCost } = await import('../src/cost.js');
const { makeChunks, probeMedia } = await import('../src/ffmpeg.js');
const { whisperLanguageToCode } = await import('../src/languages.js');
const { classifyYtdlpError } = await import('../src/errors.js');
const { planCaptions, parseJson3 } = await import('../src/captions.js');
const { videoCreditsPerMinute } = await import('../src/cost.js');

// cost rules
assert.equal(computeCost({ durationSeconds: 61, wantTranscript: true, wantDownload: false, translations: 0 }), 2);
assert.equal(computeCost({ durationSeconds: 600, wantTranscript: true, wantDownload: false, translations: 2 }), 10 + 2 * 5);
assert.equal(computeCost({ durationSeconds: 3600, wantTranscript: false, wantDownload: true, translations: 3 }), 6);
assert.equal(computeCost({ durationSeconds: 5, wantTranscript: true, wantDownload: true, translations: 0 }), 2);
assert.equal(computeCost({ durationSeconds: 600, wantTranscript: true, wantDownload: false, translations: 0, summary: true }), 12);
assert.equal(computeCost({ durationSeconds: 30, wantTranscript: true, wantDownload: false, translations: 0, summary: true }), 2);

// video download pricing is by quality; audio stays 1 per 10 min
assert.equal(computeCost({ durationSeconds: 600, wantTranscript: false, wantDownload: true, translations: 0, downloadFormat: 'mp4', downloadQuality: 720 }), 8);
assert.equal(computeCost({ durationSeconds: 600, wantTranscript: false, wantDownload: true, translations: 0, downloadFormat: 'mp4', downloadQuality: 1080 }), 15);
assert.equal(computeCost({ durationSeconds: 600, wantTranscript: false, wantDownload: true, translations: 0, downloadFormat: 'mp4', downloadQuality: 360 }), 4);
assert.equal(computeCost({ durationSeconds: 600, wantTranscript: false, wantDownload: true, translations: 0, downloadFormat: 'mp3' }), 1);
assert.equal(videoCreditsPerMinute(2160), 3);

// caption selection
const T = (language: string | null, manual: string[], auto: string[]) => ({ language, manual, auto });
assert.deepEqual(planCaptions(T('en', ['en', 'fr'], ['en', 'fr', 'en-orig']), null, 'manual'), { key: 'en', auto: false, lang: 'en' });
assert.equal(planCaptions(T('en', [], ['en-orig', 'fr']), null, 'manual'), null);              // auto only: not used in manual mode
assert.deepEqual(planCaptions(T('en', [], ['en-orig', 'fr']), null, 'any'), { key: 'en-orig', auto: true, lang: 'en' });
assert.equal(planCaptions(T('en', [], ['fr', 'de']), null, 'any'), null);                       // only machine translations: never use
assert.equal(planCaptions(T('en', ['en'], []), null, 'off'), null);
assert.deepEqual(planCaptions(T('en', ['en-US'], []), 'en', 'manual'), { key: 'en-US', auto: false, lang: 'en' });
assert.equal(planCaptions(T('en', ['fr'], []), 'en', 'manual'), null);                          // user says English, only French track
assert.deepEqual(planCaptions(T(null, ['es'], []), null, 'manual'), { key: 'es', auto: false, lang: 'es' });
assert.equal(planCaptions(undefined, null, 'manual'), null);
const segs = parseJson3(JSON.stringify({ events: [
  { tStartMs: 0, dDurationMs: 0, wpWinPosId: 1 },
  { tStartMs: 500, dDurationMs: 1500, segs: [{ utf8: 'Hello' }, { utf8: ' there' }] },
  { tStartMs: 2000, dDurationMs: 1800, segs: [{ utf8: 'and welcome.' }] },
  { tStartMs: 3800, dDurationMs: 100, segs: [{ utf8: '\n' }] },
  { tStartMs: 6000, dDurationMs: 2000, segs: [{ utf8: 'Second sentence here.' }] },
] }));
assert.deepEqual(segs.map((x) => x.text), ['Hello there and welcome.', 'Second sentence here.']);
assert.ok(segs[0].start === 0.5 && segs[0].end === 3.8 && segs[1].start === 6);
assert.deepEqual(parseJson3('not json'), []);

// language mapping
assert.equal(whisperLanguageToCode('english'), 'en');
assert.equal(whisperLanguageToCode('Spanish'), 'es');
assert.equal(whisperLanguageToCode('chinese'), 'zh');
assert.equal(whisperLanguageToCode('klingon'), null);

// error classification
assert.equal(classifyYtdlpError("ERROR: Sign in to confirm you’re not a bot").code, 'platform_blocked');
assert.equal(classifyYtdlpError('ERROR: Private video. Sign in if you\'ve been granted access').code, 'private');
assert.equal(classifyYtdlpError('ERROR: Unsupported URL: https://x').code, 'unsupported');

// chunking: 25 minutes of video-with-audio -> 3 chunks with continuous offsets
const tmp = mkdtempSync(path.join(os.tmpdir(), 'cs-test-'));
const src = path.join(tmp, 'in.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1500', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=1:d=1500', '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', src]);
const info = await probeMedia(src);
assert.ok(info.hasAudio && info.hasVideo && Math.abs(info.duration - 1500) < 2, JSON.stringify(info));
const dir = path.join(tmp, 'chunks'); mkdirSync(dir);
const chunks = await makeChunks(src, dir, 600);
assert.equal(chunks.length, 3);
assert.equal(chunks[0].offset, 0);
assert.ok(Math.abs(chunks[1].offset - 600) < 1 && Math.abs(chunks[2].offset - 1200) < 2, JSON.stringify(chunks.map((c) => c.offset)));
const total = chunks.reduce((a, c) => a + c.duration, 0);
assert.ok(Math.abs(total - 1500) < 2, `total ${total}`);
const { statSync } = await import('node:fs');
for (const c of chunks) assert.ok(statSync(c.file).size < 5 * 1024 * 1024, 'chunk under 5MB (API limit is 25MB)');

// video without audio should be detected
const silent = path.join(tmp, 'silent.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=1:d=3', '-c:v', 'libx264', silent]);
assert.equal((await probeMedia(silent)).hasAudio, false);

// corrupt file -> friendly error
const bad = path.join(tmp, 'bad.mp3');
(await import('node:fs')).writeFileSync(bad, 'not media');
await assert.rejects(() => probeMedia(bad), /not a valid audio or video/);

console.log('ALL WORKER TESTS PASSED');

// summarize: chunking keeps timestamps and splits long transcripts
{
  const { toChunks } = await import('../src/summarize.js');
  const segs = Array.from({ length: 400 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, text: 'word '.repeat(12).trim() }));
  const ch = toChunks(segs);
  assert.ok(ch.length > 1 && ch.every((c) => c.length < 9500));
  assert.ok(ch[0].startsWith('[0] ') && ch.join('').split('\n').filter(Boolean).length === 400);
  console.log('SUMMARY CHUNKING PASSED');
}

// proxy routing: only YouTube by default
{
  const { shouldProxy } = await import('../src/ytdlp.js');
  const P = 'http://u:p@proxy:1', D = ['youtube.com', 'youtu.be'];
  assert.equal(shouldProxy('https://www.youtube.com/watch?v=1', P, D), true);
  assert.equal(shouldProxy('https://youtu.be/abc', P, D), true);
  assert.equal(shouldProxy('https://vimeo.com/123', P, D), false);
  assert.equal(shouldProxy('https://notyoutube.com/x', P, D), false);
  assert.equal(shouldProxy('https://vimeo.com/123', P, ['*']), true);
  assert.equal(shouldProxy('https://youtu.be/abc', '', D), false);
  console.log('PROXY ROUTING PASSED');
}
