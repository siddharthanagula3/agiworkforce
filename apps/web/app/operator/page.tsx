import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { OperatorDashboardPage } from '@/features/admin/pages/OperatorDashboardPage';
import {
  isPlatformAdmin,
  PLATFORM_ADMIN_ENV_VAR,
} from '@/features/admin/lib/platform-admin-access';
import { getRequestIdentity } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Operator dashboard',
  description: 'Feedback, accounts, and growth for platform operators.',
  robots: { index: false, follow: false },
};

/**
 * Not under /admin, whose layout admits any organisation owner or admin. The API
 * checks the same allowlist again: rendering this page is not authorisation.
 */
export default async function AdminDashboardPage() {
  const { subject: userId } = await getRequestIdentity();
  if (!userId) redirect('/login?redirectTo=/operator');
  if (!isPlatformAdmin(userId, process.env[PLATFORM_ADMIN_ENV_VAR])) notFound();

  return <OperatorDashboardPage />;
}
