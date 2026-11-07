import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  accountScopedUiStateKey,
  captureAccountScopedUiState,
  isAccountScopedUiStateCurrent,
} from '@/src/features/auth/services/accountScopedUiState';
import { subscribeCloudAccountEpochChange } from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

function accountSnapshot(): string {
  return accountScopedUiStateKey(captureAccountScopedUiState('cloud'));
}

export interface LibraryPickerScope {
  isCurrent: () => boolean;
}

export function useLibraryPickerScope(destinationKey: string): LibraryPickerScope {
  const mode = useChatAppModeStore((state) => state.appMode);
  const accountKey = useSyncExternalStore(
    subscribeCloudAccountEpochChange,
    accountSnapshot,
    accountSnapshot,
  );
  const current = useRef<LibraryPickerScope | null>(null);
  const scope = useMemo((): LibraryPickerScope => {
    const ownership = captureAccountScopedUiState(mode);
    const next: LibraryPickerScope = {
      isCurrent: () =>
        current.current === next &&
        isAccountScopedUiStateCurrent(ownership, useChatAppModeStore.getState().appMode),
    };
    return next;
  }, [mode, accountKey, destinationKey]);
  current.current = scope;
  useLayoutEffect(() => {
    current.current = scope;
    return () => {
      if (current.current === scope) current.current = null;
    };
  }, [scope]);
  return scope;
}
