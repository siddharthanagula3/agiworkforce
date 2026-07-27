/**
 * MessageBubble Component
 *
 * This file re-exports from the modular MessageBubble directory.
 * The component has been split into smaller, focused sub-components:
 *
 * - MessageHeader: Avatar, name, timestamp, role badge
 * - MessageContent: Main content rendering (markdown, code blocks)
 * - MessageActions: Copy, edit, delete, reaction buttons
 * - MessageAttachments: Attachment display
 * - MessageContextMenu: Right-click context menu
 * - MessageAvatar: Avatar rendering
 * - ToolCallCard: Tool call display with approval
 * - ThinkingMessageBlock: Reasoning/thinking block rendering
 * - InlinePanelList: Inline panel rendering
 * - WidgetList: Embedded widget rendering (INT-001)
 *
 * Custom hooks:
 * - useMessageActions: Copy, edit, delete, bookmark handlers
 * - useMessageReactions: Reaction state and handlers
 *
 * @module MessageBubble
 */

// Re-export everything from the modular directory
export {
  // Main component
  MessageBubble,
  default,
  // Sub-components
  MessageHeader,
  MessageContent,
  MessageActions,
  MessageAttachments,
  MessageContextMenu,
  MessageAvatar,
  ToolCallCard,
  ThinkingMessageBlock,
  InlinePanelList,
  WidgetList,
  // Hooks
  useMessageActions,
  useMessageReactions,
} from './MessageBubble/index';

// Re-export types
export type {
  MessageBubbleProps,
  ThinkingMessageMetadata,
  ReactionConfig,
  LightboxImage,
  ContextMenuPosition,
  ThinkingMatch,
  ApprovalState,
  MessageHeaderProps,
  MessageContentProps,
  MessageActionsProps,
  MessageAttachmentsProps,
  MessageContextMenuProps,
  MessageAvatarProps,
  ToolCallCardProps,
  ThinkingMessageBlockProps,
  InlinePanelListProps,
  WidgetListProps,
  WidgetData,
} from './MessageBubble/index';
