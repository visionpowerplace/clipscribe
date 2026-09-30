import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** For API routes: returns the signed-in user or a 401 response. */
export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null as null, supabase, res: NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) };
  return { user, supabase, res: null as null };
}
