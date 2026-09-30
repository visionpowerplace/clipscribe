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
      whisperCalls++;
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
let whisperCalls = 0;
(sb as any).from = (table: string) => {
  let patch: any = null; let filter: any = null; let mode = '';
  const chain: any = {
    select: () => { mode = 'select'; return chain; },
    single: () => Promise.resolve({ data: table === 'profiles' ? { downloads_addon: addon } : null, error: null }),
    update: (p: any) => { patch = p; mode = 'update'; return chain; },
    upsert: (row: any) => { db[table].push({ ...row }); return Promise.resolve({ error: null }); },
    eq: (k: string, v: any) => { filter = [k, v]; if (mode === 'update') { db[table].filter((r) => r[k] === v).forEach((r) => Object.assign(r, patch)); } return chain; },
    then: (res: any) => res({ error: null, data: mode === 'select' && table === 'transcripts' ? db.transcripts.filter((r) => r.job_id === filter?.[1]) : undefined }),
  };
  return chain;
};
(sb as any).rpc = async (fn: string, args: any) => { calls.push([fn, args]); return { data: true, error: null }; };
(sb as any).storage = { from: (bucket: string) => ({
  createSignedUrl: async () => ({ data: { signedUrl: 'http://127.0.0.1:8766/clip.mp4' }, error: null }),
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
// cost: transcribe 2 + translation 1 + 720p video ceil(2*0.8)=2 + summary 1 => 6
const charge = calls.find(([fn]) => fn === 'consume_credits');
assert.equal(charge[1].p_amount, 6, JSON.stringify(charge));
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
// upload flow: storage object -> local file -> transcription (regression: audioSource used to stay null for uploads)
db.jobs.push({ id: 'job-5' });
db.transcripts.length = 0;
await processJob({ ...job, id: 'job-5', source_type: 'upload', source_url: null, upload_path: 'user-1/x.mp4', original_filename: 'my video.mp4', want_download: false, target_languages: [] });
assert.equal(db.jobs[4].status, 'completed', db.jobs[4].error);
assert.equal(db.transcripts.length, 1);
assert.equal(db.jobs[4].duration_seconds, 95);
console.log('UPLOAD FLOW PASSED');

// retry: a second attempt must reuse the stored transcript/translation/summary instead of paying for them again
db.jobs.push({ id: 'job-6' });
db.transcripts.length = 0;
db.transcripts.push({ job_id: 'job-6', lang: 'en', is_original: true, segments: [{ start: 0, end: 4, text: 'Hello world.' }, { start: 4, end: 9, text: 'This is a test.' }] });
db.transcripts.push({ job_id: 'job-6', lang: 'fr', is_original: false, segments: [{ start: 0, end: 4, text: '[fr] Hello world.' }] });
const callsBefore = whisperCalls, chargesBefore = calls.filter(([fn]) => fn === 'consume_credits').length;
await processJob({ ...job, id: 'job-6', attempts: 2, credits_charged: true, want_download: false, want_summary: true, summary: { lang: 'en', tldr: 'kept', key_points: [], chapters: [], quotes: [] } as any, target_languages: ['fr'] });
assert.equal(db.jobs[5].status, 'completed', db.jobs[5].error);
assert.equal(whisperCalls, callsBefore, 'retry must not re-run speech recognition');
assert.equal(calls.filter(([fn]) => fn === 'consume_credits').length, chargesBefore, 'retry must not charge again');
assert.equal(db.transcripts.filter((t) => t.job_id === 'job-6').length, 2);
console.log('RETRY REUSE PASSED');

// limits: 95 s clip with a 60 s video-download cap -> friendly error, refund not needed (nothing charged before the check)
const { config } = await import('../src/config.js');
addon = true;
config.maxVideoDownloadSeconds = 60;
db.jobs.push({ id: 'job-7' });
const chargesB = calls.filter(([fn]) => fn === 'consume_credits').length;
await processJob({ ...job, id: 'job-7', want_download: true, download_format: 'mp4', want_summary: false, target_languages: [] });
assert.equal(db.jobs[6].status, 'failed');
assert.ok(/limited to 1 minutes/.test(db.jobs[6].error), db.jobs[6].error);
assert.equal(calls.filter(([fn]) => fn === 'consume_credits').length, chargesB);
config.maxVideoDownloadSeconds = 3600;
config.maxDurationSeconds = 60;
db.jobs.push({ id: 'job-8' });
await processJob({ ...job, id: 'job-8', want_download: false, want_summary: false, target_languages: [] });
assert.equal(db.jobs[7].status, 'failed');
assert.ok(/limit/.test(db.jobs[7].error), db.jobs[7].error);
config.maxDurationSeconds = 3 * 3600;
console.log('LIMITS PASSED');

// email: long job -> Resend called once with link; short job -> no email; API failure never fails the job
const sent: any[] = [];
const rs = http.createServer((req, res) => { const b: Buffer[] = []; req.on('data', (d) => b.push(d)); req.on('end', () => { sent.push({ auth: req.headers.authorization, body: JSON.parse(Buffer.concat(b).toString()) }); res.statusCode = sent.length === 3 ? 500 : 200; res.end('{"id":"x"}'); }); });
await new Promise<void>((r) => rs.listen(0, r));
process.env.RESEND_API_URL = `http://127.0.0.1:${(rs.address() as any).port}`;
config.resendKey = 're_test'; config.emailFrom = 'ClipScribe <noreply@example.com>'; config.appUrl = 'https://app.example.com'; config.emailMinSeconds = 120;
const origGet = (sb as any).from;
(sb as any).from = (t: string) => { const c = origGet(t); if (t === 'profiles') { const single = c.single; c.single = () => t === 'profiles' ? Promise.resolve({ data: { email: 'u@example.com', downloads_addon: true }, error: null }) : single(); } return c; };
const old = new Date(Date.now() - 5 * 60_000).toISOString();
db.jobs.push({ id: 'job-9' }); db.transcripts.length = 0;
await processJob({ ...job, id: 'job-9', created_at: old, want_download: false, want_summary: false, target_languages: [], title: null });
assert.equal(sent.length, 1);
assert.equal(sent[0].auth, 'Bearer re_test');
assert.deepEqual(sent[0].body.to, ['u@example.com']);
assert.ok(sent[0].body.html.includes('https://app.example.com/jobs/job-9'));
db.jobs.push({ id: 'job-10' }); db.transcripts.length = 0;
await processJob({ ...job, id: 'job-10', created_at: new Date().toISOString(), want_download: false, want_summary: false, target_languages: [] });
assert.equal(sent.length, 1, 'short jobs are not emailed');
db.jobs.push({ id: 'job-11' }); db.transcripts.length = 0;
await processJob({ ...job, id: 'job-11', created_at: old, want_download: false, want_summary: false, target_languages: [] });
assert.equal(db.jobs[10].status, 'completed', 'a failing email API must not fail the job');
db.jobs.push({ id: 'job-12' });
await processJob({ ...job, id: 'job-12', created_at: old, source_url: 'http://127.0.0.1:8766/missing.mp4', want_download: false });
assert.equal(db.jobs[11].status, 'failed');
assert.ok(sent.at(-1)!.body.subject.includes("couldn't finish"), sent.at(-1)!.body.subject);
console.log('EMAIL PASSED');
rs.close();
web.kill(); oa.close();
