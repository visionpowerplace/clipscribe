import Link from 'next/link';
import Icon from '@/components/Icons';
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
        <Link href="/" className="brand"><span className="logo"><Icon name="wave" size={20} /></span>{name}</Link>
        <nav>
          <Link href="/pricing" className="nav hide-sm">Pricing</Link>
          {signedIn ? (
            <>
              <Link href="/dashboard" className="nav">Dashboard</Link>
              {minutes !== null && <Link href="/pricing" className="pill mins" title="Minutes remaining">{minutes} min left</Link>}
              <form action="/auth/signout" method="post"><button className="btn sm" type="submit">Sign out</button></form>
            </>
          ) : (
            <>
              <Link href="/login?mode=signin" className="btn">Log in</Link>
              <Link href="/login?mode=signup" className="btn primary">Sign up free</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
