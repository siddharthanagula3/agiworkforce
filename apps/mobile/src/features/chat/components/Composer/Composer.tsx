import type { SendPreviewInput, WorkUsageRecovery } from '@agiworkforce/types';
import { ChatInput, type ChatInputHandle } from '@/src/features/chat/components/ChatInput';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import type { DraftProvenance } from '@/src/features/chat/draftStore';

interface ComposerProps {
  onSend: (text: string, attachments?: Attachment[]) => void | boolean | Promise<void | boolean>;
  isStreaming?: boolean;
  onStop?: () => void;
  onOpenModelPicker?: () => void;
  onOpenVoiceMode?: () => void;
  onOpenCompare?: () => void;
  onOpenExport?: () => void;
  onOpenAddToChat?: () => void;
  isOnline?: boolean;
  queueSize?: number;
  attachRef?: React.RefObject<ChatInputHandle | null>;
  isThreadActive?: boolean;
  initialText?: string;
  draftKey?: string;
  draftProvenance?: DraftProvenance;
  sendPreview?: SendPreviewInput;
  attachmentPrivacyShortLabel?: string;
  selectedSkillName?: string;
  onClearSelectedSkill?: () => void;
  exhaustedUsageRecovery?: WorkUsageRecovery | null;
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
  isThreadActive,
  initialText,
  draftKey,
  draftProvenance,
  sendPreview,
  attachmentPrivacyShortLabel,
  selectedSkillName,
  onClearSelectedSkill,
  exhaustedUsageRecovery,
}: ComposerProps) {
  return (
    <ChatInput
      onSend={onSend}
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
      isThreadActive={isThreadActive}
      initialText={initialText}
      draftKey={draftKey}
      draftProvenance={draftProvenance}
      sendPreview={sendPreview}
      attachmentPrivacyShortLabel={attachmentPrivacyShortLabel}
      selectedSkillName={selectedSkillName}
      onClearSelectedSkill={onClearSelectedSkill}
      exhaustedUsageRecovery={exhaustedUsageRecovery}
    />
  );
}
