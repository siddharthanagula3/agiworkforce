import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

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

  return children;
}
