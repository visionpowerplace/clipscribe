import Link from 'next/link';
import JobList from '@/components/JobList';
import NewJobForm from '@/components/NewJobForm';
import { ManageBillingButton } from '@/components/BuyButton';
import { createClient } from '@/lib/supabase/server';
import { PLANS } from '@/lib/plans';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: profile }, { data: jobs }] = await Promise.all([
    supabase.from('profiles').select('plan,sub_minutes,pack_minutes,stripe_customer_id,sub_status,downloads_addon').eq('id', user!.id).single(),
    supabase.from('jobs').select('id,title,platform,thumbnail,status,stage,progress,error,duration_seconds,target_languages,created_at').order('created_at', { ascending: false }).limit(50),
  ]);
  const plan = PLANS.find((p) => p.key === profile?.plan);
  const total = (profile?.sub_minutes ?? 0) + (profile?.pack_minutes ?? 0);

  return (
    <div className="wrap" style={{ paddingTop: 32 }}>
      {sp.checkout === 'success' && <div className="alert ok" style={{ marginBottom: 16 }}>Payment received — your minutes will appear in a few seconds.</div>}
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Dashboard</h1>
          <span className="muted small">{plan ? `${plan.name} plan` : 'Free plan'} · <strong>{total}</strong> minutes left{profile?.downloads_addon ? ' · Downloads add-on active' : ''}{profile?.sub_status === 'past_due' ? ' · payment failed — update your card' : ''}</span>
        </div>
        <div className="row">
          {profile?.stripe_customer_id && <ManageBillingButton />}
          <Link href="/pricing" className="btn sm primary">{plan ? 'Add minutes' : 'Upgrade'}</Link>
        </div>
      </div>
      <NewJobForm hasAddon={!!profile?.downloads_addon} />
      <h2 style={{ marginTop: 36 }}>Your jobs</h2>
      <div className="card"><JobList initial={jobs ?? []} /></div>
    </div>
  );
}
