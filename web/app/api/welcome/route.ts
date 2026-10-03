import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { sendWelcomeIfNeeded } from '@/lib/email';

export async function POST() {
  const { user, res } = await requireUser();
  if (res) return res;
  await sendWelcomeIfNeeded(user!.id, user!.email);
  return NextResponse.json({ ok: true });
}
