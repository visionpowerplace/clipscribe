import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { r2Enabled, r2Remove } from '@/lib/r2';
import { adminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const { supabase, res } = await requireUser();
  if (res) return res;
  const { data: job } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: transcripts } = await supabase.from('transcripts').select('lang,is_original,segments').eq('job_id', id);
  // never leak internal storage paths
  const { media_path, upload_path, worker_id, ...safe } = job;
  return NextResponse.json({ job: { ...safe, has_media: !!media_path }, transcripts: transcripts ?? [] });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const { user, supabase, res } = await requireUser();
  if (res) return res;
  const { data: job } = await supabase.from('jobs').select('id,status,media_path,upload_path,user_id').eq('id', id).maybeSingle();
  if (!job || job.user_id !== user!.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (job.status === 'processing') return NextResponse.json({ error: 'This job is still running.' }, { status: 409 });
  const admin = adminClient();
  if (r2Enabled()) {
    if (job.media_path) await r2Remove('outputs', [job.media_path]).catch(() => {});
    if (job.upload_path) await r2Remove('uploads', [job.upload_path]).catch(() => {});
  } else {
    if (job.media_path) await admin.storage.from('outputs').remove([job.media_path]);
    if (job.upload_path) await admin.storage.from('uploads').remove([job.upload_path]);
  }
  await admin.from('jobs').delete().eq('id', id).eq('user_id', user!.id);
  return NextResponse.json({ ok: true });
}
