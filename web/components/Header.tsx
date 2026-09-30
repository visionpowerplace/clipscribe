import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function Header() {
  const name = process.env.NEXT_PUBLIC_APP_NAME || 'ClipScribe';
  let minutes: number | null = null;
  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      signedIn = true;
      const { data: p } = await supabase.from('profiles').select('sub_minutes,pack_minutes').eq('id', user.id).single();
      if (p) minutes = p.sub_minutes + p.pack_minutes;
    }
  } catch { /* env not configured yet */ }
  return (
    <header className="site">
      <div className="wrap">
        <Link href="/" className="brand">{name}</Link>
        <nav>
          <Link href="/pricing" className="hide-sm">Pricing</Link>
          {signedIn ? (
            <>
              <Link href="/dashboard">Dashboard</Link>
              {minutes !== null && <span className="pill" title="Minutes remaining">{minutes} min</span>}
              <form action="/auth/signout" method="post"><button className="btn sm" type="submit">Sign out</button></form>
            </>
          ) : (
            <Link href="/login" className="btn sm primary">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
