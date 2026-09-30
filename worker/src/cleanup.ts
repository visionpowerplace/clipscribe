import { config } from './config.js';
import { sb } from './db.js';
import { removeObjects } from './storage.js';

/** Delete downloaded media (and stray uploads) older than RETENTION_DAYS. Transcripts are kept until the user deletes the job. */
export async function cleanupOldMedia(): Promise<void> {
  const cutoff = new Date(Date.now() - config.retentionDays * 86400_000).toISOString();
  const { data } = await sb
    .from('jobs')
    .select('id, media_path, upload_path')
    .lt('created_at', cutoff)
    .or('media_path.not.is.null,upload_path.not.is.null')
    .limit(200);
  for (const j of data ?? []) {
    if (j.media_path) await removeObjects('outputs', [j.media_path]).catch(() => {});
    if (j.upload_path) await removeObjects('uploads', [j.upload_path]).catch(() => {});
    await sb.from('jobs').update({ media_path: null, upload_path: null }).eq('id', j.id);
  }
  if (data?.length) console.log(`cleanup: removed media for ${data.length} jobs`);
}
