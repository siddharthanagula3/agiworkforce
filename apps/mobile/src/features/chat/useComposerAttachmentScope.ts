import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
  captureAccountScopedUiState,
  isAccountScopedUiStateOwned,
} from '@/src/features/auth/services/accountScopedUiState';
import { useChatAppModeStore, type MobileChatAppMode } from './store/appModeStore';
import type { DraftProvenance } from './draftStore';

export interface ComposerAttachmentScope {
  isCurrent: () => boolean;
}

export function useComposerAttachmentScope(
  draftIdentity: string,
  provenance: DraftProvenance | undefined,
  validationMode: MobileChatAppMode,
): (executionMode: MobileChatAppMode) => ComposerAttachmentScope | null {
  const configuration = useMemo(
    () => ({ draftIdentity, validationMode }),
    [draftIdentity, validationMode],
  );
  const lifetime = useRef<{ configuration: typeof configuration } | null>(null);
  const modeGeneration = useRef(0);

  useLayoutEffect(() => {
    const owner = { configuration };
    lifetime.current = owner;
    const unsubscribe = useChatAppModeStore.subscribe((next, previous) => {
      if (next.appMode !== previous.appMode) modeGeneration.current += 1;
    });
    return () => {
      unsubscribe();
      if (lifetime.current === owner) lifetime.current = null;
    };
  }, [configuration]);

  const provenanceScope = provenance?.scope;
  const provenanceOwner = provenance?.scope === 'cloud' ? provenance.ownerId : null;
  return useCallback(
    (executionMode: MobileChatAppMode): ComposerAttachmentScope | null => {
      const owner = lifetime.current;
      const generation = modeGeneration.current;
      if (
        !owner ||
        owner.configuration !== configuration ||
        provenanceScope !== executionMode ||
        useChatAppModeStore.getState().appMode !== validationMode
      ) {
        return null;
      }
      const ownership = captureAccountScopedUiState(executionMode);
      if (
        !ownership ||
        (ownership.scope === 'cloud' && ownership.account.ownerId !== provenanceOwner)
      ) {
        return null;
      }
      return {
        isCurrent: () =>
          lifetime.current === owner &&
          modeGeneration.current === generation &&
          useChatAppModeStore.getState().appMode === validationMode &&
          isAccountScopedUiStateOwned(ownership),
      };
    },
    [configuration, provenanceScope, provenanceOwner, validationMode],
  );
}
