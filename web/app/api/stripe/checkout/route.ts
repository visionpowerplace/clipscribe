import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { ADDON, packByKey, planByKey, priceIdFor } from '@/lib/plans';
import { appUrl, stripe } from '@/lib/stripe';
import { adminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const { user, supabase, res } = await requireUser();
  if (res) return res;
  const { kind, key } = await req.json().catch(() => ({}));

  const item = kind === 'plan' ? planByKey(key) : kind === 'pack' ? packByKey(key) : kind === 'addon' ? ADDON : undefined;
  const price = item ? priceIdFor(item) : '';
  if (!item || !price) return NextResponse.json({ error: 'That option is not available.' }, { status: 400 });

  const { data: profile } = await supabase.from('profiles').select('stripe_customer_id,stripe_subscription_id,sub_status,downloads_addon').eq('id', user!.id).single();
  if (kind === 'plan' && profile?.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(profile.sub_status ?? ''))
    return NextResponse.json({ error: 'You already have a subscription. Use "Manage billing" to change or cancel it.' }, { status: 409 });

  if (kind === 'addon' && profile?.downloads_addon)
    return NextResponse.json({ error: 'You already have the Downloads add-on.' }, { status: 409 });

  const s = stripe();
  let customer = profile?.stripe_customer_id ?? null;
  if (!customer) {
    const c = await s.customers.create({ email: user!.email!, metadata: { user_id: user!.id } });
    customer = c.id;
    await adminClient().from('profiles').update({ stripe_customer_id: customer }).eq('id', user!.id);
  }

  const meta = { user_id: user!.id, kind, key };
  const session = await s.checkout.sessions.create({
    customer,
    client_reference_id: user!.id,
    mode: kind === 'plan' || kind === 'addon' ? 'subscription' : 'payment',
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    metadata: meta,
    ...(kind === 'plan' || kind === 'addon' ? { subscription_data: { metadata: meta } } : { payment_intent_data: { metadata: meta } }),
    success_url: `${appUrl()}/dashboard?checkout=success&kind=${kind}`,
    cancel_url: `${appUrl()}/pricing?checkout=cancelled`,
  });
  return NextResponse.json({ url: session.url });
}
