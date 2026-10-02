import { NextResponse } from 'next/server';
import { adminFromRequest } from '@/lib/admin';
import { adminClient } from '@/lib/supabase/admin';

/** Refund a job's minutes (idempotent: the database refunds a job only once). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminFromRequest();
  if (!admin) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const sb = adminClient();
  const { data: job } = await sb.from('jobs').select('id,user_id,status').eq('id', id).maybeSingle();
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  if (b?.action === 'refund') {
    const { error } = await sb.rpc('refund_job_credits', { p_job: id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await sb.from('admin_actions').insert({ admin_email: admin, user_id: job.user_id, action: 'refund_job', detail: { job: id } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
