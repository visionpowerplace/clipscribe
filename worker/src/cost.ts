/**
 * Credit pricing. 1 credit = 1 minute of audio/video.
 * Keep in sync with the "How minutes are counted" text in web/app/pricing/page.tsx.
 *  - Transcription:        1 credit / minute
 *  - Each translation:     0.5 credit / minute
 *  - AI summary:          0.2 credit / minute (min 1)
 *  - Video/audio download: 1 credit / 10 minutes (bandwidth + storage)
 * Every billable item is rounded up, minimum 1 credit per job.
 */
export function computeCost(opts: {
  durationSeconds: number;
  wantTranscript: boolean;
  wantDownload: boolean;
  translations: number;
  summary?: boolean;
}): number {
  const minutes = Math.max(1, Math.ceil(opts.durationSeconds / 60));
  let cost = 0;
  if (opts.wantTranscript) {
    cost += minutes;
    cost += opts.translations * Math.ceil(minutes * 0.5);
    if (opts.summary) cost += Math.max(1, Math.ceil(minutes * 0.2));
  }
  if (opts.wantDownload) cost += Math.max(1, Math.ceil(minutes / 10));
  return Math.max(1, cost);
}
