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
 * Deliberately NOT under /admin. That tree is the enterprise console, whose
 * layout admits any organisation owner or admin, a customer's own role. This
 * page reads every account and can reset another user's usage, so it sits on
 * its own route with its own allowlist. Nesting it under /admin would also have
 * bounced a platform operator who holds no organisation role, which is the
 * normal case for whoever runs the platform.
 *
 * The API behind it checks the same allowlist again: a page that renders is not
 * authorisation, only the route is.
 */
export default async function AdminDashboardPage() {
  const { subject: userId } = await getRequestIdentity();
  if (!userId) redirect('/login?redirectTo=/operator');
  if (!isPlatformAdmin(userId, process.env[PLATFORM_ADMIN_ENV_VAR])) notFound();

  return <OperatorDashboardPage />;
}
