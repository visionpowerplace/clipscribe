'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') ?? '/dashboard';
  const [mode, setMode] = useState<'signin' | 'signup'>(params.get('mode') === 'signin' ? 'signin' : 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(params.get('error') ? { kind: 'err', text: 'Sign-in link expired. Please try again.' } : null);
  const supabase = createClient();
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
      if (error) setMsg({ kind: 'err', text: error.message });
      else if (data.session) { await fetch('/api/welcome', { method: 'POST' }).catch(() => {}); window.location.href = next; }
      else setMsg({ kind: 'ok', text: 'Check your email to confirm your account, then sign in.' });
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ kind: 'err', text: error.message });
      else window.location.href = next;
    }
    setBusy(false);
  }

  async function magic() {
    if (!email) return setMsg({ kind: 'err', text: 'Enter your email first.' });
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    setMsg(error ? { kind: 'err', text: error.message } : { kind: 'ok', text: 'Magic link sent. Check your email.' });
    setBusy(false);
  }

  async function reset() {
    if (!email) return setMsg({ kind: 'err', text: 'Enter your email first.' });
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` });
    setMsg(error ? { kind: 'err', text: error.message } : { kind: 'ok', text: 'Password reset email sent.' });
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="tabs" role="tablist" style={{ width: '100%' }}>
        <button type="button" style={{ flex: 1 }} className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setMsg(null); }}>Sign up</button>
        <button type="button" style={{ flex: 1 }} className={mode === 'signin' ? 'on' : ''} onClick={() => { setMode('signin'); setMsg(null); }}>Log in</button>
      </div>
      <div>
        <h2>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
        <p className="muted" style={{ margin: 0 }}>{mode === 'signup' ? (next.startsWith('/pricing') ? 'Create your free account, then we take you straight to checkout.' : 'You get 10 free minutes. No card needed.') : 'Sign in to continue.'}</p>
      </div>
      <div><label className="field" htmlFor="email">Email</label><input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div><label className="field" htmlFor="pw">Password</label><div style={{ position: 'relative' }}>
          <input id="pw" type={showPw ? 'text' : 'password'} required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 64 }} />
          <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, color: 'var(--muted, #9aa0b4)', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '6px 8px' }}>{showPw ? 'Hide' : 'Show'}</button>
        </div></div>
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
      <button className="btn primary" disabled={busy} type="submit">{mode === 'signup' ? 'Create account' : 'Sign in'}</button>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn sm" onClick={magic} disabled={busy}>Email me a magic link</button>
        {mode === 'signin' && <button type="button" className="btn sm" onClick={reset}>Forgot password?</button>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {mode === 'signup' ? 'Already have an account? ' : 'New here? '}
        <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'signup' ? 'signin' : 'signup'); setMsg(null); }}>{mode === 'signup' ? 'Sign in' : 'Create an account'}</a>
        {' · '}By continuing you agree to our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.
      </p>
    </form>
  );
}
