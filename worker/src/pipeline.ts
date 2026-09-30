import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';
import { computeCost } from './cost.js';
import { sb } from './db.js';
import { UserError } from './errors.js';
import { makeChunks, probeMedia } from './ffmpeg.js';
import { downloadObject, removeObjects, uploadFile } from './storage.js';
import { transcribeChunks } from './transcribe.js';
import { summarizeTranscript } from './summarize.js';
import { translateSegments } from './translate.js';
import { Job, Segment } from './types.js';
import { downloadMedia, fetchCaptions, probeUrl, shouldProxy } from './ytdlp.js';
import { planCaptions } from './captions.js';
import { notifyJobDone } from './email.js';
import type { RemoteMeta } from './ytdlp.js';

const MIME: Record<string, string> = { mp4: 'video/mp4', mp3: 'audio/mpeg', mkv: 'video/x-matroska', webm: 'video/webm' };

/** Throttled progress/stage writer. */
function reporter(jobId: string) {
  let last = 0;
  let lastKey = '';
  return async (stage: string, progress: number, force = false) => {
    const key = `${stage}:${Math.round(progress)}`;
    const now = Date.now();
    if (!force && key === lastKey) return;
    if (!force && now - last < 1500) return;
    last = now;
    lastKey = key;
    await sb.from('jobs').update({ stage, progress: Math.round(progress), heartbeat_at: new Date().toISOString() }).eq('id', jobId);
  };
}

const slug = (s: string) =>
  s.normalize('NFKD').replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'media';

export async function processJob(job: Job): Promise<void> {
  const report = reporter(job.id);
  const heartbeat = setInterval(() => {
    void sb.from('jobs').update({ heartbeat_at: new Date().toISOString() }).eq('id', job.id);
  }, 30_000);
  const tmp = await mkdtemp(path.join(os.tmpdir(), `job-${job.id.slice(0, 8)}-`));

  try {
    // ---------- 1. Get metadata / local source ----------
    let title = job.title ?? job.original_filename ?? 'Untitled';
    let platform = job.source_type === 'upload' ? 'upload' : 'web';
    let thumbnail: string | null = null;
    let meta: RemoteMeta | null = null;
    let duration = 0;
    let localSource: string | null = null;

    const wantDownload = job.want_download && job.source_type === 'url';
    // Video fetched through the paid proxy is capped (bandwidth is the real cost); the user is charged for what they actually get.
    const effQuality = job.source_type === 'url' && shouldProxy(job.source_url ?? '')
      ? Math.min(job.download_quality, config.proxiedMaxQuality) : job.download_quality;
    let downloaded: string | null = null; // file the user asked to download
    let audioSource: string | null = localSource;
    let acquired = false;
    const acquire = async () => {
      acquired = true;
      if (wantDownload) {
        await report('downloading', 5, true);
        downloaded = await downloadMedia(
          job.source_url!, tmp,
          job.download_format === 'mp3' ? { kind: 'audio', audioFormat: 'mp3' } : { kind: 'video', quality: effQuality },
          (p) => void report('downloading', 5 + p * 0.25),
        );
        audioSource = downloaded;
      } else if (job.want_transcript) {
        await report('downloading', 5, true);
        audioSource = await downloadMedia(job.source_url!, tmp, { kind: 'audio', audioFormat: 'raw' }, (p) => void report('downloading', 5 + p * 0.2));
      }
    };

    await report('probing', 2, true);
    if (job.source_type === 'url' && job.want_download) {
      const { data: prof } = await sb.from('profiles').select('downloads_addon').eq('id', job.user_id).single();
      if (!prof?.downloads_addon)
        throw new UserError('Downloading media requires the Downloads add-on. You can still transcribe this link without it.', 'addon_required');
    }
    if (job.source_type === 'url') {
      meta = await probeUrl(job.source_url!);
      title = meta.title; platform = meta.platform; thumbnail = meta.thumbnail; duration = meta.duration;
      if (!duration) {
        // Direct file links (and a few extractors) don't report a length: fetch first, then measure with ffprobe.
        await acquire();
        if (audioSource) duration = (await probeMedia(audioSource)).duration;
      }
    } else {
      localSource = path.join(tmp, 'upload' + path.extname(job.original_filename ?? '.bin'));
      await downloadObject('uploads', job.upload_path!, localSource);
      audioSource = localSource; // audioSource was initialised before localSource existed: set it now
      const info = await probeMedia(localSource);
      if (!info.hasAudio) throw new UserError('This file has no audio track to transcribe.', 'no_audio');
      duration = info.duration;
    }

    if (!duration || duration <= 0) throw new UserError('Could not determine the length of this media.', 'no_duration');
    if (duration > config.maxDurationSeconds)
      throw new UserError(`This media is longer than the ${Math.round(config.maxDurationSeconds / 3600)}-hour limit.`, 'too_long');

    if (wantDownload && job.download_format === 'mp4' && duration > config.maxVideoDownloadSeconds)
      throw new UserError(`Video downloads are limited to ${Math.round(config.maxVideoDownloadSeconds / 60)} minutes. You can still download the audio (MP3) or transcribe this link.`, 'too_long');

    // ---------- 1b. Anything a previous attempt already produced (retries must not repeat paid work) ----------
    const existing = new Map<string, { is_original: boolean; segments: Segment[] }>();
    if (job.attempts > 1) {
      const { data: rows } = await sb.from('transcripts').select('lang,is_original,segments').eq('job_id', job.id);
      for (const r of (rows ?? []) as any[]) existing.set(r.lang, { is_original: r.is_original, segments: r.segments });
    }
    const prevOriginal = [...existing.entries()].find(([, v]) => v.is_original);

    await sb.from('jobs').update({ title, platform, thumbnail, duration_seconds: Math.round(duration) }).eq('id', job.id);

    // ---------- 2. Charge credits (once, refunded on failure) ----------
    if (!job.credits_charged) {
      const cost = computeCost({
        durationSeconds: duration,
        wantTranscript: job.want_transcript,
        wantDownload,
        translations: job.want_transcript ? job.target_languages.length : 0,
        summary: job.want_transcript && job.want_summary,
        downloadFormat: job.download_format,
        downloadQuality: effQuality,
      });
      const { data: ok, error } = await sb.rpc('consume_credits', { p_user: job.user_id, p_amount: cost, p_job: job.id });
      if (error) throw new Error(`consume_credits failed: ${error.message}`);
      if (!ok)
        throw new UserError(
          `Not enough minutes: this job needs ${cost}. Add minutes or upgrade your plan and try again.`,
          'insufficient_credits',
        );
    }

    // ---------- 3. Get the transcript source: earlier attempt, YouTube captions, or the audio itself ----------
    let original: Segment[] = prevOriginal ? prevOriginal[1].segments : [];
    let detected: string | null = prevOriginal ? (prevOriginal[0] === 'und' ? job.source_language : prevOriginal[0]) : job.source_language;
    let originalIsNew = false;
    if (prevOriginal) console.log(`[job ${job.id}] reusing transcript from a previous attempt`);

    if (job.source_type === 'url' && job.want_transcript && !original.length && platform.toLowerCase() === 'youtube') {
      const plan = planCaptions(meta?.captions, job.source_language, config.captionsMode);
      if (plan) {
        try {
          await report('captions', 30, true);
          const capDir = path.join(tmp, 'captions');
          await import('node:fs/promises').then((f) => f.mkdir(capDir, { recursive: true }));
          const segs = await fetchCaptions(job.source_url!, capDir, plan);
          if (segs.length >= 3) {
            original = segs; detected = plan.lang; originalIsNew = true;
            console.log(`[job ${job.id}] using ${plan.auto ? 'auto' : 'manual'} YouTube captions (${plan.key}), ${segs.length} segments`);
          }
        } catch (e: any) {
          console.warn(`[job ${job.id}] captions unavailable, falling back to speech recognition: ${e?.message ?? e}`);
        }
      }
    }

    if (job.source_type === 'url' && !acquired) {
      const needMedia = wantDownload || (job.want_transcript && !original.length);
      if (needMedia) await acquire();
    }

    // ---------- 4. Transcribe ----------
    if (job.want_transcript && !original.length) {
      await report('extracting', 32, true);
      const info = await probeMedia(audioSource!);
      if (!info.hasAudio) throw new UserError('This media has no audio track to transcribe.', 'no_audio');
      const chunkDir = path.join(tmp, 'chunks');
      await import('node:fs/promises').then((f) => f.mkdir(chunkDir));
      const chunks = await makeChunks(audioSource!, chunkDir, config.chunkSeconds);

      await report('transcribing', 35, true);
      const t = await transcribeChunks(chunks, job.source_language, (d, n) => void report('transcribing', 35 + (d / n) * 45));
      original = t.segments;
      detected = t.language ?? job.source_language;
      if (!original.length) throw new UserError('No speech was detected in this media.', 'no_speech');
      originalIsNew = true;
    }

    if (job.want_transcript) {
      const origLang = detected ?? 'und';
      if (originalIsNew) {
        await sb.from('transcripts').upsert({ job_id: job.id, lang: origLang, is_original: true, segments: original }, { onConflict: 'job_id,lang' });
        await sb.from('jobs').update({ detected_language: origLang }).eq('id', job.id);
      }

      // ---------- 5. Translate (skipping languages finished by an earlier attempt) ----------
      const targets = job.target_languages.filter((l) => l !== detected);
      for (let i = 0; i < targets.length; i++) {
        if (existing.get(targets[i]) && !existing.get(targets[i])!.is_original) continue;
        await report('translating', 80 + (i / targets.length) * 14, true);
        const translated = await translateSegments(original, detected, targets[i], (f) =>
          void report('translating', 80 + ((i + f) / targets.length) * 14),
        );
        await sb.from('transcripts').upsert({ job_id: job.id, lang: targets[i], is_original: false, segments: translated }, { onConflict: 'job_id,lang' });
      }
    }

    // ---------- 5b. AI summary (of the original transcript) ----------
    if (job.want_transcript && job.want_summary && !job.summary) {
      await report('summarizing', 96, true);
      const summary = await summarizeTranscript(original, detected, title);
      await sb.from('jobs').update({ summary }).eq('id', job.id);
    }

    // ---------- 6. Publish downloadable media ----------
    let mediaPath: string | null = null;
    let mediaFilename: string | null = null;
    if (downloaded) {
      await report('uploading', 98, true);
      const ext = path.extname(downloaded).slice(1).toLowerCase() || job.download_format;
      mediaPath = `${job.user_id}/${job.id}/media.${ext}`;
      mediaFilename = `${slug(title)}.${ext}`;
      await uploadFile('outputs', mediaPath, downloaded, MIME[ext] ?? 'application/octet-stream');
    }

    await sb.from('jobs').update({
      status: 'completed', stage: null, progress: 100, media_path: mediaPath, media_filename: mediaFilename,
      finished_at: new Date().toISOString(), error: null,
    }).eq('id', job.id);
    await notifyJobDone(job, { ok: true, title });

    // Uploaded originals are deleted as soon as the job succeeds.
    if (job.upload_path) {
      await removeObjects('uploads', [job.upload_path]);
      await sb.from('jobs').update({ upload_path: null }).eq('id', job.id);
    }
  } catch (err: any) {
    await handleFailure(job, err);
  } finally {
    clearInterval(heartbeat);
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleFailure(job: Job, err: any): Promise<void> {
  const isUser = err instanceof UserError;
  console.error(`[job ${job.id}] ${isUser ? 'user error' : 'ERROR'}:`, err?.message ?? err);

  // Unexpected errors get up to 3 attempts; credits stay charged across retries (consume is skipped).
  if (!isUser && job.attempts < 3) {
    await sb.from('jobs').update({ status: 'queued', worker_id: null, stage: null, progress: 0 }).eq('id', job.id);
    return;
  }
  const message = isUser ? err.message : 'Something went wrong on our side while processing this. You were not charged.';
  await sb.from('jobs').update({ status: 'failed', error: message, stage: null, finished_at: new Date().toISOString() }).eq('id', job.id);
  await sb.rpc('refund_job_credits', { p_job: job.id });
  await notifyJobDone(job, { ok: false, message });
  if (job.upload_path) {
    await removeObjects('uploads', [job.upload_path]).catch(() => {});
    await sb.from('jobs').update({ upload_path: null }).eq('id', job.id);
  }
}
