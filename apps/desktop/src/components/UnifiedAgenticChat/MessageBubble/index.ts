/**
 * MessageBubble Module
 *
 * Exports the MessageBubble component and all sub-components.
 */

// Main component
export { MessageBubble, default } from './MessageBubble';

// Sub-components
export { MessageHeader } from './MessageHeader';
export { MessageContent } from './MessageContent';
export { MessageActions } from './MessageActions';
export { MessageAttachments } from './MessageAttachments';
export { MessageContextMenu } from './MessageContextMenu';
export { MessageAvatar } from './MessageAvatar';
export { ToolCallCard } from './ToolCallCard';
export { ThinkingMessageBlock } from './ThinkingMessageBlock';
export { InlinePanelList } from './InlinePanelList';
export { WidgetList } from './WidgetList';

// Hooks
export { useMessageActions } from './useMessageActions';
export { useMessageReactions } from './useMessageReactions';

// Types
export type {
  MessageBubbleProps,
  ThinkingMessageMetadata,
  ReactionConfig,
  LightboxImage,
  ContextMenuPosition,
  ThinkingMatch,
  ApprovalState,
} from './types';

// Re-export sub-component prop types
export type { MessageHeaderProps } from './MessageHeader';
export type { MessageContentProps } from './MessageContent';
export type { MessageActionsProps } from './MessageActions';
export type { MessageAttachmentsProps } from './MessageAttachments';
export type { MessageContextMenuProps } from './MessageContextMenu';
export type { MessageAvatarProps } from './MessageAvatar';
export type { ToolCallCardProps } from './ToolCallCard';
export type { ThinkingMessageBlockProps } from './ThinkingMessageBlock';
export type { InlinePanelListProps } from './InlinePanelList';
export type { WidgetListProps, WidgetData } from './WidgetList';
