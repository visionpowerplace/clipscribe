/**
 * Credit pricing. 1 credit = 1 minute of audio/video.
 * Keep in sync with the "How minutes are counted" text in web/app/pricing/page.tsx and web/lib/pricing.ts.
 *  - Transcription:        1 credit / minute
 *  - Each translation:     0.5 credit / minute
 *  - AI summary:          0.2 credit / minute (min 1)
 *  - Audio (MP3) download: 1 credit / 10 minutes
 *  - Video (MP4) download: priced by quality because bandwidth (especially through a paid proxy) is the real cost:
 *        <=480p 0.4 / min · 720p 0.8 / min · 1080p 1.5 / min · 1440p+ 3 / min
 * Every billable item is rounded up, minimum 1 credit per job.
 */
export function videoCreditsPerMinute(quality: number): number {
  if (quality <= 480) return 0.4;
  if (quality <= 720) return 0.8;
  if (quality <= 1080) return 1.5;
  return 3;
}

export function computeCost(opts: {
  durationSeconds: number;
  wantTranscript: boolean;
  wantDownload: boolean;
  translations: number;
  summary?: boolean;
  downloadFormat?: 'mp3' | 'mp4';   // omitted = audio pricing
  downloadQuality?: number;         // effective max height for mp4
}): number {
  const minutes = Math.max(1, Math.ceil(opts.durationSeconds / 60));
  let cost = 0;
  if (opts.wantTranscript) {
    cost += minutes;
    cost += opts.translations * Math.ceil(minutes * 0.5);
    if (opts.summary) cost += Math.max(1, Math.ceil(minutes * 0.2));
  }
  if (opts.wantDownload) {
    cost += opts.downloadFormat === 'mp4'
      ? Math.max(1, Math.ceil(minutes * videoCreditsPerMinute(opts.downloadQuality ?? 720)))
      : Math.max(1, Math.ceil(minutes / 10));
  }
  return Math.max(1, cost);
}
