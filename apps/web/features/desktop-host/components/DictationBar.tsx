'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DictationStrip } from '@features/chat/components/Composer/DictationStrip';
import { useDictation } from '@features/chat/hooks/use-dictation';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { toUserMessage } from '@/lib/user-error-message';
import { useDesktopHost } from '../lib/host';
import { useDesktopVoiceHotkey } from '../hooks/use-desktop-voice-hotkey';

export const DICTATION_BAR_COPY = {
  label: 'Dictation',
  outsideShell: 'This bar opens from AGI Desktop, over the app you dictate into.',
  dictationOff: 'Dictation is off. Turn it on in Settings > Voice, then press the shortcut again.',
  notTyped: 'What you said could not be typed.',
} as const;

/**
 * The bar the desktop shell opens over another app. It records and transcribes
 * like the composer does, then hands the text to the shell, which types it into
 * that app. The shell's shortcut pressed again stops the recording.
 */
export function DictationBar() {
  const host = useDesktopHost();
  const dictationEnabled = useSettingsStore((state) => state.dictationEnabled);
  const [failure, setFailure] = useState<string | null>(null);
  const handedBack = useRef(false);

  const finish = useCallback(
    (text: string) => {
      if (!host?.finishDictation || handedBack.current) return;
      handedBack.current = true;
      host.finishDictation(text).catch((error: unknown) => {
        setFailure(toUserMessage(error, DICTATION_BAR_COPY.notTyped));
      });
    },
    [host],
  );

  const dictation = useDictation({ onInsert: finish, onSend: finish });
  const { start, stop, cancel, isActive } = dictation;

  const discard = useCallback(() => {
    cancel();
    void host?.cancelDictation?.();
  }, [cancel, host]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current || !host?.finishDictation || !dictationEnabled) return;
    started.current = true;
    start();
  }, [host, dictationEnabled, start]);

  useDesktopVoiceHotkey(() => {
    if (isActive) stop();
  });

  const notice = !host?.finishDictation
    ? DICTATION_BAR_COPY.outsideShell
    : !dictationEnabled
      ? DICTATION_BAR_COPY.dictationOff
      : failure;

  return (
    <main
      aria-label={DICTATION_BAR_COPY.label}
      className="flex h-dvh w-full items-center bg-background px-3 text-foreground"
    >
      {notice !== null ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : (
        <DictationStrip
          status={dictation.status}
          bars={dictation.bars}
          error={dictation.error}
          reducedMotion={dictation.reducedMotion}
          onCancel={discard}
          onStop={stop}
          onSend={dictation.send}
          onRetry={dictation.retry}
        />
      )}
    </main>
  );
}
