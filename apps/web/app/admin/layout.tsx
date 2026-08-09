import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { assertAccountActive } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();

  if (!userId) {
    redirect('/login?redirectTo=/admin');
  }

  // Verify the authenticated user has admin or owner role via Clerk publicMetadata.
  // This matches the check in the API routes (security/route.ts verifyAdminAccess).
  const client = await clerkClient();
  const user = await client.users.getUser(userId as string);
  const meta = user.publicMetadata as Record<string, unknown> | null | undefined;
  const role = meta?.['role'];
  const isAdmin = role === 'admin' || role === 'owner';

  if (!isAdmin) {
    redirect('/');
  }

  // CRIT-014: role alone was the whole gate here, so a SUSPENDED admin — one
  // whose `profiles.account_status` was set by POST /api/admin/security
  // ?action=suspend-user, which deliberately does not revoke the Clerk session —
  // still rendered the console. `assertAccountActive` is the same read every
  // other authenticated surface performs via `getClerkAuthUser`; it fails closed
  // (503) when the status lookup itself fails, and both outcomes deny here.
  //
  // `redirect()` signals by throwing, so it must stay OUT of the try block.
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
