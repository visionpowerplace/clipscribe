import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

const ALLOWED = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'wma', 'mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', '3gp', 'mpeg', 'mpg']);
// Supabase's free plan caps every object at 50 MB. Raise MAX_UPLOAD_MB (and Supabase's global storage limit) on a paid plan.
const MAX_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || 50);
const MAX_BYTES = MAX_MB * 1024 * 1024;

export async function POST(req: Request) {
  const { user, res } = await requireUser();
  if (res) return res;
  const { filename, size } = await req.json().catch(() => ({}));
  const ext = String(filename ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED.has(ext)) return NextResponse.json({ error: 'Unsupported file type. Upload common audio or video files (mp3, wav, m4a, mp4, mov, mkv, webm…).' }, { status: 400 });
  if (typeof size === 'number' && size > MAX_BYTES) return NextResponse.json({ error: `This file is larger than the ${MAX_MB} MB upload limit. Paste a link instead, or trim/compress the file (an audio-only export is much smaller).` }, { status: 400 });

  const path = `${user!.id}/${randomUUID()}.${ext}`;
  const { data, error } = await adminClient().storage.from('uploads').createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: 'Could not start the upload. Please try again.' }, { status: 500 });
  return NextResponse.json({ path: data.path, token: data.token });
}
