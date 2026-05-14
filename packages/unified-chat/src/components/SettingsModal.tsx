import { useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';

export function SettingsModal() {
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const settingsTab = useUIStore((s) => s.settingsTab);
  const closeSettings = useUIStore((s) => s.closeSettings);

  useEffect(() => {
    if (settingsOpen) {
      window.dispatchEvent(
        new CustomEvent('chat:action', {
          detail: { type: 'open-settings', tab: settingsTab || 'general' },
        }),
      );
      closeSettings();
    }
  }, [settingsOpen, settingsTab, closeSettings]);

  return null;
}
