/**
 * Chat Input Hooks
 *
 * Custom hooks for the ChatInputArea component.
 */

export { useAttachments, ATTACHMENT_LIMITS } from './useAttachments';
export type { UseAttachmentsOptions, UseAttachmentsReturn } from './useAttachments';

export { useDragAndDrop } from './useDragAndDrop';
export type { UseDragAndDropOptions, UseDragAndDropReturn } from './useDragAndDrop';

export { useChatSubmit } from './useChatSubmit';
export type { UseChatSubmitOptions, UseChatSubmitReturn, SendOptions } from './useChatSubmit';

export { useKeyboardShortcuts } from './useKeyboardShortcuts';
export type { UseKeyboardShortcutsOptions } from './useKeyboardShortcuts';

export { useClickOutside } from './useClickOutside';
export type { UseClickOutsideOptions } from './useClickOutside';

export { useAutoResize } from './useAutoResize';
export type { UseAutoResizeOptions } from './useAutoResize';
