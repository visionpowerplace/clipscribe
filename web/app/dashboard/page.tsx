import Link from 'next/link';
import JobList from '@/components/JobList';
import NewJobForm from '@/components/NewJobForm';
import Icon from '@/components/Icons';
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
  const sub = profile?.sub_minutes ?? 0;
  const pack = profile?.pack_minutes ?? 0;
  const total = sub + pack;
  const allowance = plan ? plan.minutes : 0;
  const pct = plan && allowance > 0 ? Math.min(100, Math.round((sub / allowance) * 100)) : 100;

  return (
    <div className="wrap" style={{ paddingTop: 30 }}>
      {sp.checkout === 'success' && <div className="alert ok" style={{ marginBottom: 16 }}>Payment received. Your minutes will appear in a few seconds.</div>}

      <div className="card glow dash-hero">
        <div>
          <div className="kicker"><Icon name="sparkle" size={14} /> Speech &amp; localization workspace</div>
          <h1>Media <span className="grad-text">transcription workspace</span></h1>
          <p className="muted" style={{ margin: 0, maxWidth: 560 }}>Transcribe video and audio, translate into 40 languages, generate AI summaries and export synchronized subtitles.</p>
        </div>
        <div className="usage">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="muted small">{plan ? `${plan.name} plan` : 'Free plan'}{profile?.downloads_addon ? ' · Downloads add-on' : ''}</span>
            <span className="pill mins">Active</span>
          </div>
          <div className="big">{total.toLocaleString()} <small>minutes left</small></div>
          <div className="progress" style={{ margin: '12px 0 10px' }}><div style={{ width: `${Math.max(4, pct)}%` }} /></div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted small">{plan ? `${sub.toLocaleString()} of ${allowance.toLocaleString()} plan min${pack ? ` + ${pack.toLocaleString()} pack` : ''}` : 'Pack & trial minutes never expire'}</span>
            <span className="row" style={{ gap: 8 }}>
              {profile?.stripe_customer_id && <ManageBillingButton />}
              <Link href="/pricing" className="btn sm primary">{plan ? 'Add minutes' : 'Upgrade'}</Link>
            </span>
          </div>
          {profile?.sub_status === 'past_due' && <p className="small" style={{ color: 'var(--bad)', margin: '10px 0 0' }}>Payment failed. Please update your card.</p>}
        </div>
      </div>

      <NewJobForm hasAddon={!!profile?.downloads_addon} />

      <div className="section-title"><span className="ico cyan" style={{ margin: 0, width: 36, height: 36, borderRadius: 11 }}><Icon name="text" size={18} /></span><h2>Your jobs</h2></div>
      <div className="card"><JobList initial={jobs ?? []} /></div>
    </div>
  );
}
