'use client';

import { EmbeddedAccountPage } from '@/features/settings/components/EmbeddedAccountPage';
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { useEmbeddedAccountPage } from '@shared/components/layout/EmbeddedPage';

export default function AccountSettingsPage() {
  return useEmbeddedAccountPage() ? (
    <EmbeddedAccountPage section="account" />
  ) : (
    <SettingsModalRedirect section="account" />
  );
}
