// End-to-end pipeline test: real yt-dlp + ffmpeg + our code, with in-memory Supabase and a mock OpenAI server.
import http from 'node:http';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// --- mock OpenAI
const oa = http.createServer((req, res) => {
  const b: Buffer[] = []; req.on('data', (d) => b.push(d));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url!.endsWith('/audio/transcriptions')) {
      res.end(JSON.stringify({ language: 'english', segments: [{ start: 0, end: 4, text: ' Hello world.', no_speech_prob: 0, avg_logprob: -0.1 }, { start: 4, end: 9, text: ' This is a test.', no_speech_prob: 0, avg_logprob: -0.1 }] }));
    } else if (JSON.parse(Buffer.concat(b).toString()).messages[0].content.includes('structured summary')) {
      res.end(JSON.stringify({ choices: [{ message: { content: '```json\n' + JSON.stringify({ tldr: 'A short test clip.', key_points: ['Says hello', 'Is a test'], chapters: [{ start: 3.7, title: 'Intro' }, { start: 4.2, title: 'The test' }], quotes: [{ start: 4, text: 'This is a test.' }] }) + '\n```' } }] }));
    } else {
      const input = JSON.parse(JSON.parse(Buffer.concat(b).toString()).messages[1].content);
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ lines: input.lines.map((l: string) => `[fr] ${l}`) }) } }] }));
    }
  });
});
await new Promise<void>((r) => oa.listen(0, r));
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(oa.address() as any).port}/v1`;
process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'; process.env.OPENAI_API_KEY = 't';
process.env.NO_PROXY = '127.0.0.1,localhost'; process.env.no_proxy = '127.0.0.1,localhost';

// --- media server
const dir = mkdtempSync(path.join(os.tmpdir(), 'srv-'));
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=95', '-f', 'lavfi', '-i', 'color=c=blue:s=160x120:r=5:d=95', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', path.join(dir, 'clip.mp4')]);
const web = spawn('python3', ['-m', 'http.server', '8766', '--directory', dir], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));

// --- in-memory supabase
const { sb } = await import('../src/db.js');
const db: Record<string, any[]> = { jobs: [], transcripts: [] };
const calls: any[] = [];
const uploaded: string[] = [];
let addon = true;
(sb as any).from = (table: string) => {
  let patch: any = null; let filter: any = null; let mode = '';
  const chain: any = {
    select: () => { mode = 'select'; return chain; },
    single: () => Promise.resolve({ data: table === 'profiles' ? { downloads_addon: addon } : null, error: null }),
    update: (p: any) => { patch = p; mode = 'update'; return chain; },
    upsert: (row: any) => { db[table].push(row); return Promise.resolve({ error: null }); },
    eq: (k: string, v: any) => { filter = [k, v]; if (mode === 'update') { db[table].filter((r) => r[k] === v).forEach((r) => Object.assign(r, patch)); } return chain; },
    then: (res: any) => res({ error: null }),
  };
  return chain;
};
(sb as any).rpc = async (fn: string, args: any) => { calls.push([fn, args]); return { data: true, error: null }; };
(sb as any).storage = { from: (bucket: string) => ({
  upload: async (p: string) => { uploaded.push(`${bucket}/${p}`); return { error: null }; },
  remove: async () => ({ error: null }),
}) };

const { processJob } = await import('../src/pipeline.js');
const job: any = { id: 'job-1', user_id: 'user-1', source_type: 'url', source_url: 'http://127.0.0.1:8766/clip.mp4', upload_path: null,
  original_filename: null, want_transcript: true, want_download: true, want_summary: true, download_format: 'mp4', download_quality: 720, source_language: null,
  target_languages: ['fr'], status: 'processing', attempts: 1, credits_charged: false, credit_cost: null, title: null };
db.jobs.push({ id: 'job-1' });

await processJob(job);
const row = db.jobs[0];
console.log(JSON.stringify(row, null, 1));
assert.equal(row.status, 'completed', row.error);
assert.equal(row.progress, 100);
assert.equal(row.duration_seconds, 95);
assert.equal(row.detected_language, 'en');
assert.ok(row.media_path?.startsWith('user-1/job-1/media.') && row.media_filename?.endsWith('.mp4'));
assert.deepEqual(uploaded, [`outputs/${row.media_path}`]);
const langs = db.transcripts.map((t) => t.lang).sort();
assert.deepEqual(langs, ['en', 'fr']);
assert.equal(row.summary.tldr, 'A short test clip.');
assert.deepEqual(row.summary.chapters.map((c: any) => c.start), [4, 4]); // snapped to real segment starts (0/4)
assert.equal(row.summary.lang, 'en');
assert.equal(db.transcripts.find((t) => t.lang === 'fr').segments[0].text, '[fr] Hello world.');
// cost: transcribe 2 min + 1 translation ceil(2*.5)=1 + download ceil(2/10)=1 + summary ceil(2*.2)=1 => 5
const charge = calls.find(([fn]) => fn === 'consume_credits');
assert.equal(charge[1].p_amount, 5, JSON.stringify(charge));
assert.ok(!calls.some(([fn]) => fn === 'refund_job_credits'));
console.log('E2E PIPELINE PASSED (charged', charge[1].p_amount, 'credits)');

// failure path: unsupported/dead URL -> failed + refund + friendly message, no retry
db.jobs.push({ id: 'job-2' });
await processJob({ ...job, id: 'job-2', source_url: 'http://127.0.0.1:8766/missing.mp4' });
const r2 = db.jobs[1];
console.log('job-2:', r2.status, '-', r2.error);
assert.equal(r2.status, 'failed');
assert.ok(calls.some(([fn, a]) => fn === 'refund_job_credits' && a.p_job === 'job-2'));

// add-on gate: no add-on -> download job fails with a clear message and is refunded
addon = false;
db.jobs.push({ id: 'job-3' });
await processJob({ ...job, id: 'job-3' });
assert.equal(db.jobs[2].status, 'failed');
assert.ok(/add-on/i.test(db.jobs[2].error), db.jobs[2].error);
// transcription-only still fine without the add-on
addon = false;
db.jobs.push({ id: 'job-4' });
db.transcripts.length = 0;
await processJob({ ...job, id: 'job-4', want_download: false, target_languages: [] });
assert.equal(db.jobs[3].status, 'completed', db.jobs[3].error);
assert.equal(db.jobs[3].media_path ?? null, null);
console.log('ADD-ON GATE PASSED');
web.kill(); oa.close();
