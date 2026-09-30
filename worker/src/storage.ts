import fs from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tus from 'tus-js-client';
import { config } from './config.js';
import { sb } from './db.js';

/** Stream a private object from Supabase Storage to a local file (no full-file buffering). */
export async function downloadObject(bucket: string, objectPath: string, dest: string): Promise<void> {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(objectPath, 600);
  if (error || !data) throw new Error(`Could not sign download URL: ${error?.message}`);
  const res = await fetch(data.signedUrl);
  if (!res.ok || !res.body) throw new Error(`Storage download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(dest));
}

const SMALL_LIMIT = 40 * 1024 * 1024;

/** Upload a local file. Small files use the plain API; large files use resumable (TUS) uploads. */
export async function uploadFile(bucket: string, objectPath: string, file: string, contentType: string): Promise<void> {
  const { size } = await stat(file);
  if (size <= SMALL_LIMIT) {
    const buf = await fs.promises.readFile(file);
    const { error } = await sb.storage.from(bucket).upload(objectPath, buf, { contentType, upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return;
  }
  const projectRef = new URL(config.supabaseUrl).hostname.split('.')[0];
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(fs.createReadStream(file) as any, {
      endpoint: `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${config.supabaseKey}`, 'x-upsert': 'true' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      uploadSize: size,
      metadata: { bucketName: bucket, objectName: objectPath, contentType, cacheControl: '3600' },
      chunkSize: 6 * 1024 * 1024, // Supabase requires exactly 6 MB chunks
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

export async function removeObjects(bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  await sb.storage.from(bucket).remove(paths);
}
