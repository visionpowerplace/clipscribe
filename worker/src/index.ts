import http from 'node:http';
import { cleanupOldMedia } from './cleanup.js';
import { config } from './config.js';
import { sb } from './db.js';
import { processJob } from './pipeline.js';
import { Job } from './types.js';
import { updateYtdlp } from './ytdlp.js';

let stopping = false;
let activeJobs = 0;
let lastActivity = Date.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loop(slot: number) {
  const id = `${config.workerId}-${slot}`;
  while (!stopping) {
    try {
      const { data, error } = await sb.rpc('claim_job', { p_worker: id });
      if (error) throw error;
      const job = data as Job | null;
      if (!job || !job.id) {
        await sleep(3000);
        continue;
      }
      console.log(`[${id}] claimed job ${job.id} (${job.source_type}, attempt ${job.attempts})`);
      activeJobs++; lastActivity = Date.now();
      try { await processJob(job); } finally { activeJobs--; lastActivity = Date.now(); }
    } catch (e: any) {
      console.error(`[${id}] loop error:`, e?.message ?? e);
      await sleep(5000);
    }
  }
}

async function maintenance() {
  let lastCleanup = 0;
  let lastUpdate = Date.now();
  while (!stopping) {
    try {
      const { data } = await sb.rpc('requeue_stale_jobs', { p_stale_seconds: 600 });
      if (data) console.log(`requeued/failed ${data} stale jobs`);
      if (Date.now() - lastCleanup > 3600_000) { lastCleanup = Date.now(); await cleanupOldMedia(); }
      if (Date.now() - lastUpdate > 12 * 3600_000) { lastUpdate = Date.now(); await updateYtdlp(); }
    } catch (e: any) {
      console.error('maintenance error:', e?.message ?? e);
    }
    await sleep(60_000);
  }
}

// --- Tiny HTTP server. Free hosts (Render, Koyeb) put idle web services to sleep; the web app calls /wake
// when a job is created so the worker spins up, and while jobs run we ping ourselves so it is not put to sleep mid-job.
if (config.port) {
  http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/wake') {
      if (config.workerSecret && req.headers['x-worker-secret'] !== config.workerSecret) { res.statusCode = 401; return res.end('unauthorized'); }
      lastActivity = Date.now();
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, activeJobs, uptime: Math.round(process.uptime()) }));
  }).listen(config.port, () => console.log(`health server on :${config.port}`));
  if (config.keepAliveUrl) {
    setInterval(() => {
      // stay awake while working, and for 10 minutes after the last activity
      if (activeJobs > 0 || Date.now() - lastActivity < 10 * 60_000) fetch(`${config.keepAliveUrl}/health`).catch(() => {});
    }, 4 * 60_000);
  }
}

process.on('SIGTERM', () => { console.log('SIGTERM: finishing running jobs…'); stopping = true; });
process.on('SIGINT', () => { stopping = true; });

console.log(`ClipScribe worker ${config.workerId} starting with concurrency ${config.concurrency}`);
await updateYtdlp(); // start every deploy on the newest extractors
await Promise.all([maintenance(), ...Array.from({ length: config.concurrency }, (_, i) => loop(i))]);
