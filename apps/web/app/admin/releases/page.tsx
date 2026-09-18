import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import ReleaseDashboardPage from '@/features/admin/pages/ReleaseDashboardPage';
import {
  PLATFORM_ADMIN_ENV_VAR,
  isPlatformAdmin,
} from '@/features/admin/lib/platform-admin-access';
import { getRequestIdentity } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Releases',
  description: 'What production is serving, and every promotion, rollback and drill recorded.',
};

// The admin segment also admits org admins, who have no business reading the
// platform release trail. This page is operator only.
export default async function AdminReleasesPage() {
  const { subject: userId } = await getRequestIdentity();
  if (!userId || !isPlatformAdmin(userId, process.env[PLATFORM_ADMIN_ENV_VAR])) {
    notFound();
  }
  return <ReleaseDashboardPage />;
}
