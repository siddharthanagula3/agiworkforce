import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@agiworkforce/ui';
import { LocalByokHandoffDialog, type HandoffContextCandidate } from '@agiworkforce/unified-chat';
import { buildLocalToByokHandoffDraft, type LocalToByokHandoffPreview } from '@agiworkforce/utils';
import { useChatStore } from '../../stores/chat/chatStore';
import type { EnhancedMessage } from '../../stores/chat/types';
import { useByokRequestStore } from './byokRequestStore';

const FORK_CONSENT_TTL_MS = 15 * 60 * 1000;
const LABEL_PREVIEW_CHARS = 80;
const NO_MESSAGES: readonly EnhancedMessage[] = [];

function isForkable(message: EnhancedMessage): boolean {
  return (
    (message.role === 'user' || message.role === 'assistant') &&
    !message.streaming &&
    !message.pending &&
    message.content.trim().length > 0
  );
}

function messageLabel(message: EnhancedMessage): string {
  const speaker = message.role === 'user' ? 'You' : 'Assistant';
  const text = message.content.replace(/\s+/g, ' ').trim();
  const preview =
    text.length > LABEL_PREVIEW_CHARS ? `${text.slice(0, LABEL_PREVIEW_CHARS)}...` : text;
  return `${speaker}: ${preview}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function StartByokChatDialog({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(() => {
    try {
      useChatStore.getState().createByokConversation();
      onClose();
    } catch (startError) {
      setError(errorMessage(startError));
    }
  }, [onClose]);

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start a BYOK chat?</AlertDialogTitle>
          <AlertDialogDescription>
            A new chat opens that sends your messages straight to the provider of the model you
            pick, using the API key you saved for it. That provider bills your key and its own
            privacy terms apply. Your Local chats stay on this device and nothing from them is sent.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              start();
            }}
          >
            Start BYOK chat
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ForkToByokDialog({
  sourceConversationId,
  messages,
  onClose,
}: {
  sourceConversationId: string;
  messages: readonly EnhancedMessage[];
  onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => messages.map((m) => m.id));
  const [preview, setPreview] = useState<LocalToByokHandoffPreview | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo<HandoffContextCandidate[]>(
    () =>
      messages.map((message) => ({
        id: message.id,
        kind: 'message' as const,
        label: messageLabel(message),
      })),
    [messages],
  );

  useEffect(() => {
    const selected = messages.filter((message) => selectedIds.includes(message.id));
    setPreview(null);
    if (selected.length === 0) {
      setError('Select at least one message to carry into the BYOK chat.');
      return;
    }
    let cancelled = false;
    setIsBuilding(true);
    setError(null);
    buildLocalToByokHandoffDraft({
      sourceSessionId: sourceConversationId,
      sourceSurface: 'desktop',
      targetSurface: 'desktop',
      target: 'byok',
      selectedContext: selected.map((message) => ({
        id: message.id,
        kind: 'message' as const,
        label: messageLabel(message),
        content: message.content,
      })),
      expiresAt: new Date(Date.now() + FORK_CONSENT_TTL_MS).toISOString(),
      blockOnFindings: false,
    })
      .then((built) => {
        if (!cancelled) setPreview(built);
      })
      .catch((buildError: unknown) => {
        if (!cancelled) setError(errorMessage(buildError));
      })
      .finally(() => {
        if (!cancelled) setIsBuilding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [messages, selectedIds, sourceConversationId]);

  const toggleContext = useCallback((contextId: string) => {
    setSelectedIds((previous) =>
      previous.includes(contextId)
        ? previous.filter((id) => id !== contextId)
        : [...previous, contextId],
    );
  }, []);

  const confirm = useCallback(async () => {
    if (!preview || isConfirming) return;
    if (Date.parse(preview.draft.expiresAt) <= Date.now()) {
      setError('This preview expired. Change the selection to build a fresh one.');
      return;
    }
    setIsConfirming(true);
    setError(null);
    try {
      const store = useChatStore.getState();
      const forkId = store.forkConversationForByok(sourceConversationId, {
        approvedContext: preview.redactedContext.map((item) => ({
          messageId: item.id,
          redactedContent: item.redactedContent,
        })),
      });
      if (!forkId) {
        setError('None of the selected messages could be carried into the BYOK chat.');
        return;
      }
      await useChatStore.getState().persistByokFork(forkId);
      onClose();
    } catch (confirmError) {
      setError(`The BYOK chat was not created: ${errorMessage(confirmError)}`);
    } finally {
      setIsConfirming(false);
    }
  }, [isConfirming, onClose, preview, sourceConversationId]);

  return (
    <LocalByokHandoffDialog
      open
      onOpenChange={(open) => {
        if (!open && !isConfirming) onClose();
      }}
      preview={preview}
      isBuilding={isBuilding}
      isConfirming={isConfirming}
      error={error}
      onConfirm={confirm}
      candidates={candidates}
      selectedContextIds={selectedIds}
      onToggleContext={toggleContext}
      target="byok"
      confirmLabel="Create BYOK chat"
      confirmingLabel="Creating BYOK chat..."
    />
  );
}

export function ByokConversationDialog() {
  const pending = useByokRequestStore((state) => state.pending);
  const close = useByokRequestStore((state) => state.close);
  const sourceConversationId = pending?.sourceConversationId ?? null;
  const sourceMessages = useChatStore((state) =>
    sourceConversationId
      ? (state.messagesByConversation[sourceConversationId] ?? NO_MESSAGES)
      : NO_MESSAGES,
  );
  const forkableMessages = useMemo(() => sourceMessages.filter(isForkable), [sourceMessages]);

  if (!pending) return null;
  if (!sourceConversationId || forkableMessages.length === 0) {
    return <StartByokChatDialog onClose={close} />;
  }
  return (
    <ForkToByokDialog
      key={sourceConversationId}
      sourceConversationId={sourceConversationId}
      messages={forkableMessages}
      onClose={close}
    />
  );
}
