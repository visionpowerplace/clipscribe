import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

/** Ownership is checked through RLS, then we redirect to a short-lived signed URL that forces download. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const { supabase, res } = await requireUser();
  if (res) return res;
  const { data: job } = await supabase.from('jobs').select('media_path,media_filename,status').eq('id', id).maybeSingle();
  if (!job?.media_path) return NextResponse.json({ error: 'File not available (it may have expired).' }, { status: 404 });
  const { data, error } = await adminClient().storage.from('outputs').createSignedUrl(job.media_path, 300, { download: job.media_filename ?? true });
  if (error || !data) return NextResponse.json({ error: 'Could not create download link.' }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
