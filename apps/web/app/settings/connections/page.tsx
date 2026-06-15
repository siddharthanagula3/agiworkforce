'use client';

/**
 * /settings/connections — opens the settings modal at the Connectors section.
 */
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

export default function ConnectionsSettingsPage() {
  return <SettingsModalRedirect section="connectors" />;
}
