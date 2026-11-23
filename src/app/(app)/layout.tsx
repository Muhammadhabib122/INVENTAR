import { redirect } from 'next/navigation';
import { getUser } from '@/server/auth';
import { AppProvider } from '@/components/AppContext';
import { Shell } from '@/components/Shell';
import { SyncProvider } from '@/lib/sync';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getUser();
  if (!me) redirect('/login');
  return (
    <AppProvider me={me}>
      <SyncProvider userId={me.id}>
        <Shell>{children}</Shell>
      </SyncProvider>
    </AppProvider>
  );
}
