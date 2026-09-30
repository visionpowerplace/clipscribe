'use client';
import { useState } from 'react';

export function BuyButton({ kind, itemKey, label, primary }: { kind: 'plan' | 'pack' | 'addon'; itemKey: string; label: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    setBusy(true); setErr('');
    const r = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, key: itemKey }) });
    if (r.status === 401) { window.location.href = '/login?next=/pricing'; return; }
    const j = await r.json();
    if (j.url) window.location.href = j.url; else { setErr(j.error ?? 'Something went wrong.'); setBusy(false); }
  }
  return <div><button className={`btn ${primary ? 'primary' : ''}`} onClick={go} disabled={busy} style={{ width: '100%' }}>{busy ? 'Redirecting…' : label}</button>{err && <p className="small" style={{ color: 'var(--bad)', marginTop: 8 }}>{err}</p>}</div>;
}

export function ManageBillingButton() {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const r = await fetch('/api/stripe/portal', { method: 'POST' });
    const j = await r.json();
    if (j.url) window.location.href = j.url; else { alert(j.error ?? 'No billing account yet.'); setBusy(false); }
  }
  return <button className="btn sm" onClick={go} disabled={busy}>Manage billing</button>;
}
