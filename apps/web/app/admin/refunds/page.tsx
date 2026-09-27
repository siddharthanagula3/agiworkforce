import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import RefundOperationsPage from '@/features/admin/pages/RefundOperationsPage';
import {
  PLATFORM_ADMIN_ENV_VAR,
  isPlatformAdmin,
} from '@/features/admin/lib/platform-admin-access';
import { getRequestIdentity } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Refunds and disputes',
  description: 'Refund a payment through Stripe and decide the refund requests customers filed.',
};

export default async function AdminRefundsPage() {
  const { subject: userId } = await getRequestIdentity();
  if (!userId || !isPlatformAdmin(userId, process.env[PLATFORM_ADMIN_ENV_VAR])) {
    notFound();
  }
  return <RefundOperationsPage />;
}
