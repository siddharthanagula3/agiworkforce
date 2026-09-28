'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ComputerUseStatus, HostBridge } from '@agiworkforce/local-runtime-contract';
import { useChatStore } from '@shared/stores/web-chat-store';
import { toUserMessage } from '@/lib/user-error-message';
import { useElectronHost } from '../lib/host';
import {
  finishComputerUse,
  handBackComputerUse,
  onComputerUseChanged,
  readComputerUse,
  revokeDesktopPermission,
  setComputerUseEnabled,
  stopComputerUse,
  takeOverComputerUse,
} from '../lib/runtime-client';

const LOAD_FAILED = 'Computer use settings could not be read from the app.';
const ACTION_FAILED = 'The app did not make that change.';

export interface ComputerUseControls {
  status: ComputerUseStatus | null;
  error: string | null;
  busy: boolean;
  setEnabled: (enabled: boolean) => void;
  stop: () => void;
  takeOver: () => void;
  handBack: () => void;
  askAgain: () => void;
}

export function useComputerUse(): ComputerUseControls {
  const host = useElectronHost();
  const [status, setStatus] = useState<ComputerUseStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    readComputerUse()
      .then((next) => {
        setStatus(next);
        setError(null);
      })
      .catch((cause: unknown) => setError(toUserMessage(cause, LOAD_FAILED)));
  }, []);

  useEffect(() => {
    if (!host) return undefined;
    refresh();
    window.addEventListener('focus', refresh);
    const unsubscribe = onComputerUseChanged(setStatus);
    return () => {
      window.removeEventListener('focus', refresh);
      unsubscribe();
    };
  }, [host, refresh]);

  const run = useCallback((action: () => Promise<ComputerUseStatus>) => {
    setBusy(true);
    setError(null);
    action()
      .then(setStatus)
      .catch((cause: unknown) => setError(toUserMessage(cause, ACTION_FAILED)))
      .finally(() => setBusy(false));
  }, []);

  return {
    status,
    error,
    busy,
    setEnabled: useCallback((enabled: boolean) => run(() => setComputerUseEnabled(enabled)), [run]),
    stop: useCallback(() => run(stopComputerUse), [run]),
    takeOver: useCallback(() => run(takeOverComputerUse), [run]),
    handBack: useCallback(() => run(handBackComputerUse), [run]),
    askAgain: useCallback(
      () =>
        run(async () => {
          await revokeDesktopPermission({ capability: 'computer.use', scope: { kind: 'global' } });
          return readComputerUse();
        }),
      [run],
    ),
  };
}

export function useComputerUseRunEnd(host: HostBridge): void {
  const replying = useChatStore((state) => state.streamingConversationIds.length > 0);

  useEffect(() => {
    if (replying || host.shell !== 'electron') return;
    void finishComputerUse().catch(() => undefined);
  }, [host, replying]);
}
