import { useEffect, useRef } from 'react';
import { useSettingsStore, useVoiceInputStore } from '../stores/settingsStore';

const DOUBLE_TAP_THRESHOLD_MS = 300;

export function useQuickQueryDoubleTap(onDoubleTap: () => void) {
  const lastAltKeyupAtRef = useRef<number>(0);
  const onDoubleTapRef = useRef(onDoubleTap);
  onDoubleTapRef.current = onDoubleTap;

  useEffect(() => {
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') return;
      if (!useSettingsStore.getState().globalHotkeyPreferences.enabled) return;
      // Holding Option is the default dictation hotkey, so two quick
      // dictations would otherwise also toggle Quick Query on the second
      // release.
      if (useVoiceInputStore.getState().hotkey === 'option') return;
      const now = Date.now();
      const elapsed = now - lastAltKeyupAtRef.current;
      lastAltKeyupAtRef.current = now;
      if (elapsed > 0 && elapsed < DOUBLE_TAP_THRESHOLD_MS) {
        onDoubleTapRef.current();
      }
    };

    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
}
