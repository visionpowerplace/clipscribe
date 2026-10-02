'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function RefundButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!confirm('Refund the minutes charged for this job?')) return;
    setBusy(true);
    const r = await fetch(`/api/admin/jobs/${jobId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'refund' }) });
    setBusy(false);
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error ?? 'Failed.'); return; }
    router.refresh();
  }
  return <button className="btn sm" onClick={go} disabled={busy}>Refund</button>;
}
