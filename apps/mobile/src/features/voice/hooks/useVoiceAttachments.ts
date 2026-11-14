import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Alert } from 'react-native';
import {
  captureAccountScopedUiState,
  isAccountScopedUiStateOwned,
} from '@/src/features/auth/services/accountScopedUiState';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useUploadLifecycleStore } from '@/src/features/chat/upload/uploadLifecycle';
import { validateAttachments } from '@/src/features/chat/utils/attachmentValidation';
import type { ComposerAttachmentOperation } from '@/src/features/chat/utils/runComposerAttachmentPick';

export interface VoiceAttachmentTarget {
  addAttachments: (items: Attachment[]) => void;
  captureAttachmentOperation: (
    executionMode: 'local' | 'cloud',
  ) => ComposerAttachmentOperation | null;
}

export interface UseVoiceAttachmentsOptions {
  active: boolean;
  scopeKey: string;
  composerRef: RefObject<VoiceAttachmentTarget | null>;
  onRelease: (attachments: Attachment[]) => void;
}

export interface VoiceAttachmentSend {
  attachments: Attachment[] | undefined;
  markSent: () => void;
  settle: () => void;
}

export interface VoiceAttachments {
  attachments: Attachment[];
  activeTarget: () => VoiceAttachmentTarget | null;
  beginSend: () => VoiceAttachmentSend;
  remove: (id: string) => void;
}

function attachmentIdentity(attachment: Attachment): string {
  return attachment.assetId ? `asset:${attachment.assetId}` : `uri:${attachment.uri}`;
}

export function useVoiceAttachments({
  active,
  scopeKey,
  composerRef,
  onRelease,
}: UseVoiceAttachmentsOptions): VoiceAttachments {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const activeRef = useRef(active);
  activeRef.current = active;
  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;
  const generationRef = useRef(0);
  const sendingIdsRef = useRef(new Set<string>());
  const scopeKeyRef = useRef(scopeKey);

  useLayoutEffect(() => {
    if (scopeKeyRef.current === scopeKey) return;
    scopeKeyRef.current = scopeKey;
    generationRef.current += 1;
    const discarded = attachmentsRef.current;
    sendingIdsRef.current.clear();
    if (discarded.length === 0) return;
    for (const attachment of discarded) useUploadLifecycleStore.getState().clear(attachment.id);
    attachmentsRef.current = [];
    setAttachments([]);
  }, [scopeKey]);

  useEffect(() => {
    generationRef.current += 1;
    if (active) return;
    const leftover = attachmentsRef.current.filter((a) => !sendingIdsRef.current.has(a.id));
    if (leftover.length === 0) return;
    attachmentsRef.current = attachmentsRef.current.filter((a) => sendingIdsRef.current.has(a.id));
    setAttachments(attachmentsRef.current);
    onReleaseRef.current(leftover);
  }, [active]);

  const addAttachments = useCallback((items: Attachment[], isCurrent: () => boolean) => {
    if (!isCurrent()) return;
    const { accepted, rejected } = validateAttachments(
      items,
      useChatAppModeStore.getState().appMode,
    );
    const seen = new Set(attachmentsRef.current.map(attachmentIdentity));
    const fresh: Attachment[] = [];
    const duplicates: string[] = [];
    for (const item of accepted) {
      const identity = attachmentIdentity(item);
      if (seen.has(identity)) {
        duplicates.push(item.fileName);
        continue;
      }
      seen.add(identity);
      fresh.push(item);
    }
    if (fresh.length > 0) {
      attachmentsRef.current = [...attachmentsRef.current, ...fresh];
      setAttachments(attachmentsRef.current);
    }
    if (duplicates.length > 0) {
      Alert.alert(
        duplicates.length === 1 ? 'Already attached' : 'Some files are already attached',
        `${duplicates.join('\n')}\n\nEach file is attached once.`,
      );
    }
    if (rejected.length > 0) {
      Alert.alert(
        rejected.length === 1 ? 'Attachment not added' : 'Some attachments not added',
        rejected.map((r) => r.reason).join('\n'),
      );
    }
  }, []);

  const target = useMemo<VoiceAttachmentTarget>(
    () => ({
      addAttachments: (items) => addAttachments(items, () => activeRef.current),
      captureAttachmentOperation: (executionMode) => {
        if (!activeRef.current) return null;
        const validationMode = useChatAppModeStore.getState().appMode;
        if (validationMode !== executionMode) return null;
        const ownership = captureAccountScopedUiState(executionMode);
        if (!ownership) return null;
        const generation = generationRef.current;
        const isCurrent = () =>
          activeRef.current &&
          generationRef.current === generation &&
          useChatAppModeStore.getState().appMode === validationMode &&
          isAccountScopedUiStateOwned(ownership);
        return {
          isCurrent,
          addAttachments: (items: Attachment[]) => addAttachments(items, isCurrent),
        };
      },
    }),
    [addAttachments],
  );

  const activeTarget = useCallback(
    (): VoiceAttachmentTarget | null => (activeRef.current ? target : composerRef.current),
    [composerRef, target],
  );

  const beginSend = useCallback((): VoiceAttachmentSend => {
    const snapshot = attachmentsRef.current;
    if (snapshot.length === 0) {
      return { attachments: undefined, markSent: () => undefined, settle: () => undefined };
    }
    const ids = new Set(snapshot.map((a) => a.id));
    for (const id of ids) sendingIdsRef.current.add(id);
    let handedOff = false;
    const withdraw = (): Attachment[] => {
      const taken = attachmentsRef.current.filter((a) => ids.has(a.id));
      if (taken.length === 0) return taken;
      attachmentsRef.current = attachmentsRef.current.filter((a) => !ids.has(a.id));
      setAttachments(attachmentsRef.current);
      return taken;
    };
    return {
      attachments: snapshot.map(({ sendFailed: _sendFailed, ...rest }) => rest),
      markSent: () => {
        handedOff = true;
        withdraw();
      },
      settle: () => {
        for (const id of ids) sendingIdsRef.current.delete(id);
        if (handedOff || activeRef.current) return;
        const unsent = withdraw();
        if (unsent.length > 0) onReleaseRef.current(unsent);
      },
    };
  }, []);

  const remove = useCallback((id: string) => {
    useUploadLifecycleStore.getState().clear(id);
    attachmentsRef.current = attachmentsRef.current.filter((a) => a.id !== id);
    setAttachments(attachmentsRef.current);
  }, []);

  return useMemo(
    () => ({ attachments, activeTarget, beginSend, remove }),
    [attachments, activeTarget, beginSend, remove],
  );
}
