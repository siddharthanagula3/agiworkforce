/**
 * MessageContextMenu Component
 *
 * Right-click context menu for message actions.
 */

import React, { memo, useCallback, useEffect } from 'react';
import { Bookmark, BookmarkCheck, Copy, Edit2, RotateCw, Trash2 } from 'lucide-react';
import { ContextMenuPosition } from './types';

export interface MessageContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  // Message state
  bookmarked?: boolean;
  isUser: boolean;
  isAssistant: boolean;
  hasError?: boolean;
  // Handlers
  onCopy: () => void;
  onBookmark: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
  // Conditional rendering
  canEdit: boolean;
}

const MessageContextMenuComponent: React.FC<MessageContextMenuProps> = ({
  position,
  onClose,
  bookmarked,
  isUser,
  isAssistant,
  hasError,
  onCopy,
  onBookmark,
  onEdit,
  onRegenerate,
  onDelete,
  canEdit,
}) => {
  // Close context menu on click outside or escape
  useEffect(() => {
    if (!position) return;

    const handleClick = () => onClose();
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // BUG-MCM-003: Defer click listener registration so the right-click that opened
    // the menu doesn't immediately bubble up and close it in the same tick.
    const timerId = setTimeout(() => {
      window.addEventListener('click', handleClick);
    }, 0);
    window.addEventListener('keydown', handleEscape);

    return () => {
      clearTimeout(timerId);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [position, onClose]);

  const handleAction = useCallback(
    (action: () => void) => {
      action();
      onClose();
    },
    [onClose],
  );

  if (!position) return null;

  // BUG-MCM-001: Clamp the menu position so it never overflows the viewport edges
  const menuWidth = 200;
  const menuHeight = 150;
  const clampedLeft = Math.min(position.x, window.innerWidth - menuWidth - 8);
  const clampedTop = Math.min(position.y, window.innerHeight - menuHeight - 8);

  return (
    <div
      role="menu"
      aria-label="Message actions"
      className="fixed z-50 min-w-[160px] rounded-lg border border-zinc-700 bg-zinc-800/95 backdrop-blur-xs py-1 shadow-xl"
      style={{ left: clampedLeft, top: clampedTop }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Copy */}
      <button type="button"
        role="menuitem"
        onClick={() => handleAction(onCopy)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700/50 transition-colors"
      >
        <Copy size={14} />
        Copy message
      </button>

      {/* Bookmark */}
      <button type="button"
        role="menuitem"
        onClick={() => handleAction(onBookmark)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700/50 transition-colors"
      >
        {bookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
        {bookmarked ? 'Remove bookmark' : 'Bookmark'}
      </button>

      {/* Edit (user messages only) */}
      {isUser && canEdit && !hasError && onEdit && (
        <button type="button"
          role="menuitem"
          onClick={() => handleAction(onEdit)}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700/50 transition-colors"
        >
          <Edit2 size={14} />
          Edit message
        </button>
      )}

      {/* Regenerate (assistant messages only) */}
      {isAssistant && onRegenerate && !hasError && (
        <button type="button"
          role="menuitem"
          onClick={() => handleAction(onRegenerate)}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700/50 transition-colors"
        >
          <RotateCw size={14} />
          Regenerate
        </button>
      )}

      {/* Delete */}
      {onDelete && (
        <>
          <div role="separator" className="my-1 border-t border-zinc-700" />
          <button type="button"
            role="menuitem"
            onClick={() => handleAction(onDelete)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </>
      )}
    </div>
  );
};

MessageContextMenuComponent.displayName = 'MessageContextMenu';

export const MessageContextMenu = memo(MessageContextMenuComponent);
