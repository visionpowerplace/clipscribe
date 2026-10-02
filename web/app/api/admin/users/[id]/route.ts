import { NextResponse } from 'next/server';
import { adminFromRequest } from '@/lib/admin';
import { adminClient } from '@/lib/supabase/admin';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminFromRequest();
  if (!admin) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b || typeof b.action !== 'string') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const sb = adminClient();
  const log = (action: string, detail: Record<string, unknown>) =>
    sb.from('admin_actions').insert({ admin_email: admin, user_id: id, action, detail });

  const { data: profile } = await sb.from('profiles').select('id,email').eq('id', id).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });

  switch (b.action) {
    case 'adjust_minutes': {
      const delta = Math.trunc(Number(b.minutes));
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100000) return NextResponse.json({ error: 'Enter a non-zero number of minutes (up to 100,000).' }, { status: 400 });
      const note = String(b.note ?? '').slice(0, 200);
      const { data, error } = await sb.rpc('admin_adjust_minutes', { p_user: id, p_delta: delta, p_note: note });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await log('adjust_minutes', { requested: delta, applied: data, note });
      return NextResponse.json({ ok: true, applied: data });
    }
    case 'set_addon': {
      const on = b.value === true;
      const { error } = await sb.from('profiles').update({ downloads_addon: on }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await log('set_addon', { value: on });
      return NextResponse.json({ ok: true });
    }
    case 'suspend': {
      const on = b.value === true;
      const reason = on ? String(b.reason ?? '').slice(0, 200) : null;
      const { error } = await sb.from('profiles').update({ suspended: on, suspended_reason: reason }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await log(on ? 'suspend' : 'unsuspend', { reason });
      return NextResponse.json({ ok: true });
    }
    case 'note': {
      const note = String(b.note ?? '').slice(0, 2000);
      const { error } = await sb.from('profiles').update({ admin_note: note }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await log('note', {});
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
}
