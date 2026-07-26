import { useState, useCallback } from 'react';
import { View } from 'react-native';
import { ChatInput } from '@/src/features/chat/components/ChatInput';
import { type TaskChipType } from '@/src/features/chat/components/TaskChips';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import type { DraftProvenance } from '@/src/features/chat/draftStore';

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
  onOpenConnectors?: () => void;
  isOnline?: boolean;
  queueSize?: number;
  attachRef?: React.RefObject<{ addAttachments: (items: Attachment[]) => void } | null>;
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
  onOpenConnectors,
  isOnline,
  queueSize,
  attachRef,
  showChips = false,
  isThreadActive,
  initialText,
  draftKey,
  draftProvenance,
}: ComposerProps) {
  const [activeChip, setActiveChip] = useState<TaskChipType | null>(null);

  const handleChipPress = useCallback((chip: TaskChipType) => {
    setActiveChip((prev) => (prev === chip ? null : chip));
  }, []);

  const handleSend = useCallback(
    (text: string, attachments?: Attachment[]) => {
      // Forward the acceptance signal so ChatInput's draft-safe clearing works.
      const result = onSend(text, attachments, activeChip ?? undefined);
      setActiveChip(null);
      return result;
    },
    [onSend, activeChip],
  );

  return (
    <View style={{ gap: 8 }}>
      <ChatInput
        onSend={handleSend}
        isStreaming={isStreaming}
        onStop={onStop}
        onOpenModelPicker={onOpenModelPicker}
        onOpenVoiceMode={onOpenVoiceMode}
        onOpenCompare={onOpenCompare}
        onOpenExport={onOpenExport}
        onOpenAddToChat={onOpenAddToChat}
        onOpenConnectors={onOpenConnectors}
        isOnline={isOnline}
        queueSize={queueSize}
        attachRef={attachRef}
        isThreadActive={isThreadActive ?? !showChips}
        initialText={initialText}
        draftKey={draftKey}
        draftProvenance={draftProvenance}
      />
    </View>
  );
}
