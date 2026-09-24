import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { copyToClipboard } from '@/lib/clipboard';
import { useSettingsStore } from '@/stores/settingsStore';

export type CopyStatus = 'idle' | 'copied' | 'failed';

export const COPY_CONFIRMATION_MS = 2_000;
export const COPIED_LABEL = 'Copied';
export const COPY_FAILED_LABEL = 'Could not copy';
const COPY_FAILED_BODY =
  'The clipboard is not available right now. Try again, or use Share to send this to another app.';

export interface CopyAction {
  status: CopyStatus;
  copy: (text: string) => Promise<boolean>;
}

export function copyControlLabel(status: CopyStatus, idleLabel: string): string {
  if (status === 'copied') return COPIED_LABEL;
  if (status === 'failed') return COPY_FAILED_LABEL;
  return idleLabel;
}

/**
 * The one way the app writes to the clipboard. A write that fails says so
 * instead of leaving a control that looks like it worked.
 */
export function useCopyAction(): CopyAction {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const settle = useCallback((next: Exclude<CopyStatus, 'idle'>) => {
    setStatus(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), COPY_CONFIRMATION_MS);
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      const copied = await copyToClipboard(text);
      settle(copied ? 'copied' : 'failed');
      if (hapticsEnabled) {
        await Haptics.notificationAsync(
          copied
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Error,
        );
      }
      if (!copied) Alert.alert(COPY_FAILED_LABEL, COPY_FAILED_BODY);
      return copied;
    },
    [hapticsEnabled, settle],
  );

  return { status, copy };
}
