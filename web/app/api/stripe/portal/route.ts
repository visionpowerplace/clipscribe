import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { appUrl, stripe } from '@/lib/stripe';

export async function POST() {
  const { user, supabase, res } = await requireUser();
  if (res) return res;
  const { data: profile } = await supabase.from('profiles').select('stripe_customer_id').eq('id', user!.id).single();
  if (!profile?.stripe_customer_id) return NextResponse.json({ error: 'No billing account yet.' }, { status: 400 });
  const session = await stripe().billingPortal.sessions.create({ customer: profile.stripe_customer_id, return_url: `${appUrl()}/dashboard` });
  return NextResponse.json({ url: session.url });
}
