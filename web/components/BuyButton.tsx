'use client';
import { useEffect, useRef, useState } from 'react';

export function BuyButton({ kind, itemKey, label, primary }: { kind: 'plan' | 'pack' | 'addon'; itemKey: string; label: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const tried = useRef(false);
  useEffect(() => {
    // Arrived via "/pricing?buy=plan:pro" (a landing-page card, or back from signup): start that checkout.
    const want = new URLSearchParams(window.location.search).get('buy');
    if (want === `${kind}:${itemKey}` && !tried.current) {
      tried.current = true;
      const u = new URL(window.location.href); u.searchParams.delete('buy');
      window.history.replaceState(null, '', u.pathname + u.search);
      go();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function go() {
    setBusy(true); setErr('');
    const r = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, key: itemKey }) });
    if (r.status === 401) { window.location.href = `/login?mode=signup&next=${encodeURIComponent(`/pricing?buy=${kind}:${itemKey}`)}`; return; }
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
