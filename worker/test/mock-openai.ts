// Mock OpenAI server: verifies our transcription/translation code end to end (multipart upload, offsets, batching, count-preserving translation).
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let transcribeCalls = 0;
let chatCalls = 0;
let badOnce = true;
const server = http.createServer((req, res) => {
  const bufs: Buffer[] = [];
  req.on('data', (d) => bufs.push(d));
  req.on('end', () => {
    const body = Buffer.concat(bufs);
    res.setHeader('content-type', 'application/json');
    if (req.url?.endsWith('/audio/transcriptions')) {
      transcribeCalls++;
      const text = body.toString('latin1');
      assert.ok(text.includes('verbose_json'), 'response_format sent');
      assert.ok(text.includes('name="file"'), 'file sent');
      res.end(JSON.stringify({ language: 'english', text: 'hello', segments: [
        { start: 0, end: 3, text: ' Hello there.', no_speech_prob: 0.01, avg_logprob: -0.2 },
        { start: 3, end: 6, text: ' Thanks for watching!', no_speech_prob: 0.95, avg_logprob: -1.5 }, // hallucination -> dropped
        { start: 6, end: 9, text: ' Second line.', no_speech_prob: 0.02, avg_logprob: -0.3 },
      ] }));
    } else if (req.url?.endsWith('/chat/completions')) {
      chatCalls++;
      const j = JSON.parse(body.toString());
      const input = JSON.parse(j.messages[1].content);
      let lines: string[] = input.lines.map((l: string) => `ES:${l}`);
      if (badOnce && input.lines.length > 1) { badOnce = false; lines = lines.slice(1); } // simulate model dropping a line -> must retry
      res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'm', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ lines }) } }] }));
    } else { res.statusCode = 404; res.end('{}'); }
  });
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as any).port;
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1`;
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
process.env.OPENAI_API_KEY = 'test';

const { makeChunks } = await import('../src/ffmpeg.js');
const { transcribeChunks } = await import('../src/transcribe.js');
const { translateSegments } = await import('../src/translate.js');

const tmp = mkdtempSync(path.join(os.tmpdir(), 'cs-mock-'));
const src = path.join(tmp, 'a.mp3');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=1300', src]);
const dir = path.join(tmp, 'c'); mkdirSync(dir);
const chunks = await makeChunks(src, dir, 600);
const progress: number[] = [];
const r = await transcribeChunks(chunks, null, (d) => progress.push(d));
assert.equal(chunks.length, 3);
assert.equal(transcribeCalls, 3);
assert.equal(r.language, 'en');
assert.equal(r.segments.length, 6, 'hallucination dropped in each chunk');
assert.ok(r.segments.every((s, i, a) => i === 0 || s.start >= a[i - 1].start), 'sorted');
assert.ok(Math.abs(r.segments[2].start - (chunks[1].offset + 0)) < 0.01, 'offset applied to chunk 2');
assert.ok(!r.segments.some((s) => /watching/i.test(s.text)));
assert.equal(progress.at(-1), 3);

// translation: 100 segments -> batches, one bad batch response triggers retry, count preserved, timing preserved
const segs = Array.from({ length: 100 }, (_, i) => ({ start: i * 2, end: i * 2 + 2, text: `line ${i}` }));
const t = await translateSegments(segs, 'en', 'es');
assert.equal(t.length, 100);
assert.ok(t.every((s, i) => s.text === `ES:line ${i}` && s.start === segs[i].start && s.end === segs[i].end));
assert.ok(chatCalls >= 4, `expected >=4 chat calls (3 batches + 1 retry), got ${chatCalls}`);
console.log(`MOCK OPENAI TESTS PASSED (transcribe calls ${transcribeCalls}, chat calls ${chatCalls})`);
server.close();
