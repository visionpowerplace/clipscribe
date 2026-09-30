import Stripe from 'stripe';

let s: Stripe | null = null;
export function stripe(): Stripe {
  if (!s) s = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return s;
}
export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
