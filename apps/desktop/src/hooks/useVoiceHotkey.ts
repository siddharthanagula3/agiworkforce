import { useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '../lib/tauri-mock';
import { useVoiceInputStore, useVoiceModeStore } from '../stores/settingsStore';

interface WakeEvent {
  version: number;
  kind: 'detected' | 'refused' | 'stopped';
  phrase?: string;
  detail?: string;
  confidence: number;
  timestamp: number;
}

interface DictationEvent {
  version: number;
  kind: string;
  source?: string;
  detail?: string;
}

const WAKE_REFUSED_FALLBACK = 'Wake-phrase detection is not available in this build.';
const DICTATION_REFUSED_FALLBACK = 'System-wide dictation is not available in this build.';

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

  useEffect(() => {
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];

    const track = (unlisten: UnlistenFn) => {
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    };

    const fail = (event: string) => (error: unknown) => {
      console.warn(`Failed to subscribe to ${event}:`, error);
    };

    void listen<WakeEvent>('wake:event', ({ payload }) => {
      if (payload.kind === 'detected') {
        if (useVoiceInputStore.getState().voiceMode !== 'idle') return;
        void startListening();
        return;
      }
      // Refused and stopped both mean the detector is not running; the mode
      // store drives the settings toggle's "Listening" badge.
      useVoiceModeStore.setState({ wakeWordActive: false });
      if (payload.kind === 'refused') {
        useVoiceInputStore.setState({ voiceError: payload.detail ?? WAKE_REFUSED_FALLBACK });
      }
    })
      .then(track)
      .catch(fail('wake:event'));

    void listen<DictationEvent>('dictation:event', ({ payload }) => {
      if (payload.kind !== 'refused') return;
      useVoiceInputStore.setState({ voiceError: payload.detail ?? DICTATION_REFUSED_FALLBACK });
    })
      .then(track)
      .catch(fail('dictation:event'));

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) unlisten();
    };
  }, [startListening]);
}
