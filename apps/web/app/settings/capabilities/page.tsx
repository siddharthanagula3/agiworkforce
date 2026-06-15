'use client';

/**
 * /settings/capabilities — opens the settings modal at the Capabilities section.
 * The actual wired content (memory, tools, artifacts toggles) renders inside WebSettingsModal.
 */
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

export default function CapabilitiesSettingsPage() {
  return <SettingsModalRedirect section="capabilities" />;
}
