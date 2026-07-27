/**
 * LocalByokHandoffDialog — desktop adapter over the canonical
 * @agiworkforce/unified-chat LocalByokHandoffDialog.
 *
 * Preserves desktop's existing flow: this wrapper still owns fetching the
 * conversation's messages and building the redacted preview itself (no
 * per-message context selection UI — the last 20 messages are auto-included,
 * matching desktop's current behavior), and still owns the actual fork
 * action (store mutation + provider-mode switch + navigation). Only the
 * dialog's rendering is now shared with web.
 *
 * Trigger delta (see report): this dialog opens from an explicit, always-
 * available "Fork to BYOK" button on every conversation row in Sidebar.tsx —
 * unlike web's automatic first-send-to-BYOK detection (shouldForkLocalToByok),
 * desktop's trigger does not distinguish a conversation's current provider
 * mode. That trigger-logic asymmetry is out of scope for this consolidation
 * (structural only) and is preserved as-is.
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { buildLocalToByokHandoffDraft, type LocalToByokHandoffPreview } from '@agiworkforce/utils';
import {
  LocalByokHandoffDialog as PackageLocalByokHandoffDialog,
  useChatModelStore,
} from '@agiworkforce/unified-chat';
import { useSettingsStore } from '../../stores/settingsStore';
import { useChatStore } from '../../stores/chat/chatStore';

interface LocalByokHandoffDialogProps {
  conversationId: string;
  conversationTitle: string;
  onClose: () => void;
}

export function LocalByokHandoffDialog({
  conversationId,
  conversationTitle,
  onClose,
}: LocalByokHandoffDialogProps) {
  const messages = useChatStore((state) => state.messagesByConversation[conversationId] ?? []);
  const forkConversationForByok = useChatStore((state) => state.forkConversationForByok);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const setProviderMode = useSettingsStore((state) => state.setProviderMode);
  const availableModels = useChatModelStore((state) => state.models);
  const selectedModelId = useChatModelStore((state) => state.selectedModelId);
  const [preview, setPreview] = useState<LocalToByokHandoffPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handoffContext = useMemo(
    () =>
      messages.slice(-20).map((message, index) => ({
        id: message.id,
        kind: 'message' as const,
        label: `${index + 1}. ${message.role}`,
        sourceUri: `desktop://conversation/${conversationId}/message/${message.id}`,
        content: message.content,
      })),
    [conversationId, messages],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    buildLocalToByokHandoffDraft({
      sourceSessionId: conversationId,
      sourceSurface: 'desktop',
      targetSurface: 'desktop',
      selectedContext: handoffContext,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      blockOnFindings: true,
    })
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setPreview(null);
          setError(err instanceof Error ? err.message : 'Could not build handoff preview.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, handoffContext]);

  const isBlocked = preview?.redactionReport.blocked ?? false;
  const byokModels = availableModels.filter((model) => model.isByok && !model.isLocal);
  const targetModel =
    byokModels.find((model) => model.id === selectedModelId) ?? byokModels.at(0) ?? null;
  const handoffError =
    error ??
    (!isLoading && !targetModel
      ? 'Configure a BYOK provider key in Models & Keys before creating this fork.'
      : null);

  const handleCreateFork = () => {
    if (!preview || isBlocked || !targetModel) return;

    const forkId = forkConversationForByok(conversationId, {
      title: `${conversationTitle} (BYOK fork)`,
      model: targetModel.id,
      provider: targetModel.provider,
    });
    setProviderMode('cloud');
    useChatModelStore.getState().selectModel(targetModel.id);
    selectConversation(forkId);
    toast.success('Created a BYOK fork. The original Local thread is unchanged.');
    onClose();
  };

  return (
    <PackageLocalByokHandoffDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      preview={preview}
      isBuilding={isLoading}
      error={handoffError}
      onConfirm={handleCreateFork}
      confirmLabel="Create BYOK fork"
      targetProviderLabel={targetModel?.provider}
    />
  );
}
