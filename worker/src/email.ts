import { config } from './config.js';
import { sb } from './db.js';
import { Job } from './types.js';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const emailEnabled = () => !!(config.resendKey && config.emailFrom);

/** Email the user when a long job finishes. Never throws: a failed email must not fail the job. */
export async function notifyJobDone(job: Job, outcome: { ok: true; title: string } | { ok: false; message: string }): Promise<void> {
  try {
    if (!emailEnabled()) return;
    const waited = job.created_at ? (Date.now() - new Date(job.created_at).getTime()) / 1000 : Infinity;
    if (waited < config.emailMinSeconds) return;
    const { data: prof } = await sb.from('profiles').select('email').eq('id', job.user_id).single();
    const to = (prof as any)?.email as string | undefined;
    if (!to) return;
    const link = config.appUrl ? `${config.appUrl}/jobs/${job.id}` : '';
    const name = esc(config.appName);
    const subject = outcome.ok ? `Your transcript is ready: ${outcome.title}`.slice(0, 150) : `${config.appName}: we couldn't finish your job`;
    const body = outcome.ok
      ? `<p>Your job <strong>${esc(outcome.title)}</strong> has finished.</p>${link ? `<p><a href="${esc(link)}">Open your results</a></p>` : ''}`
      : `<p>We couldn't finish your job.</p><p>${esc(outcome.message)}</p><p>The minutes for this job were refunded to your account.</p>${link ? `<p><a href="${esc(link)}">View the job</a></p>` : ''}`;
    const res = await fetch(`${process.env.RESEND_API_URL || 'https://api.resend.com'}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: config.emailFrom, to: [to], subject,
        html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;line-height:1.5">${body}<p style="color:#888;font-size:12px">Sent by ${name} because you started this job.</p></div>`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.warn(`[email] Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } catch (e: any) {
    console.warn('[email] failed:', e?.message ?? e);
  }
}
