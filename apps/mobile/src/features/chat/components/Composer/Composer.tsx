import { useState, useCallback } from 'react';
import { View } from 'react-native';
import { ChatInput } from '@/src/features/chat/components/ChatInput';
import { type TaskChipType } from '@/src/features/chat/components/TaskChips';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';

interface ComposerProps {
  onSend: (text: string, attachments?: Attachment[], mode?: TaskChipType) => void;
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
}: ComposerProps) {
  const [activeChip, setActiveChip] = useState<TaskChipType | null>(null);

  const handleChipPress = useCallback((chip: TaskChipType) => {
    setActiveChip((prev) => (prev === chip ? null : chip));
  }, []);

  const handleSend = useCallback(
    (text: string, attachments?: Attachment[]) => {
      onSend(text, attachments, activeChip ?? undefined);
      setActiveChip(null);
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
      />
    </View>
  );
}
