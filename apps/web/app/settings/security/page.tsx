'use client';

/**
 * /settings/security — opens the settings modal at the Security section.
 * The actual wired content (2FA, session timeout, change password) renders
 * inside WebSettingsModal via SecuritySection.
 */
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

export default function SecuritySettingsPage() {
  return <SettingsModalRedirect section="security" />;
}
