# ClipScribe — transcribe, translate & download video/audio (SaaS starter)

Working name: **ClipScribe** (change `NEXT_PUBLIC_APP_NAME`). Users paste a link (YouTube, Vimeo, Instagram, TikTok, Facebook, X, 1000+ sites via yt-dlp) or upload a file → get a timestamped transcript, SRT/VTT/TXT/JSON export, translations into up to 5 of 40 languages, an optional AI summary (overview, key takeaways, chapters, quotes; Markdown export), and an optional downloadable MP4/MP3. Accounts, minute-based billing (Stripe subscriptions **and** top-up packs) included.

```
Browser ──> Next.js on Vercel ──> Supabase (Auth · Postgres · Storage) <── Railway worker
              │  API routes: create job, signed uploads,       ▲        yt-dlp · ffmpeg ·
              │  exports, Stripe checkout/portal/webhook       │        OpenAI Whisper + LLM translation
              └────────── Stripe ── webhook ── grants minutes ─┘
```

* `supabase/migrations/0001_init.sql` – tables, RLS, job queue (`claim_job`, `requeue_stale_jobs`), atomic credit functions (spend / refund / grant, all idempotent).
* `web/` – Next.js 15 app (landing, auth, dashboard, live job progress, job view, pricing, Terms/Privacy templates, Stripe).
* `worker/` – Node 22 worker (Dockerfile bundles ffmpeg + yt-dlp). Pulls jobs from Postgres, no inbound port needed.

## Deploy (about 45 minutes)

1. **Supabase**: create a project → SQL editor → run `supabase/migrations/0001_init.sql`, then `0002_downloads_addon.sql`, then `0003_ai_summary.sql`. Auth → URL config: set Site URL to your domain and add `https://YOURDOMAIN/auth/callback` to redirect URLs. Storage → Settings: raise the *global file size limit* (uploads/outputs buckets are set to 2 GB, but the project cap applies; >50 MB needs a paid plan).
2. **OpenAI**: create an API key (worker env `OPENAI_API_KEY`).
3. **Stripe**: create 3 recurring monthly Prices (Starter/Pro/Business) and 3 one-time Prices (100/500/2000-minute packs) matching `web/lib/plans.ts` (edit amounts/minutes there first). Put the price IDs in `STRIPE_PRICE_*`. Add a webhook endpoint `https://YOURDOMAIN/api/stripe/webhook` for: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`; copy the signing secret to `STRIPE_WEBHOOK_SECRET`. Enable the Customer Portal (Settings → Billing → Customer portal) so users can cancel/change plans.
4. **Vercel**: import `web/` (root directory `web`), set the env vars from `web/.env.example`. 
5. **Railway**: new service from `worker/` (uses the Dockerfile), set env vars from `worker/.env.example`. Start with 1 replica, `WORKER_CONCURRENCY=2`, ≥1 GB RAM. Scale by adding replicas — the queue uses `FOR UPDATE SKIP LOCKED`, so replicas never double-process a job.
6. Replace `[DATE]`, `[SUPPORT EMAIL]`, `[DESIGNATED AGENT EMAIL]`, `[STATE/COUNTRY]` in `/terms` and `/privacy` **after a lawyer reviews them**.

Local dev: `cd web && npm i && npm run dev`, `cd worker && npm i && npm run dev` (needs `ffmpeg` and `yt-dlp` on PATH). Tests: `cd worker && npx tsx test/run.ts` (also `test/mock-openai.ts`, `test/e2e.ts`).

## How billing works
1 credit = 1 minute. Transcription 1/min · each translation +0.5/min · AI summary +0.2/min (min 1) · download 1 per 10 min (all rounded up, min 1). Rules live in `worker/src/cost.ts` (keep the text in `web/app/pricing/page.tsx` in sync). Subscription minutes reset each period (no rollover) and are spent first; pack minutes never expire. Credits are charged once the worker knows the real duration and **refunded automatically** if the job fails. New users get 10 free minutes (change in the SQL trigger).

## Making downloads reliable (the hard part — read this)
Transcription/translation are dependable. **Downloading from big platforms is an arms race**, and no tool does it "perfectly":
* **Datacenter IPs get blocked.** YouTube (and often Instagram/TikTok/Facebook) block Railway/AWS/GCP addresses with "confirm you're not a bot" or login walls. Set `YTDLP_PROXY` to a **residential/rotating proxy** for URL jobs. Expect this to be your main running cost and the main cause of support tickets.
* **Proxy bandwidth is expensive** (often several $/GB). A 1080p video download can be 100+ MB, far more than the default download price covers. Either price downloads higher in `cost.ts`, proxy only audio/transcription traffic, or limit video downloads to higher plans.
* **Cookies**: some Instagram/Facebook/age-gated content needs a logged-in session: export a `cookies.txt` from a throwaway account and set `YTDLP_COOKIES_B64` (base64). Accounts get banned; budget for rotation.
* **Keep yt-dlp current.** The worker runs `yt-dlp -U` at every boot and every 12 h; still redeploy when sites break. It uses `--js-runtimes node` (YouTube now needs an external JS runtime; Node 22 is in the image).
* Always offer the **file-upload fallback** (built into the UI error messages).
* SSRF: `web/lib/safe-url.ts` rejects localhost/private IPs, but run the worker in a network that cannot reach your internal services.

## Legal / business risk (not legal advice)
* Downloading from YouTube, Instagram, TikTok, Facebook etc. generally **violates those platforms' Terms of Service**, and copying copyrighted videos can infringe copyright. Operating a paid downloader raises your exposure (platform enforcement, DMCA notices, hosting/payment-processor suspensions — Stripe and others restrict businesses that facilitate copyright infringement).
* Mitigations already built in: per-job rights attestation, Terms with prohibited-use + DMCA clause, short media retention (7 days), deletion controls. You still need a lawyer, a registered DMCA agent, a takedown process, and a decision on whether download is a core feature or an add-on limited to user-owned content. Transcription/translation of files users upload is much lower risk than platform downloading.
* Privacy: audio/text is sent to OpenAI, Supabase, Stripe, Vercel, Railway — reflected in the Privacy template; check DPAs if you serve EU customers.

## Cost sanity check
Whisper API ≈ $0.006/min; LLM translation is a fraction of a cent per minute; Railway compute is small; Supabase storage/egress for kept downloads and proxy bandwidth are the swing factors. Default prices (`plans.ts`) give roughly $0.0225–$0.03 per credit-minute on plans, leaving healthy margin on transcription; re-check after you measure real proxy costs.

## What has and hasn't been tested
Tested here: web type-check + production build; SQL migration on Postgres 16 (spend/refund/grant idempotency, queue claiming, stale-job recovery, RLS isolation); ffmpeg chunking with accurate offsets; Whisper/translation code against a mock OpenAI server (including the model dropping a line); subtitle formats; URL safety filter; full worker pipeline (real yt-dlp + ffmpeg on a local link, in-memory DB, mock OpenAI) for success and failure/refund paths.
**Not tested (no credentials/network in the build sandbox):** real Supabase/Stripe/OpenAI calls, downloads from YouTube/Instagram/TikTok/Facebook/Vimeo, TUS uploads of >40 MB outputs to Supabase, and the browser UI in a live browser. Do a smoke test on staging with a short YouTube link, a Vimeo link, a 100+ MB upload, and a Stripe test-mode purchase before charging anyone.

## Sensible next steps
Uppy/TUS uploads with progress bar · API keys + public API · team seats · speaker diarization (Deepgram/AssemblyAI) · burned-in subtitles · rate limiting (e.g. Upstash) and abuse detection · email notifications when a job finishes (Resend) · admin dashboard · optional YouTube-caption fast path.


## Free-tier testing setup (what we used)
* **Web**: Vercel (Hobby is non-commercial only: move to Pro before charging users). **DB/Auth/Storage**: Supabase free.
* **Worker**: Render free Docker web service (`worker/Dockerfile`, context `./worker`). It sleeps after 15 idle minutes; the web app pings `WORKER_URL/wake` when a job is created and the worker self-pings while busy. Set `WORKER_SECRET` to the same value on both sides.
* **AI**: Groq free tier via the OpenAI-compatible API: `TRANSCRIBE_BASE_URL=https://api.groq.com/openai/v1`, `TRANSCRIBE_MODEL=whisper-large-v3-turbo`, `TRANSLATE_MODEL=llama-3.3-70b-versatile` (also used for summaries), `TRANSCRIBE_API_KEY=<groq key>`. Groq's free tier limits uploads to 25 MB per request; the worker already splits audio into small chunks.
* YouTube blocks most datacenter IPs, so downloads from it may fail on free hosts. Vimeo, direct links and uploads are the reliable test cases.

## Cloudflare R2 storage (free tier) and large uploads
Supabase's free plan caps every stored object at 50 MB. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` on **both** the web app and the worker (plus `NEXT_PUBLIC_MAX_UPLOAD_MB=1024` on the web app) and uploads go browser -> R2 via presigned URLs, downloaded media is stored in R2 too, and the 50 MB cap disappears. The bucket needs this CORS rule (R2 dashboard > bucket > Settings > CORS policy):
`[{"AllowedOrigins":["https://YOUR-SITE"],"AllowedMethods":["PUT","GET"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]`
Objects are namespaced `uploads/...` and `outputs/...`; the worker's retention cleanup deletes old ones. Without the R2 variables everything falls back to Supabase Storage.

## YouTube from cloud servers
YouTube blocks most datacenter IPs ("Sign in to confirm you're not a bot"). Reliable options: (1) a residential proxy: set `YTDLP_PROXY` on the worker; by default only YouTube hosts use it (`YTDLP_PROXY_DOMAINS`), and audio-only transcription downloads are small (roughly 60 MB per hour of video); (2) run the worker on a home computer (residential IP); (3) cookies from a dedicated YouTube account in `YTDLP_COOKIES_B64` (may violate YouTube's terms and can get the account flagged).

## Limits, pricing rules and shortcuts (added before launch)
* Max 3 h per job (`MAX_DURATION_SECONDS`), video (MP4) downloads max 1 h (`MAX_VIDEO_DOWNLOAD_SECONDS`). Both are checked before any credits are charged.
* Video downloads are priced by quality (0.4 / 0.8 / 1.5 / 3 credits per minute); audio stays 1 per 10 min. YouTube video goes through the paid proxy and is capped at `PROXIED_MAX_QUALITY` (720). Downloads add-on: $19/month (`web/lib/plans.ts`; create the Stripe price at that amount).
* Retries reuse the stored transcript, translations and summary, so a failed later step never repeats paid work or charges again.
* YouTube captions: `CAPTIONS_MODE=manual` (default) uses creator-made captions when they exist and otherwise falls back to Whisper; `any` also uses YouTube's auto-captions (faster, but no punctuation and less accurate); `off` disables it.
* Job-finished email via Resend: set `RESEND_API_KEY`, `EMAIL_FROM` (a sender on a domain verified in Resend) and `APP_URL` on the worker. Sent only for jobs that took at least `EMAIL_MIN_SECONDS` (120) and for final failures.
