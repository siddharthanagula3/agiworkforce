'use client';

/**
 * /settings/memory — opens the settings modal at the Memory section.
 * The actual wired content (MemoryEditor) renders inside WebSettingsModal.
 */
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

export default function MemorySettingsPage() {
  return <SettingsModalRedirect section="memory" />;
}
