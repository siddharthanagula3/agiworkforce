'use client';

import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

/** Deep-link into the account-backed Time and focus settings panel. */
export default function TimeFocusSettingsPage() {
  return <SettingsModalRedirect section="time-focus" />;
}
