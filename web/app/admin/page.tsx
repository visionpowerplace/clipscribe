import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin';
import { ADDON, PLANS } from '@/lib/plans';
import { adminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Admin' };
export const dynamic = 'force-dynamic';

const day = 86_400_000;
const iso = (ms: number) => new Date(Date.now() - ms).toISOString();
const fmt = (n: number) => n.toLocaleString('en-US');
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ q?: string; plan?: string }> }) {
  await requireAdminPage();
  const { q = '', plan = '' } = await searchParams;
  const sb = adminClient();
  const count = async (build: (qb: any) => any) => (await build(sb.from('profiles').select('id', { count: 'exact', head: true }))).count ?? 0;

  let custQ = sb.from('profiles').select('id,email,plan,sub_status,sub_minutes,pack_minutes,downloads_addon,suspended,stripe_customer_id,created_at').order('created_at', { ascending: false }).limit(200);
  if (q.trim()) custQ = custQ.ilike('email', `%${q.trim().replace(/[%,]/g, '')}%`);
  if (plan) custQ = custQ.eq('plan', plan);

  const [totalUsers, paying, addonUsers, newWeek, suspended, custRes, jobs7Res, failedRes, planRows] = await Promise.all([
    count((x) => x),
    count((x) => x.neq('plan', 'free').in('sub_status', ['active', 'trialing', 'past_due'])),
    count((x) => x.eq('downloads_addon', true)),
    count((x) => x.gte('created_at', iso(7 * day))),
    count((x) => x.eq('suspended', true)),
    custQ,
    sb.from('jobs').select('user_id,status,platform,credit_cost,created_at').gte('created_at', iso(7 * day)).limit(10000),
    sb.from('jobs').select('id,user_id,title,platform,error,created_at').eq('status', 'failed').order('created_at', { ascending: false }).limit(15),
    sb.from('profiles').select('plan').neq('plan', 'free').in('sub_status', ['active', 'trialing', 'past_due']).limit(5000),
  ]);

  const customers = (custRes.data ?? []) as any[];
  const jobs7 = (jobs7Res.data ?? []) as any[];
  const failed = (failedRes.data ?? []) as any[];
  const emailById = new Map<string, string>(customers.map((c) => [c.id, c.email]));
  const missing = failed.map((f) => f.user_id).filter((id) => !emailById.has(id));
  if (missing.length) {
    const { data } = await sb.from('profiles').select('id,email').in('id', [...new Set(missing)]);
    (data ?? []).forEach((p: any) => emailById.set(p.id, p.email));
  }

  const mrr = ((planRows.data ?? []) as any[]).reduce((s, r) => s + (PLANS.find((p) => p.key === r.plan)?.price ?? 0), 0) + addonUsers * ADDON.price;
  const done = jobs7.filter((j) => j.status === 'completed').length;
  const bad = jobs7.filter((j) => j.status === 'failed').length;
  const finished = done + bad;
  const minutesUsed = jobs7.filter((j) => j.status === 'completed').reduce((s, j) => s + (j.credit_cost ?? 0), 0);
  const jobsToday = jobs7.filter((j) => j.created_at >= iso(day)).length;
  const perUser = new Map<string, number>();
  jobs7.forEach((j) => perUser.set(j.user_id, (perUser.get(j.user_id) ?? 0) + 1));
  const platforms = new Map<string, { ok: number; fail: number }>();
  jobs7.forEach((j) => {
    if (j.status !== 'completed' && j.status !== 'failed') return;
    const k = String(j.platform ?? 'unknown');
    const v = platforms.get(k) ?? { ok: 0, fail: 0 };
    if (j.status === 'completed') v.ok++; else v.fail++;
    platforms.set(k, v);
  });
  const platformRows = [...platforms.entries()].sort((a, b) => b[1].ok + b[1].fail - (a[1].ok + a[1].fail));

  const stat = (label: string, value: string, sub?: string) => (
    <div className="card stat" key={label}><b>{value}</b><span className="muted small">{label}</span>{sub && <div className="muted small">{sub}</div>}</div>
  );

  return (
    <div className="wrap" style={{ paddingTop: 30, paddingBottom: 60 }}>
      <div className="kicker" style={{ marginBottom: 8 }}>Owner area</div>
      <h2 style={{ marginBottom: 18 }}>Business overview</h2>
      <div className="stats" style={{ marginTop: 0 }}>
        {stat('Customers', fmt(totalUsers), `${fmt(newWeek)} new this week`)}
        {stat('Paying subscribers', fmt(paying), `${fmt(addonUsers)} with downloads add-on`)}
        {stat('Monthly recurring revenue', usd(mrr), 'from active plans + add-ons')}
        {stat('Jobs today', fmt(jobsToday), `${fmt(jobs7.length)} in 7 days`)}
        {stat('Success rate (7 days)', finished ? `${Math.round((done / finished) * 100)}%` : '–', `${fmt(bad)} failed of ${fmt(finished)}`)}
        {stat('Minutes used (7 days)', fmt(minutesUsed), suspended ? `${suspended} suspended account${suspended > 1 ? 's' : ''}` : undefined)}
      </div>

      <div className="section-title" style={{ marginTop: 34 }}><h2>Customers</h2></div>
      <form method="get" className="row" style={{ marginBottom: 12 }}>
        <input name="q" defaultValue={q} placeholder="Search by email" style={{ maxWidth: 320 }} />
        <select name="plan" defaultValue={plan} style={{ maxWidth: 180 }}>
          <option value="">All plans</option><option value="free">Free</option>
          {PLANS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
        </select>
        <button className="btn sm" type="submit">Filter</button>
        {(q || plan) && <Link className="btn sm" href="/admin">Clear</Link>}
      </form>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.92rem' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
            {['Customer', 'Plan', 'Minutes', 'Jobs (7d)', 'Joined', ''].map((h) => <th key={h} style={{ padding: '12px 14px', fontWeight: 650, borderBottom: '1px solid var(--border)' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px' }}>
                  <Link href={`/admin/customers/${c.id}`}>{c.email}</Link>
                  {c.suspended && <span className="status failed" style={{ marginLeft: 8 }}>Suspended</span>}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {PLANS.find((p) => p.key === c.plan)?.name ?? 'Free'}
                  {c.sub_status && c.plan !== 'free' ? <span className="muted small"> · {c.sub_status}</span> : null}
                  {c.downloads_addon ? <span className="pill" style={{ marginLeft: 8 }}>Downloads</span> : null}
                </td>
                <td style={{ padding: '10px 14px' }}>{fmt(c.sub_minutes + c.pack_minutes)}</td>
                <td style={{ padding: '10px 14px' }}>{perUser.get(c.id) ?? 0}</td>
                <td style={{ padding: '10px 14px' }} className="muted">{new Date(c.created_at).toLocaleDateString('en-US')}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}><Link className="btn sm" href={`/admin/customers/${c.id}`}>Manage</Link></td>
              </tr>
            ))}
            {!customers.length && <tr><td colSpan={6} style={{ padding: 18 }} className="muted">No customers match.</td></tr>}
          </tbody>
        </table>
      </div>
      {totalUsers > customers.length && !q && !plan && <p className="muted small" style={{ marginTop: 8 }}>Showing the newest {customers.length} of {fmt(totalUsers)}. Use search to find anyone else.</p>}

      <div className="grid g3" style={{ marginTop: 30, alignItems: 'start' }}>
        <div className="card">
          <h3>Platform health (7 days)</h3>
          {platformRows.length ? platformRows.map(([name, v]) => {
            const total = v.ok + v.fail;
            const pct = Math.round((v.ok / total) * 100);
            return (
              <div key={name} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{name}</span>
                <span className="small" style={{ color: pct >= 90 ? 'var(--ok)' : pct >= 70 ? 'var(--warn)' : 'var(--bad)' }}>{pct}% <span className="muted">({v.ok}/{total})</span></span>
              </div>
            );
          }) : <p className="muted small">No finished jobs yet.</p>}
        </div>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3>Recent failures</h3>
          {failed.length ? failed.map((f) => (
            <div key={f.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span><Link href={`/admin/customers/${f.user_id}`}>{emailById.get(f.user_id) ?? 'unknown'}</Link> <span className="muted small">· {f.platform ?? 'web'} · {new Date(f.created_at).toLocaleString('en-US')}</span></span>
              </div>
              <div className="small" style={{ color: '#fda4af' }}>{f.error ?? 'No error message'}</div>
            </div>
          )) : <p className="muted small">No failed jobs. 🎉</p>}
        </div>
      </div>
    </div>
  );
}
