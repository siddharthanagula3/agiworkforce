import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { OperatorDashboardPage } from '@/features/admin/pages/OperatorDashboardPage';
import {
  isPlatformAdmin,
  PLATFORM_ADMIN_ENV_VAR,
} from '@/features/admin/lib/platform-admin-access';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Operator dashboard',
  description: 'Feedback, accounts, and growth for platform operators.',
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/login?redirectTo=/operator');
  if (!isPlatformAdmin(userId, process.env[PLATFORM_ADMIN_ENV_VAR])) notFound();

  return <OperatorDashboardPage />;
}
