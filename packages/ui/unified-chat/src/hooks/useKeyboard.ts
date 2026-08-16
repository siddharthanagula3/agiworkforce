import { useEffect } from 'react';

interface UseKeyboardOptions {
  enabled?: boolean;
}

export function useKeyboard({ enabled = true }: UseKeyboardOptions = {}) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === ',') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('chat:action', { detail: { type: 'open-settings' } }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
