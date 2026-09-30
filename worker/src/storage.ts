import fs from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tus from 'tus-js-client';
import { DeleteObjectsCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { config } from './config.js';
import { sb } from './db.js';

let s3: S3Client | null = null;
function r2(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: 'auto', endpoint: config.r2!.endpoint, forcePathStyle: true,
      credentials: { accessKeyId: config.r2!.accessKeyId, secretAccessKey: config.r2!.secretAccessKey },
    });
  }
  return s3;
}
const r2Key = (bucket: string, p: string) => `${bucket}/${p}`;

/** Stream a private object to a local file (no full-file buffering). `bucket` is 'uploads' or 'outputs'. */
export async function downloadObject(bucket: string, objectPath: string, dest: string): Promise<void> {
  if (config.r2) {
    const res = await r2().send(new GetObjectCommand({ Bucket: config.r2.bucket, Key: r2Key(bucket, objectPath) }));
    if (!res.Body) throw new Error('Storage download failed: empty body');
    await pipeline(res.Body as Readable, fs.createWriteStream(dest));
    const got = (await stat(dest)).size;
    console.log(`[storage:r2] downloaded ${bucket}/${objectPath}: ${got} bytes (expected ${res.ContentLength ?? 'unknown'})`);
    if (res.ContentLength && got !== res.ContentLength) throw new Error(`Storage download incomplete: ${got}/${res.ContentLength} bytes`);
    return;
  }
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(objectPath, 600);
  if (error || !data) throw new Error(`Could not sign download URL: ${error?.message}`);
  const res = await fetch(data.signedUrl);
  if (!res.ok || !res.body) throw new Error(`Storage download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(dest));
  const expected = Number(res.headers.get('content-length') ?? 0);
  const got = (await stat(dest)).size;
  console.log(`[storage] downloaded ${bucket}/${objectPath}: ${got} bytes (expected ${expected || 'unknown'})`);
  if (expected && got !== expected) throw new Error(`Storage download incomplete: ${got}/${expected} bytes`);
}

const SMALL_LIMIT = 40 * 1024 * 1024;

/** Upload a local file. Small files use the plain API; large files use resumable (TUS) uploads. */
export async function uploadFile(bucket: string, objectPath: string, file: string, contentType: string): Promise<void> {
  if (config.r2) {
    // multipart upload, streamed from disk
    await new Upload({
      client: r2(),
      params: { Bucket: config.r2.bucket, Key: r2Key(bucket, objectPath), Body: fs.createReadStream(file), ContentType: contentType },
      queueSize: 3, partSize: 8 * 1024 * 1024,
    }).done();
    return;
  }
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
  if (config.r2) {
    await r2().send(new DeleteObjectsCommand({ Bucket: config.r2.bucket, Delete: { Objects: paths.map((p) => ({ Key: r2Key(bucket, p) })), Quiet: true } }));
    return;
  }
  await sb.storage.from(bucket).remove(paths);
}
