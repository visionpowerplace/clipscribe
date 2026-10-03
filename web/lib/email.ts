import { adminClient } from '@/lib/supabase/admin';
import { appUrl } from '@/lib/stripe';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const APP = process.env.NEXT_PUBLIC_APP_NAME || 'ClipScribe';
const SUPPORT = 'support@theclipscribe.com';

/** Branded wrapper. `body` is trusted HTML built by the templates below (user text is escaped there). */
function layout(heading: string, body: string, cta?: { label: string; href: string }) {
  const button = cta ? `<p style="margin:26px 0"><a href="${esc(cta.href)}" style="background:#6d5dfc;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>` : '';
  return `<div style="background:#f4f4f8;padding:28px 12px;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
<div style="max-width:540px;margin:auto;background:#fff;border-radius:14px;padding:30px;color:#1b1b2a;line-height:1.55">
<div style="font-size:20px;font-weight:700;color:#6d5dfc;margin-bottom:18px">${esc(APP)}</div>
<h1 style="font-size:22px;margin:0 0 14px">${esc(heading)}</h1>${body}${button}
<p style="color:#6b6b80;font-size:13px;margin:22px 0 0">Questions? Just reply to this email or write to <a href="mailto:${SUPPORT}" style="color:#6d5dfc">${SUPPORT}</a>.</p>
</div></div>`;
}

/** Never throws: a failed email must not break signup or a payment webhook. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from || !to) return false;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: SUPPORT, subject, html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.warn('[email] Resend', res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e: any) {
    console.warn('[email] failed:', e?.message ?? e);
    return false;
  }
}

/** Send once per `ref` (Stripe retries webhooks; this keeps customers from getting duplicates). */
async function sendOnce(ref: string, kind: string, to: string, subject: string, html: string) {
  const db = adminClient();
  const { error } = await db.from('email_log').insert({ ref, kind });
  if (error) return; // already sent (or log unavailable): skip rather than risk a duplicate
  const ok = await sendEmail(to, subject, html);
  if (!ok) await db.from('email_log').delete().eq('ref', ref); // allow a retry to send it
}

export async function sendWelcomeIfNeeded(userId: string, email?: string | null) {
  if (!email) return;
  const db = adminClient();
  const { data } = await db.from('profiles').update({ welcome_sent_at: new Date().toISOString() }).eq('id', userId).is('welcome_sent_at', null).select('id');
  if (!data?.length) return;
  const ok = await sendEmail(email, `Welcome to ${APP}: your 10 free minutes are ready`, layout(
    `Welcome to ${APP}!`,
    `<p>Your account is ready and <strong>10 free minutes</strong> are already in it.</p>
<p>Here is how to get started:</p>
<ol style="padding-left:20px"><li>Paste a video or audio link, or upload a file.</li><li>Choose a transcript, translations, or an AI summary.</li><li>Read, copy, or export as TXT, SRT, VTT or JSON.</li></ol>
<p>Need more minutes later? Plans start at $9 a month and minute packs never expire.</p>`,
    { label: 'Open your dashboard', href: `${appUrl()}/dashboard` },
  ));
  if (!ok) await db.from('profiles').update({ welcome_sent_at: null }).eq('id', userId);
}

const money = (cents?: number | null, cur?: string | null) =>
  cents == null ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: (cur || 'usd').toUpperCase() }).format(cents / 100);

export async function sendPurchaseEmail(o: {
  ref: string; to?: string | null; title: string; detail: string; amountCents?: number | null; currency?: string | null;
  receiptUrl?: string | null; balance?: number | null; footnote?: string;
}) {
  if (!o.to) return;
  const rows = [
    `<tr><td style="padding:6px 0;color:#6b6b80">Item</td><td style="padding:6px 0;text-align:right"><strong>${esc(o.title)}</strong></td></tr>`,
    o.amountCents != null ? `<tr><td style="padding:6px 0;color:#6b6b80">Amount paid</td><td style="padding:6px 0;text-align:right"><strong>${esc(money(o.amountCents, o.currency))}</strong></td></tr>` : '',
    o.balance != null ? `<tr><td style="padding:6px 0;color:#6b6b80">Minutes available now</td><td style="padding:6px 0;text-align:right"><strong>${o.balance.toLocaleString()}</strong></td></tr>` : '',
  ].join('');
  const body = `<p>${esc(o.detail)}</p><table style="width:100%;border-collapse:collapse;border-top:1px solid #e6e6ef;border-bottom:1px solid #e6e6ef;margin:14px 0">${rows}</table>
${o.receiptUrl ? `<p><a href="${esc(o.receiptUrl)}" style="color:#6d5dfc">View or download your receipt</a></p>` : '<p style="color:#6b6b80;font-size:14px">Stripe also emails your official receipt separately.</p>'}
${o.footnote ? `<p style="color:#6b6b80;font-size:14px">${esc(o.footnote)}</p>` : ''}`;
  await sendOnce(o.ref, 'purchase', o.to, `${APP}: ${o.title} confirmed`, layout('Thank you for your purchase', body, { label: 'Go to your dashboard', href: `${appUrl()}/dashboard` }));
}
