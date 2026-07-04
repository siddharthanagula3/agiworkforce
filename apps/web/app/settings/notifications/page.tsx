'use client';

/**
 * /settings/notifications — opens the settings modal at the Notifications section.
 * The actual wired content (browser/email/mobile-push toggles) renders inside
 * WebSettingsModal via features/settings/sections/NotificationsSection.
 */
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

export default function NotificationsSettingsPage() {
  return <SettingsModalRedirect section="notifications" />;
}
