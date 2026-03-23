import { useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';

interface UseKeyboardOptions {
  /** When false the hook registers no listeners. Defaults to true. */
  enabled?: boolean;
}

export function useKeyboard({ enabled = true }: UseKeyboardOptions = {}) {
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const openSettings = useUIStore((s) => s.openSettings);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }

      if (meta && e.key === ',') {
        e.preventDefault();
        openSettings();
      }

      if (meta && e.key === '[') {
        e.preventDefault();
        toggleSidebar();
      }

      if (meta && e.key === 'd') {
        e.preventDefault();
        const store = useUIStore.getState();
        store.setThemeMode(store.themeMode === 'dark' ? 'light' : 'dark');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, toggleCommandPalette, openSettings, toggleSidebar]);
}
