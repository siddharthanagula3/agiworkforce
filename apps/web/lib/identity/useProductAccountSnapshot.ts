'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useAuthStore } from '@shared/stores/authentication-store';

export interface ProductAccountAuthority {
  readonly accountId: string;
  isCurrent: () => boolean;
  subscribe: (listener: () => void) => () => void;
}

const readAccountId = () => useAuthStore.getState().user?.id ?? null;
const serverAccountId = () => null;

export function useProductAccountSnapshot(): (
  expectedAccountId: string | null,
) => ProductAccountAuthority | null {
  const observed = useRef({ accountId: readAccountId(), generation: 0 });
  const observe = useCallback(() => {
    const accountId = readAccountId();
    if (observed.current.accountId !== accountId) {
      observed.current = { accountId, generation: observed.current.generation + 1 };
    }
  }, []);
  const subscribe = useCallback(
    (listener: () => void) =>
      useAuthStore.subscribe(() => {
        observe();
        listener();
      }),
    [observe],
  );
  useSyncExternalStore(subscribe, readAccountId, serverAccountId);
  observe();

  return useCallback(
    (expectedAccountId: string | null): ProductAccountAuthority | null => {
      observe();
      const { accountId, generation } = observed.current;
      if (!accountId || accountId !== expectedAccountId) return null;
      let retired = false;
      const isCurrent = () => {
        observe();
        if (observed.current.generation !== generation) retired = true;
        return !retired;
      };
      return {
        accountId,
        isCurrent,
        subscribe: (listener) =>
          subscribe(() => {
            isCurrent();
            listener();
          }),
      };
    },
    [observe, subscribe],
  );
}
