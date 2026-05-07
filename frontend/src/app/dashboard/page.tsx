'use client';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Dashboard from '@/components/dashboard/Dashboard';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'loading' || !session) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg-0)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--fg-3)',
      }}>
        LOADING…
      </div>
    );
  }

  const u = session.user;
  return (
    <Dashboard
      user={{
        name:  u?.name  ?? null,
        email: u?.email ?? null,
        image: u?.image ?? null,
      }}
    />
  );
}
