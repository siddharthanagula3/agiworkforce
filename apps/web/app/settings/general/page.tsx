'use client';

/**
 * /settings/general — opens the settings modal at the General section.
 * The actual wired content (profile + preferences) renders inside WebSettingsModal.
 */
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

export default function GeneralSettingsPage() {
  return <SettingsModalRedirect section="general" />;
}
