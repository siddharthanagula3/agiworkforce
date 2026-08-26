import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

// The proxy gate for /tasks only checks that a session cookie NAME is present,
// so this is the first place the session is actually verified.
export default async function TasksLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();

  if (!userId) {
    return redirect('/login?redirectTo=/tasks');
  }

  return <>{children}</>;
}
