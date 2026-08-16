
import { EnhancedMessage, MessageReaction, SidecarMode } from '../../../stores/unifiedChatStore';

export interface ThinkingMessageMetadata {
  thinkingSummary?: string;
  summary?: string;
  duration?: number;
  steps?: number;
  [key: string]: unknown;
}

export interface MessageBubbleProps {
  message: EnhancedMessage;
  showAvatar?: boolean;
  showTimestamp?: boolean;
  enableActions?: boolean;
  isLastMessage?: boolean;
  onRegenerate?: () => void;
  onEdit?: (content: string) => void;
  onEditSave?: (messageId: string, newContent: string) => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onToggleSidecar?: (tab: SidecarMode) => void;
  onSuggestionClick?: (suggestion: string) => void;
}

export interface ReactionConfig {
  type: MessageReaction;
  icon: React.ReactNode;
  label: string;
}

export interface LightboxImage {
  src: string;
  alt: string;
}

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ThinkingMatch {
  content: string;
  pattern: string;
  fullMatch: string;
}

export type ApprovalState = 'idle' | 'approving' | 'denying' | 'approved' | 'denied';
