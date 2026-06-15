'use client';

/**
 * /settings/usage — opens the settings modal at the Usage section.
 * The actual wired content (credit bars, analytics) renders inside WebSettingsModal.
 */
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

export default function UsageSettingsPage() {
  return <SettingsModalRedirect section="usage" />;
}
