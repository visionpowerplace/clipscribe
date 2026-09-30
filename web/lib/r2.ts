import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Cloudflare R2 (S3-compatible) helpers. Enabled when R2_BUCKET and R2_ACCOUNT_ID (or R2_ENDPOINT) are set. */
export const r2Enabled = () => !!(process.env.R2_BUCKET && (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT) && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);

let client: S3Client | null = null;
function c(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto', forcePathStyle: true,
      endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    });
  }
  return client;
}
const bucket = () => process.env.R2_BUCKET!;
/** Objects are namespaced by kind so one R2 bucket holds both: "uploads/<path>" and "outputs/<path>". */
export const r2Key = (kind: 'uploads' | 'outputs', path: string) => `${kind}/${path}`;

export const presignPut = (kind: 'uploads' | 'outputs', path: string, expiresIn = 3600) =>
  getSignedUrl(c(), new PutObjectCommand({ Bucket: bucket(), Key: r2Key(kind, path) }), { expiresIn });

export const presignGet = (kind: 'uploads' | 'outputs', path: string, filename?: string, expiresIn = 300) =>
  getSignedUrl(
    c(),
    new GetObjectCommand({
      Bucket: bucket(), Key: r2Key(kind, path),
      ResponseContentDisposition: filename ? `attachment; filename="${filename.replace(/[^\w.\- ]+/g, '_')}"` : undefined,
    }),
    { expiresIn },
  );

export async function r2Remove(kind: 'uploads' | 'outputs', paths: string[]) {
  if (!paths.length) return;
  await c().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: paths.map((p) => ({ Key: r2Key(kind, p) })), Quiet: true } }));
}
