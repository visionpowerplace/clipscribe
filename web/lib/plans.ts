/**
 * Plans and minute packs. Edit prices/minutes here AND create matching Stripe Prices,
 * then put their IDs in the STRIPE_PRICE_* env vars. Prices shown on the site come from here.
 * Sizing check: transcription costs you ≈ $0.006 per minute (Whisper API) + small translation cost,
 * so keep price-per-minute comfortably above ~$0.02 to leave margin for downloads, storage and support.
 */
export interface Plan { key: string; name: string; price: number; minutes: number; env: string; blurb: string }
export interface Pack { key: string; minutes: number; price: number; env: string }

export const PLANS: Plan[] = [
  { key: 'starter', name: 'Starter', price: 9, minutes: 300, env: 'STRIPE_PRICE_STARTER', blurb: 'For occasional use' },
  { key: 'pro', name: 'Pro', price: 29, minutes: 1200, env: 'STRIPE_PRICE_PRO', blurb: 'For creators and teams' },
  { key: 'business', name: 'Business', price: 79, minutes: 4000, env: 'STRIPE_PRICE_BUSINESS', blurb: 'For agencies and heavy use' },
];

export const PACKS: Pack[] = [
  { key: 'pack100', minutes: 100, price: 5, env: 'STRIPE_PRICE_PACK_100' },
  { key: 'pack500', minutes: 500, price: 20, env: 'STRIPE_PRICE_PACK_500' },
  { key: 'pack2000', minutes: 2000, price: 60, env: 'STRIPE_PRICE_PACK_2000' },
];

/** Optional paid add-on that unlocks downloading video/audio from links (separate monthly subscription). */
export const ADDON = { key: 'downloads', name: 'Downloads add-on', price: 9, env: 'STRIPE_PRICE_ADDON_DOWNLOADS', blurb: 'Save video (MP4) or audio (MP3) from supported links' };

export const priceIdFor = (item: { env: string }) => process.env[item.env] || '';
export const planByPriceId = (id?: string | null) => (id ? PLANS.find((p) => priceIdFor(p) === id) : undefined);
export const isAddonPrice = (id?: string | null) => !!id && priceIdFor(ADDON) === id;
export const planByKey = (k: string) => PLANS.find((p) => p.key === k);
export const packByKey = (k: string) => PACKS.find((p) => p.key === k);
