function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}
const int = (name: string, d: number) => {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) ? n : d;
};

export const config = {
  supabaseUrl: req('SUPABASE_URL'),
  supabaseKey: req('SUPABASE_SERVICE_ROLE_KEY'),
  // Any OpenAI-compatible provider works (OpenAI, Groq, ...). Groq's free tier is a good way to start:
  //   TRANSCRIBE_BASE_URL=https://api.groq.com/openai/v1  TRANSCRIBE_MODEL=whisper-large-v3-turbo
  //   TRANSLATE_MODEL=llama-3.3-70b-versatile  (same key)
  transcribeKey: process.env.TRANSCRIBE_API_KEY || process.env.OPENAI_API_KEY || req('TRANSCRIBE_API_KEY'),
  transcribeBaseUrl: process.env.TRANSCRIBE_BASE_URL || undefined,
  transcribeModel: process.env.TRANSCRIBE_MODEL || 'whisper-1',
  translateKey: process.env.TRANSLATE_API_KEY || process.env.TRANSCRIBE_API_KEY || process.env.OPENAI_API_KEY || req('TRANSLATE_API_KEY'),
  translateBaseUrl: process.env.TRANSLATE_BASE_URL || process.env.TRANSCRIBE_BASE_URL || undefined,
  translateModel: process.env.TRANSLATE_MODEL || 'gpt-4o-mini',
  // Optional Cloudflare R2 (or any S3-compatible) storage. When set, uploads/outputs live there instead of Supabase Storage
  // (Supabase's free plan caps objects at 50 MB; R2's free tier has 10 GB and no egress fees).
  r2: process.env.R2_BUCKET && (process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID)
    ? {
        endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        accessKeyId: req('R2_ACCESS_KEY_ID'),
        secretAccessKey: req('R2_SECRET_ACCESS_KEY'),
        bucket: process.env.R2_BUCKET,
      }
    : null,
  port: int('PORT', 0),
  workerSecret: process.env.WORKER_SECRET || '',
  keepAliveUrl: process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL || '',
  concurrency: int('WORKER_CONCURRENCY', 2),
  maxDurationSeconds: int('MAX_DURATION_SECONDS', 4 * 3600),
  maxDownloadMb: int('MAX_DOWNLOAD_MB', 2000),
  retentionDays: int('RETENTION_DAYS', 7),
  proxy: process.env.YTDLP_PROXY || '',
  // Only these sites go through the proxy (residential proxies bill per GB, and only YouTube really needs one). Use '*' for all sites.
  proxyDomains: (process.env.YTDLP_PROXY_DOMAINS || 'youtube.com,youtu.be,youtube-nocookie.com').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
  cookiesB64: process.env.YTDLP_COOKIES_B64 || '',
  chunkSeconds: 600,
  workerId: `worker-${process.env.RAILWAY_REPLICA_ID || process.pid}-${Math.random().toString(36).slice(2, 6)}`,
};
