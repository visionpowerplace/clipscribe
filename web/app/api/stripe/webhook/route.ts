import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { PLANS, isAddonPrice, packByKey, planByPriceId } from '@/lib/plans';
import { stripe } from '@/lib/stripe';
import { adminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const iso = (unix?: number | null) => (unix ? new Date(unix * 1000).toISOString() : null);
const idOf = (x: string | { id: string } | null | undefined) => (typeof x === 'string' ? x : x?.id ?? null);
const ACTIVE = ['active', 'trialing'];

async function userIdForCustomer(customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await adminClient().from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle();
  return data?.id ?? null;
}

/** First price id on an invoice line (works across Stripe API versions). */
const linePrice = (line: any): string | undefined => line?.pricing?.price_details?.price ?? line?.price?.id;

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  }

  const db = adminClient();
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.client_reference_id || s.metadata?.user_id;
        if (!userId) break;
        if (s.mode === 'payment' && s.payment_status === 'paid' && s.metadata?.kind === 'pack') {
          const pack = packByKey(s.metadata.key);
          if (pack) await db.rpc('add_pack_minutes', { p_user: userId, p_minutes: pack.minutes, p_ref: `cs_${s.id}` });
        } else if (s.mode === 'subscription') {
          if (s.metadata?.kind === 'addon') {
            await db.from('profiles').update({ stripe_customer_id: idOf(s.customer as any), addon_subscription_id: idOf(s.subscription as any) }).eq('id', userId);
          } else {
            await db.from('profiles').update({ stripe_customer_id: idOf(s.customer as any), stripe_subscription_id: idOf(s.subscription as any) }).eq('id', userId);
          }
        }
        break;
      }

      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice;
        const userId = await userIdForCustomer(idOf(inv.customer as any));
        if (!userId) break;
        const line: any = inv.lines?.data?.[0];
        const priceId = linePrice(line);
        if (isAddonPrice(priceId)) {
          await db.from('profiles').update({ downloads_addon: true, addon_status: 'active', addon_period_end: iso(line?.period?.end) }).eq('id', userId);
          break;
        }
        const plan = planByPriceId(priceId);
        if (!plan) break;
        // Grant on the first payment and each renewal only (not on mid-cycle proration invoices).
        if (inv.billing_reason === 'subscription_create' || inv.billing_reason === 'subscription_cycle') {
          await db.rpc('grant_subscription_minutes', { p_user: userId, p_minutes: plan.minutes, p_ref: `inv_${inv.id}` });
        }
        await db.from('profiles').update({ plan: plan.key, sub_status: 'active', period_end: iso(line?.period?.end) }).eq('id', userId);
        break;
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const userId = await userIdForCustomer(idOf(inv.customer as any));
        if (!userId) break;
        if (isAddonPrice(linePrice(inv.lines?.data?.[0]))) await db.from('profiles').update({ addon_status: 'past_due' }).eq('id', userId);
        else await db.from('profiles').update({ sub_status: 'past_due' }).eq('id', userId);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id || (await userIdForCustomer(idOf(sub.customer as any)));
        if (!userId) break;
        const item: any = sub.items.data[0];
        const periodEnd = (sub as any).current_period_end ?? item?.current_period_end;

        if (isAddonPrice(item?.price?.id)) {
          await db.from('profiles').update({
            addon_subscription_id: sub.id, addon_status: sub.status, addon_period_end: iso(periodEnd),
            downloads_addon: ACTIVE.includes(sub.status),
          }).eq('id', userId);
          break;
        }

        const newPlan = planByPriceId(item?.price?.id);
        const { data: prof } = await db.from('profiles').select('plan,sub_minutes').eq('id', userId).single();
        await db.from('profiles').update({
          stripe_subscription_id: sub.id,
          sub_status: sub.status,
          period_end: iso(periodEnd),
          ...(newPlan && ACTIVE.includes(sub.status) ? { plan: newPlan.key } : {}),
        }).eq('id', userId);
        // Upgrade mid-cycle: give the difference in allowance right away.
        const oldPlan = PLANS.find((p) => p.key === prof?.plan);
        if (event.type === 'customer.subscription.updated' && newPlan && oldPlan && newPlan.minutes > oldPlan.minutes && ACTIVE.includes(sub.status)) {
          await db.rpc('grant_subscription_minutes', {
            p_user: userId,
            p_minutes: (prof?.sub_minutes ?? 0) + (newPlan.minutes - oldPlan.minutes),
            p_ref: `upg_${event.id}`,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id || (await userIdForCustomer(idOf(sub.customer as any)));
        if (!userId) break;
        const item: any = sub.items.data[0];
        if (isAddonPrice(item?.price?.id)) {
          await db.from('profiles').update({ downloads_addon: false, addon_status: 'canceled', addon_subscription_id: null }).eq('id', userId);
        } else {
          await db.from('profiles').update({ plan: 'free', sub_status: 'canceled', stripe_subscription_id: null, sub_minutes: 0 }).eq('id', userId);
        }
        break;
      }
    }
  } catch (e) {
    console.error('webhook handler error', event.type, e);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 }); // Stripe will retry
  }
  return NextResponse.json({ received: true });
}
