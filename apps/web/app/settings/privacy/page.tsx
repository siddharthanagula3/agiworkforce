'use client';

/**
 * /settings/privacy — opens the settings modal at the Privacy section.
 * The actual wired content (privacy toggles, data export, GDPR delete) renders inside WebSettingsModal.
 */
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

export default function PrivacySettingsPage() {
  return <SettingsModalRedirect section="privacy" />;
}
