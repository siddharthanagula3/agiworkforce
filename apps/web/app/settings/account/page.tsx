'use client';

/**
 * /settings/account — opens the settings modal at the Account section.
 * The actual wired content (sessions, org ID, danger zone) renders inside WebSettingsModal.
 */
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

export default function AccountSettingsPage() {
  return <SettingsModalRedirect section="account" />;
}
