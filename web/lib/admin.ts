import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Owner accounts: comma-separated emails in ADMIN_EMAILS. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}
export const isAdminEmail = (email?: string | null) => !!email && adminEmails().includes(email.toLowerCase());

/** For admin pages: the signed-in admin, otherwise a 404 (the admin area is not advertised to anyone else). */
export async function requireAdminPage(): Promise<{ email: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) notFound();
  return { email: user.email! };
}

/** For admin API routes: returns the admin's email or null. */
export async function adminFromRequest(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user && isAdminEmail(user.email) ? user.email! : null;
}
