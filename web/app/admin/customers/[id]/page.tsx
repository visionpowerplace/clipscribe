import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminActions from '@/components/AdminActions';
import RefundButton from '@/components/RefundButton';
import { requireAdminPage } from '@/lib/admin';
import { PLANS } from '@/lib/plans';
import { adminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Customer · Admin' };
export const dynamic = 'force-dynamic';
const fmt = (n: number) => n.toLocaleString('en-US');
const when = (s: string) => new Date(s).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export default async function Customer({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const sb = adminClient();
  const { data: p } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
  if (!p) notFound();
  const [{ data: jobs }, { data: ledger }, { data: actions }, { count: jobCount }] = await Promise.all([
    sb.from('jobs').select('id,title,platform,status,error,duration_seconds,credit_cost,credits_charged,source_type,created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(30),
    sb.from('credit_ledger').select('id,delta,reason,created_at,meta').eq('user_id', id).order('created_at', { ascending: false }).limit(30),
    sb.from('admin_actions').select('id,admin_email,action,detail,created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(15),
    sb.from('jobs').select('id', { count: 'exact', head: true }).eq('user_id', id),
  ]);
  const plan = PLANS.find((x) => x.key === p.plan);
  const row = (k: string, v: React.ReactNode) => (
    <div className="row" style={{ justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}><span className="muted">{k}</span><span>{v}</span></div>
  );

  return (
    <div className="wrap" style={{ paddingTop: 30, paddingBottom: 60 }}>
      <Link href="/admin" className="small">← All customers</Link>
      <h2 style={{ margin: '8px 0 18px' }}>{p.email} {p.suspended && <span className="status failed">Suspended</span>}</h2>
      <div className="grid g3" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>Account</h3>
          {row('Plan', `${plan?.name ?? 'Free'}${p.sub_status && p.plan !== 'free' ? ` · ${p.sub_status}` : ''}`)}
          {row('Plan minutes', fmt(p.sub_minutes))}
          {row('Pack / trial minutes', fmt(p.pack_minutes))}
          {row('Downloads add-on', p.downloads_addon ? `On${p.addon_status ? ` · ${p.addon_status}` : ''}` : 'Off')}
          {row('Renews', p.period_end ? new Date(p.period_end).toLocaleDateString('en-US') : '–')}
          {row('Joined', when(p.created_at))}
          {row('Total jobs', fmt(jobCount ?? 0))}
          {row('Stripe', p.stripe_customer_id ? <a href={`https://dashboard.stripe.com/customers/${p.stripe_customer_id}`} target="_blank" rel="noreferrer">Open in Stripe ↗</a> : 'No billing account')}
          {p.suspended && row('Suspended because', p.suspended_reason || '–')}
        </div>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3>Controls</h3>
          <AdminActions userId={p.id} addon={!!p.downloads_addon} suspended={!!p.suspended} note={p.admin_note ?? ''} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3>Recent jobs</h3>
        {(jobs ?? []).length ? (jobs as any[]).map((j) => (
          <div key={j.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>{j.title ?? 'Untitled'} <span className="muted small">· {j.platform ?? j.source_type} · {j.duration_seconds ? `${Math.round(j.duration_seconds / 60)} min` : '–'} · {when(j.created_at)}</span></span>
              <span className="row" style={{ gap: 8 }}>
                {j.credit_cost ? <span className="muted small">{j.credit_cost} min{j.credits_charged ? '' : ' (refunded)'}</span> : null}
                <span className={`status ${j.status}`}>{j.status}</span>
                {j.credits_charged && <RefundButton jobId={j.id} />}
              </span>
            </div>
            {j.error && <div className="small" style={{ color: '#fda4af' }}>{j.error}</div>}
          </div>
        )) : <p className="muted small">No jobs yet.</p>}
      </div>

      <div className="grid g3" style={{ marginTop: 18, alignItems: 'start' }}>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3>Minutes history</h3>
          {(ledger ?? []).length ? (ledger as any[]).map((l) => (
            <div key={l.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span>{l.reason}{l.meta?.note ? <span className="muted small"> · {l.meta.note}</span> : null} <span className="muted small">· {when(l.created_at)}</span></span>
              <b style={{ color: l.delta >= 0 ? 'var(--ok)' : 'var(--text)' }}>{l.delta > 0 ? '+' : ''}{fmt(l.delta)}</b>
            </div>
          )) : <p className="muted small">No activity.</p>}
        </div>
        <div className="card">
          <h3>Admin activity</h3>
          {(actions ?? []).length ? (actions as any[]).map((a) => (
            <div key={a.id} className="small" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <b>{a.action}</b> <span className="muted">· {when(a.created_at)}</span>
              {a.detail && Object.keys(a.detail).length ? <div className="muted">{JSON.stringify(a.detail)}</div> : null}
            </div>
          )) : <p className="muted small">Nothing yet.</p>}
        </div>
      </div>
    </div>
  );
}
