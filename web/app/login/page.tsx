import { Suspense } from 'react';
import LoginForm from '@/components/LoginForm';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="wrap narrow" style={{ paddingTop: 48 }}>
      <Suspense><LoginForm /></Suspense>
    </div>
  );
}
