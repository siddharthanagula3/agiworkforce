'use client';

import { EmbeddedAccountPage } from '@/features/settings/components/EmbeddedAccountPage';
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { useEmbeddedAccountPage } from '@shared/components/layout/EmbeddedPage';

export default function SecuritySettingsPage() {
  return useEmbeddedAccountPage() ? (
    <EmbeddedAccountPage section="security" />
  ) : (
    <SettingsModalRedirect section="security" />
  );
}
