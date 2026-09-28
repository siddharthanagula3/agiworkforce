import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import PluginModerationPage from '@/features/admin/pages/PluginModerationPage';
import {
  PLATFORM_ADMIN_ENV_VAR,
  isPlatformAdmin,
} from '@/features/admin/lib/platform-admin-access';
import { getRequestIdentity } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Plugin moderation',
  description:
    'Review registry plugins and publish, deprecate, suspend or roll back their versions.',
};

export default async function AdminPluginsPage() {
  const { subject: userId } = await getRequestIdentity();
  if (!userId || !isPlatformAdmin(userId, process.env[PLATFORM_ADMIN_ENV_VAR])) {
    notFound();
  }
  return <PluginModerationPage />;
}
