import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Dashboard from '@/components/dashboard/Dashboard';

export const metadata = { title: 'Dashboard — SilentSpeak AI' };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <Dashboard
      user={{
        name:  session.user.name  ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      }}
    />
  );
}
