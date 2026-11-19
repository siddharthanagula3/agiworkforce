import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  VoiceOutputHandle,
  VoiceOutputOptions,
  VoiceOutputOwner,
} from '@/src/features/voice/services/voiceOutput';

export const VOICE_PREVIEW_TEXT = 'This is how AGI will sound.';

export function useVoicePreview(owner: VoiceOutputOwner | null) {
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const activeRef = useRef<{ key: string; handle: VoiceOutputHandle } | null>(null);

  const stop = useCallback(() => {
    const active = activeRef.current;
    activeRef.current = null;
    setPlayingKey(null);
    void active?.handle.stop().catch(() => undefined);
  }, []);

  const toggle = useCallback(
    (key: string, options: VoiceOutputOptions) => {
      if (!owner) return;
      if (activeRef.current?.key === key) {
        stop();
        return;
      }
      const handle = owner.start(VOICE_PREVIEW_TEXT, options);
      const entry = { key, handle };
      activeRef.current = entry;
      setPlayingKey(key);
      void handle.done.then(() => {
        if (activeRef.current !== entry) return;
        activeRef.current = null;
        setPlayingKey(null);
      });
    },
    [owner, stop],
  );

  useEffect(() => stop, [stop]);

  return { playingKey, toggle, stop };
}
