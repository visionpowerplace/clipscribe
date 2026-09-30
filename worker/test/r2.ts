// R2 storage test against a local S3-compatible server (s3rver): presigned PUT (as the browser does), worker download/upload/delete, presigned GET.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import S3rver from 's3rver';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3-'));
const srv = new S3rver({ port: 4569, address: '127.0.0.1', silent: true, directory: dir, configureBuckets: [{ name: 'clipscribe', configs: [] }], allowMismatchedSignatures: false });
await srv.run();
Object.assign(process.env, {
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'x', OPENAI_API_KEY: 'x',
  R2_ENDPOINT: 'http://127.0.0.1:4569', R2_BUCKET: 'clipscribe', R2_ACCESS_KEY_ID: 'S3RVER', R2_SECRET_ACCESS_KEY: 'S3RVER',
  NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1',
});

// "web" side (presign), imported from the web project's helper
const web: any = await import('/home/claude/clipscribe/web/lib/r2.ts');
assert.ok(web.r2Enabled());
const big = Buffer.alloc(9 * 1024 * 1024, 7); // > one multipart part
const putUrl = await web.presignPut('uploads', 'user-1/abc.mp4');
const put = await fetch(putUrl, { method: 'PUT', body: big });
assert.equal(put.status, 200, await put.text());

// worker side: download the uploaded object, upload an output (multipart), presign a download, delete both
const st = await import('../src/storage.js');
const local = path.join(dir, 'dl.bin');
await st.downloadObject('uploads', 'user-1/abc.mp4', local);
assert.equal(fs.statSync(local).size, big.length);
await st.uploadFile('outputs', 'user-1/job/media.mp4', local, 'video/mp4');
const get = await fetch(await web.presignGet('outputs', 'user-1/job/media.mp4', 'my video.mp4'));
assert.equal(get.status, 200);
assert.equal((await get.arrayBuffer()).byteLength, big.length);
assert.ok((get.headers.get('content-disposition') ?? '').includes('my video.mp4'));
await st.removeObjects('uploads', ['user-1/abc.mp4']);
await st.removeObjects('outputs', ['user-1/job/media.mp4']);
const gone = await fetch(await web.presignGet('outputs', 'user-1/job/media.mp4'));
assert.equal(gone.status, 404);
console.log('R2 STORAGE PASSED');
await srv.close();
