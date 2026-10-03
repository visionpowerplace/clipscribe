'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const MESSAGES: Record<string, string> = {
  plan: 'Thank you! Your subscription is active and your monthly minutes are being added.',
  pack: 'Thank you! Your minutes are being added to your account.',
  addon: 'Thank you! The Downloads add-on is being activated.',
};

/** Shown after Stripe Checkout. Refreshes the page for ~30s so the new balance appears once the webhook lands. */
export default function CheckoutBanner({ kind }: { kind?: string }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => { router.refresh(); if (++n >= 10) clearInterval(t); }, 3000);
    return () => clearInterval(t);
  }, [router]);
  return (
    <div className="alert ok" style={{ marginBottom: 16 }}>
      {MESSAGES[kind ?? ''] ?? 'Thank you! Your payment was received.'} A receipt is on its way to your email. Questions? <a href="mailto:support@theclipscribe.com">support@theclipscribe.com</a>
    </div>
  );
}
