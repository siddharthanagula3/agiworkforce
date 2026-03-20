/**
 * MessageBubble Types
 *
 * Shared type definitions for MessageBubble sub-components.
 */

import { EnhancedMessage, MessageReaction, SidecarMode } from '../../../stores/unifiedChatStore';

/**
 * Extended message metadata type for thinking-related fields
 */
export interface ThinkingMessageMetadata {
  thinkingSummary?: string;
  summary?: string;
  duration?: number;
  steps?: number;
  [key: string]: unknown;
}

/**
 * Props for the main MessageBubble component
 */
export interface MessageBubbleProps {
  message: EnhancedMessage;
  showAvatar?: boolean;
  showTimestamp?: boolean;
  enableActions?: boolean;
  /** True when this bubble is the last message in the list — used to control source pill visibility */
  isLastMessage?: boolean;
  onRegenerate?: () => void;
  /** Called when user clicks edit button - passes current content */
  onEdit?: (content: string) => void;
  /** Called when user saves an edited message - passes messageId and new content */
  onEditSave?: (messageId: string, newContent: string) => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onToggleSidecar?: (tab: SidecarMode) => void;
  /** Called when user clicks a follow-up suggestion pill — populates the chat input */
  onSuggestionClick?: (suggestion: string) => void;
}

/**
 * Reaction configuration type
 */
export interface ReactionConfig {
  type: MessageReaction;
  icon: React.ReactNode;
  label: string;
}

/**
 * Lightbox image state
 */
export interface LightboxImage {
  src: string;
  alt: string;
}

/**
 * Context menu position state
 */
export interface ContextMenuPosition {
  x: number;
  y: number;
}

/**
 * Thinking match result from content parsing
 */
export interface ThinkingMatch {
  content: string;
  pattern: string;
  fullMatch: string;
}

/**
 * Approval state for tool calls
 */
export type ApprovalState = 'idle' | 'approving' | 'denying' | 'approved' | 'denied';
