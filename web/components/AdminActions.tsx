'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AdminActions({ userId, addon, suspended, note }: { userId: string; addon: boolean; suspended: boolean; note: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [minutes, setMinutes] = useState('');
  const [why, setWhy] = useState('');
  const [noteText, setNoteText] = useState(note);
  const [reason, setReason] = useState('');

  async function call(body: Record<string, unknown>, okText: string) {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/admin/users/${userId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? 'Failed.' });
    setMsg({ ok: true, text: okText });
    router.refresh();
  }

  return (
    <div className="stack">
      {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <div>
        <label className="field">Add or remove minutes (use a minus sign to remove)</label>
        <div className="row">
          <input type="number" placeholder="e.g. 100 or -50" value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ maxWidth: 160 }} />
          <input placeholder="Reason (internal)" value={why} onChange={(e) => setWhy(e.target.value)} className="grow" />
          <button className="btn sm primary" disabled={busy || !minutes} onClick={() => call({ action: 'adjust_minutes', minutes: Number(minutes), note: why }, 'Minutes updated.').then(() => { setMinutes(''); setWhy(''); })}>Apply</button>
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>Downloads add-on <span className="muted small">(free access, separate from billing)</span>: <b>{addon ? 'On' : 'Off'}</b></span>
        <button className="btn sm" disabled={busy} onClick={() => call({ action: 'set_addon', value: !addon }, addon ? 'Add-on turned off.' : 'Add-on turned on.')}>{addon ? 'Turn off' : 'Turn on'}</button>
      </div>
      <div>
        {suspended ? (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>This account is suspended and cannot start new jobs.</span>
            <button className="btn sm" disabled={busy} onClick={() => call({ action: 'suspend', value: false }, 'Account reactivated.')}>Reactivate</button>
          </div>
        ) : (
          <div className="row">
            <input placeholder="Reason for suspending (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className="grow" />
            <button className="btn sm danger" disabled={busy} onClick={() => { if (confirm('Suspend this account? They will not be able to start new jobs.')) void call({ action: 'suspend', value: true, reason }, 'Account suspended.'); }}>Suspend account</button>
          </div>
        )}
      </div>
      <div>
        <label className="field">Private note</label>
        <textarea rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} style={{ width: '100%' }} />
        <button className="btn sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => call({ action: 'note', note: noteText }, 'Note saved.')}>Save note</button>
      </div>
    </div>
  );
}
