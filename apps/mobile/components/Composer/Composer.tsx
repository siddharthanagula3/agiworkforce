import { useState, useCallback } from 'react';
import { View } from 'react-native';
import { ChatInput } from '@/components/chat/ChatInput';
import { TaskChips, type TaskChipType } from '@/components/chat/TaskChips';
import type { Attachment } from '@/components/chat/AttachmentPreview';

interface ComposerProps {
  onSend: (text: string, attachments?: Attachment[], mode?: TaskChipType) => void;
  isStreaming?: boolean;
  onStop?: () => void;
  onOpenModelPicker?: () => void;
  onOpenVoiceMode?: () => void;
  onOpenAddToChat?: () => void;
  onOpenConnectors?: () => void;
  isOnline?: boolean;
  queueSize?: number;
  attachRef?: React.RefObject<{ addAttachments: (items: Attachment[]) => void } | null>;
  /** Whether to show 6 task chips above the input (shown on empty chat) */
  showChips?: boolean;
}

export function Composer({
  onSend,
  isStreaming,
  onStop,
  onOpenModelPicker,
  onOpenVoiceMode,
  onOpenAddToChat,
  onOpenConnectors,
  isOnline,
  queueSize,
  attachRef,
  showChips = false,
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
    <View>
      {showChips && !isStreaming && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <TaskChips activeChip={activeChip} onChipPress={handleChipPress} />
        </View>
      )}
      <ChatInput
        onSend={handleSend}
        isStreaming={isStreaming}
        onStop={onStop}
        onOpenModelPicker={onOpenModelPicker}
        onOpenVoiceMode={onOpenVoiceMode}
        onOpenAddToChat={onOpenAddToChat}
        onOpenConnectors={onOpenConnectors}
        isOnline={isOnline}
        queueSize={queueSize}
        attachRef={attachRef}
      />
    </View>
  );
}
