/**
 * useGlobalVoicePTT
 *
 * React hook that wires up the Rust global fn-key Push-to-Talk (PTT) system.
 *
 * On mount it calls `voice_start_global_ptt` which spawns an OS-level keyboard
 * listener in the Tauri backend.  The listener emits two Tauri events:
 *   - `voice:ptt-start`  — fn key pressed anywhere on the machine
 *   - `voice:ptt-stop`   — fn key released
 *
 * The hook forwards those events to the caller via `onPTTStart` / `onPTTStop`
 * callbacks so recording can start/stop without the user needing to focus the
 * app window first.
 *
 * After STT transcription the caller can use the returned `injectText` helper
 * to type the transcribed text into whatever OS window is currently focused.
 *
 * Usage:
 * ```tsx
 * const { injectText, isListening } = useGlobalVoicePTT({
 *   onPTTStart: () => startRecording(),
 *   onPTTStop:  () => stopAndTranscribe(),
 * });
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '../../lib/tauri-mock';
import { listen, UnlistenFn } from '../../lib/tauri-mock';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseGlobalVoicePTTOptions {
  /** Called when the fn key is pressed (start recording). */
  onPTTStart: () => void;
  /** Called when the fn key is released (stop recording + transcribe). */
  onPTTStop: () => void;
  /**
   * Set to `false` to temporarily pause the global listener without
   * unmounting the hook.  Defaults to `true`.
   */
  enabled?: boolean;
}

export interface UseGlobalVoicePTTReturn {
  /**
   * Inject `text` into the currently OS-focused window / input field.
   * Calls the `voice_inject_text` Tauri command which uses Enigo under the hood.
   */
  injectText: (text: string) => Promise<void>;
  /** `true` while the fn key is held down (between ptt-start and ptt-stop). */
  isListening: boolean;
  /** `true` when the backend listener is actively running. */
  isActive: boolean;
  /** Last error from the backend, if any. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGlobalVoicePTT({
  onPTTStart,
  onPTTStop,
  enabled = true,
}: UseGlobalVoicePTTOptions): UseGlobalVoicePTTReturn {
  const [isListening, setIsListening] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep stable refs to callbacks so the event listeners don't need to
  // re-register every time the parent re-renders.
  const onPTTStartRef = useRef(onPTTStart);
  const onPTTStopRef = useRef(onPTTStop);
  useEffect(() => {
    onPTTStartRef.current = onPTTStart;
  }, [onPTTStart]);
  useEffect(() => {
    onPTTStopRef.current = onPTTStop;
  }, [onPTTStop]);

  // Start/stop the backend listener when `enabled` changes or on mount/unmount.
  useEffect(() => {
    if (!isTauri) return;

    let unlistenStart: UnlistenFn | null = null;
    let unlistenStop: UnlistenFn | null = null;
    let mounted = true;

    async function start() {
      try {
        // Register Tauri event listeners before starting the backend so we
        // don't miss the very first event.
        unlistenStart = await listen<void>('voice:ptt-start', () => {
          if (!mounted) return;
          setIsListening(true);
          onPTTStartRef.current();
        });

        unlistenStop = await listen<void>('voice:ptt-stop', () => {
          if (!mounted) return;
          setIsListening(false);
          onPTTStopRef.current();
        });

        await invoke('voice_start_global_ptt');

        if (mounted) {
          setIsActive(true);
          setError(null);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (mounted) {
          setError(msg);
          setIsActive(false);
        }
        console.error('[useGlobalVoicePTT] Failed to start backend listener:', msg);
      }
    }

    async function stop() {
      try {
        await invoke('voice_stop_global_ptt');
      } catch (err) {
        // Non-fatal — log and continue cleanup
        console.warn('[useGlobalVoicePTT] Error stopping backend listener:', err);
      }
    }

    if (enabled) {
      start();
    }

    return () => {
      mounted = false;
      setIsListening(false);
      setIsActive(false);

      // Unregister Tauri event listeners
      unlistenStart?.();
      unlistenStop?.();

      // Tell the backend to stop the OS hook thread
      stop();
    };
  }, [enabled]);

  // ---------------------------------------------------------------------------
  // injectText helper
  // ---------------------------------------------------------------------------

  const injectText = useCallback(async (text: string): Promise<void> => {
    if (!text) return;
    try {
      await invoke('voice_inject_text', { text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[useGlobalVoicePTT] voice_inject_text failed:', msg);
      throw new Error(msg);
    }
  }, []);

  return { injectText, isListening, isActive, error };
}
