import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getRequestIdentity } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

// The proxy gate for /tasks only checks that a session cookie NAME is present,
// so this is the first place the session is actually verified.
export default async function TasksLayout({ children }: { children: ReactNode }) {
  const { subject: userId } = await getRequestIdentity();

  if (!userId) {
    return redirect('/login?redirectTo=/tasks');
  }

  return <>{children}</>;
}
