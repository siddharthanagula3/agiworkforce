'use client';

/**
 * /settings/team — opens the settings modal at the Team section.
 * The workspace and membership controls render inside WebSettingsModal.
 */
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

export default function TeamSettingsPage() {
  return <SettingsModalRedirect section="team" />;
}
