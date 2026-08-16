import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { assertAccountActive } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();

  if (!userId) {
    return redirect('/login?redirectTo=/admin');
  }

  await requireCurrentTermsAcceptance(userId, '/admin');

  const client = await clerkClient();
  const user = await client.users.getUser(userId as string);
  const meta = user.publicMetadata as Record<string, unknown> | null | undefined;
  const role = meta?.['role'];
  const isAdmin = role === 'admin' || role === 'owner';

  if (!isAdmin) {
    redirect('/');
  }

  let accountActive = true;
  try {
    await assertAccountActive(userId as string);
  } catch (error) {
    accountActive = false;
    logger.warn({ error, userId }, 'Admin console denied: account is not active');
  }

  if (!accountActive) {
    redirect('/');
  }

  return children;
}
