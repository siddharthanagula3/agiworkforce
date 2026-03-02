import { useEffect, useRef } from 'react';
import { useVoiceInputStore } from '../stores/voiceInputStore';

function hotkeyToAccelerator(hotkey: string): string {
  switch (hotkey) {
    case 'option':
      return 'Alt';
    case 'ctrl+space':
      return 'CommandOrControl+Space';
    case 'ctrl+shift+v':
      return 'CommandOrControl+Shift+V';
    default:
      return 'Alt';
  }
}

/**
 * Registers the voice dictation hotkey using keydown/keyup events on document.
 *
 * Pressing the configured hotkey calls startListening(); releasing calls
 * stopListening(). The overlay VoiceInputOverlay renders automatically based
 * on the store mode.
 */
export function useVoiceHotkey() {
  const startListening = useVoiceInputStore((s) => s.startListening);
  const stopListening = useVoiceInputStore((s) => s.stopListening);
  const hotkey = useVoiceInputStore((s) => s.hotkey);

  // Track whether we started listening via the keyboard so we only
  // call stopListening once.
  const isListeningViaKeyboard = useRef(false);

  useEffect(() => {
    const accelerator = hotkeyToAccelerator(hotkey);
    const isOptionHotkey = accelerator === 'Alt';
    const isCtrlSpace = accelerator === 'CommandOrControl+Space';
    const isCtrlShiftV = accelerator === 'CommandOrControl+Shift+V';

    const matchesHotkey = (e: KeyboardEvent): boolean => {
      if (isOptionHotkey) return e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
      if (isCtrlSpace)
        return (e.ctrlKey || e.metaKey) && e.code === 'Space' && !e.shiftKey && !e.altKey;
      if (isCtrlShiftV)
        return (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v';
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isListeningViaKeyboard.current) return;
      if (matchesHotkey(e)) {
        e.preventDefault();
        isListeningViaKeyboard.current = true;
        void startListening();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isListeningViaKeyboard.current) return;
      // For option key, fire on any keyup that releases Alt
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
