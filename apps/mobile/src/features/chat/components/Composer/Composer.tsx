import { useState, useCallback } from 'react';
import { View } from 'react-native';
import type { SendPreviewInput } from '@agiworkforce/types';
import { ChatInput, type ChatInputHandle } from '@/src/features/chat/components/ChatInput';
import {
  TaskChips,
  type TaskChipType,
  type TaskSuggestionType,
} from '@/src/features/chat/components/TaskChips';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import type { DraftProvenance } from '@/src/features/chat/draftStore';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

interface ComposerProps {
  /** May return (a promise of) a boolean — `false` means the send was
   *  rejected pre-flight and the composer keeps its draft. */
  onSend: (
    text: string,
    attachments?: Attachment[],
    mode?: TaskChipType,
  ) => void | boolean | Promise<void | boolean>;
  isStreaming?: boolean;
  onStop?: () => void;
  onOpenModelPicker?: () => void;
  onOpenVoiceMode?: () => void;
  onOpenCompare?: () => void;
  onOpenExport?: () => void;
  onOpenAddToChat?: () => void;
  isOnline?: boolean;
  queueSize?: number;
  /**
   * Forwarded straight to the composer: add attachments, or focus the field
   * (e.g. handing the keyboard back when inline voice exits).
   */
  attachRef?: React.RefObject<ChatInputHandle | null>;
  /** Whether to show task chips above the input (shown on empty chat) */
  showChips?: boolean;
  /** When false, thread has messages and placeholder reads "Reply to AGI" */
  isThreadActive?: boolean;
  /**
   * Pre-fill text for the composer on first render (e.g. from a conversation
   * starter prompt or URL param). Only applied at mount.
   */
  initialText?: string;
  /** Per-conversation draft key, forwarded to the composer for draft restore. */
  draftKey?: string;
  /** Explicit Local/Cloud owner for the persisted conversation draft. */
  draftProvenance?: DraftProvenance;
  /** Resolved outbound route for the composer's "what will be sent" disclosure. */
  sendPreview?: SendPreviewInput;
  /** Per-file privacy chip on attachment thumbnails, from the same disclosure. */
  attachmentPrivacyShortLabel?: string;
}

export function Composer({
  onSend,
  isStreaming,
  onStop,
  onOpenModelPicker,
  onOpenVoiceMode,
  onOpenCompare,
  onOpenExport,
  onOpenAddToChat,
  isOnline,
  queueSize,
  attachRef,
  showChips = false,
  isThreadActive,
  initialText,
  draftKey,
  draftProvenance,
  sendPreview,
  attachmentPrivacyShortLabel,
}: ComposerProps) {
  const [activeChip, setActiveChip] = useState<TaskChipType | null>(null);
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setMediaMode = useChatViewStore((state) => state.setMediaMode);

  const handleChipPress = useCallback(
    (chip: TaskSuggestionType) => {
      if (chip === 'image') {
        setActiveChip(null);
        setMediaMode('image');
        attachRef?.current?.focus?.();
        return;
      }
      setMediaMode('text');
      setActiveChip((prev) => (prev === chip ? null : chip));
      attachRef?.current?.focus?.();
    },
    [attachRef, setMediaMode],
  );

  const handleSend = useCallback(
    (text: string, attachments?: Attachment[]) => {
      // Forward the acceptance signal so ChatInput's draft-safe clearing works.
      return Promise.resolve(onSend(text, attachments, activeChip ?? undefined)).then(
        (accepted) => {
          if (accepted !== false) setActiveChip(null);
          return accepted;
        },
      );
    },
    [onSend, activeChip],
  );

  return (
    <View style={{ gap: 8 }}>
      {showChips ? (
        <View style={{ paddingHorizontal: 16 }}>
          <TaskChips
            activeChip={activeChip}
            onChipPress={handleChipPress}
            showCloudSuggestions={appMode === 'cloud'}
          />
        </View>
      ) : null}
      <ChatInput
        onSend={handleSend}
        isStreaming={isStreaming}
        onStop={onStop}
        onOpenModelPicker={onOpenModelPicker}
        onOpenVoiceMode={onOpenVoiceMode}
        onOpenCompare={onOpenCompare}
        onOpenExport={onOpenExport}
        onOpenAddToChat={onOpenAddToChat}
        isOnline={isOnline}
        queueSize={queueSize}
        attachRef={attachRef}
        isThreadActive={isThreadActive ?? !showChips}
        initialText={initialText}
        draftKey={draftKey}
        draftProvenance={draftProvenance}
        sendPreview={sendPreview}
        attachmentPrivacyShortLabel={attachmentPrivacyShortLabel}
      />
    </View>
  );
}
