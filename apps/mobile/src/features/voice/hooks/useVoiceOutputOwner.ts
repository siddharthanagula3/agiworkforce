import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import {
  accountScopedUiStateKey,
  captureAccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';
import { subscribeCloudAccountEpochChange } from '@/src/features/auth/services/cloudAccountSession';
import {
  createVoiceOutputOwner,
  type VoiceOutputOwner,
} from '@/src/features/voice/services/voiceOutput';

export function useVoiceOutputOwner(
  scope: 'local' | 'cloud',
  contextKey: string,
): VoiceOutputOwner | null {
  const snapshot = useCallback(
    () => accountScopedUiStateKey(captureAccountScopedUiState(scope)),
    [scope],
  );
  const sourceKey = useSyncExternalStore(subscribeCloudAccountEpochChange, snapshot, snapshot);
  const [entry, setEntry] = useState<{
    scope: 'local' | 'cloud';
    contextKey: string;
    sourceKey: string;
    owner: VoiceOutputOwner;
  } | null>(null);

  useLayoutEffect(() => {
    const source = captureAccountScopedUiState(scope);
    const owner = createVoiceOutputOwner(
      accountScopedUiStateKey(source) === sourceKey ? source : null,
    );
    setEntry({ scope, contextKey, sourceKey, owner });
    return () => {
      void owner.dispose().catch(() => undefined);
    };
  }, [scope, contextKey, sourceKey]);

  return entry?.scope === scope && entry.contextKey === contextKey && entry.sourceKey === sourceKey
    ? entry.owner
    : null;
}
