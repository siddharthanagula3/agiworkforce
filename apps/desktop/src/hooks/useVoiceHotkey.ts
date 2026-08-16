import { useEffect, useRef } from 'react';
import { useVoiceInputStore } from '../stores/settingsStore';

/**
 * Registers the voice dictation hotkey using keydown/keyup events on document.
 *
 * Pressing the configured hotkey calls startListening(); releasing calls
 * stopListening(). The overlay VoiceInputOverlay renders automatically based
 * on the store mode.
 *
 * For 'caps_lock' mode the hotkey acts as a toggle: first Caps Lock press
 * starts listening, second Caps Lock press stops listening. Note that browsers
 * expose CapsLock via KeyboardEvent.code === 'CapsLock' on keydown; the
 * actual lock state is readable via KeyboardEvent.getModifierState('CapsLock').
 *
 * IMPORTANT: `useVoiceInputStore` here is re-exported from
 * `stores/settingsStore.ts` (defined in `stores/settings/voice.ts`) —
 * this is the SAME store instance watched by `VoiceInputOverlay.tsx` and
 * `VoiceSettings.tsx`, and the one driven by the Quick Query voice request
 * in `App.tsx`. The former duplicate `stores/voiceInputStore.ts` owner was
 * removed after it caused DESKTOP-VOICE-DICTATION-STORE-MISMATCH-01 (the
 * hotkey recorded audio while the overlay watched a different store).
 */
export function useVoiceHotkey() {
  const startListening = useVoiceInputStore((s) => s.startListening);
  const stopListening = useVoiceInputStore((s) => s.stopListening);
  const hotkey = useVoiceInputStore((s) => s.hotkey);

  const isListeningViaKeyboard = useRef(false);

  useEffect(() => {
    const isOptionHotkey = hotkey === 'option';
    const isCtrlSpace = hotkey === 'ctrl+space';
    const isCtrlShiftV = hotkey === 'ctrl+shift+v';
    const isCapsLock = hotkey === 'caps_lock';

    const matchesHotkey = (e: KeyboardEvent): boolean => {
      if (isOptionHotkey) return e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
      if (isCtrlSpace)
        return (e.ctrlKey || e.metaKey) && e.code === 'Space' && !e.shiftKey && !e.altKey;
      if (isCtrlShiftV)
        return (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v';
      if (isCapsLock)
        return e.code === 'CapsLock' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!matchesHotkey(e)) return;

      if (isCapsLock) {
        e.preventDefault();
        if (isListeningViaKeyboard.current) {
          isListeningViaKeyboard.current = false;
          void stopListening();
        } else {
          isListeningViaKeyboard.current = true;
          void startListening();
        }
        return;
      }

      if (isListeningViaKeyboard.current) return;
      e.preventDefault();
      isListeningViaKeyboard.current = true;
      void startListening();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isCapsLock) return;

      if (!isListeningViaKeyboard.current) return;
      const releaseMatches =
        (isOptionHotkey && !e.altKey) ||
        (isCtrlSpace && (e.code === 'Space' || (!e.ctrlKey && !e.metaKey))) ||
        (isCtrlShiftV && (e.key.toLowerCase() === 'v' || !e.shiftKey));
      if (releaseMatches) {
        isListeningViaKeyboard.current = false;
        void stopListening();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [hotkey, startListening, stopListening]);
}
