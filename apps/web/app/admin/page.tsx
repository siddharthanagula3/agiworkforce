import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { AdminConsolePage } from '@/features/admin';
import {
  PLATFORM_ADMIN_ENV_VAR,
  isPlatformAdmin,
} from '@/features/admin/lib/platform-admin-access';

export const metadata: Metadata = {
  title: 'Admin Readiness',
  description: 'Enterprise control-plane readiness for AGI teams and managed compute.',
};

export default async function AdminPage() {
  const { userId } = await auth();

  // The panels here drive platform-wide surfaces (security telemetry, account
  // ban, the trust-and-safety queue), so the console must match the API gate:
  // the org admin/owner role this segment's layout accepts is self-service and
  // only earns access to the org-scoped pages under /admin.
  if (!isPlatformAdmin(userId, process.env[PLATFORM_ADMIN_ENV_VAR])) {
    redirect('/');
  }

  return <AdminConsolePage />;
}
