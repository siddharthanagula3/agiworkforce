/**
 * ConversationListItem - Clean, minimal conversation item
 *
 * Redesigned with:
 * - Minimal default state (title + time only)
 * - Indicators shown subtly
 * - Actions on hover
 * - Progressive disclosure
 */

import React, { useState, useCallback, memo } from 'react';
import { Button } from '@shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shared/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@shared/ui/alert-dialog';
import { Star, Pin, Archive, MoreHorizontal, Edit, Trash2, Share2, Copy } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface ConversationListItemProps {
  id: string;
  title: string;
  summary?: string;
  updatedAt: Date;
  totalMessages: number;
  isActive: boolean;
  isStarred?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
  tags?: string[];
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onStar?: () => void;
  onPin?: () => void;
  onArchive?: () => void;
  onShare?: () => void;
  onDuplicate?: () => void;
}

export const ConversationListItem = memo(function ConversationListItem({
  title,
  updatedAt,
  isActive,
  isStarred,
  isPinned,
  isArchived,
  tags: _tags = [],
  onClick,
  onRename,
  onDelete,
  onStar,
  onPin,
  onArchive,
  onShare,
  onDuplicate,
}: ConversationListItemProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Memoize event handlers to prevent unnecessary re-renders
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    },
    [onClick],
  );

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  }, []);

  const handleConfirmDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete?.();
      setShowDeleteDialog(false);
    },
    [onDelete],
  );

  const stopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handlePinClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onPin?.();
    },
    [onPin],
  );

  const handleStarClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onStar?.();
    },
    [onStar],
  );

  const handleRenameClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRename?.();
    },
    [onRename],
  );

  const handleDuplicateClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDuplicate?.();
    },
    [onDuplicate],
  );

  const handleShareClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onShare?.();
    },
    [onShare],
  );

  const handleArchiveClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onArchive?.();
    },
    [onArchive],
  );

  return (
    <>
      <div
        className={cn(
          'group relative flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition-all',
          isActive
            ? 'bg-teal-100 dark:bg-teal-900/30 text-foreground'
            : 'text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-foreground',
          isArchived && 'opacity-50',
        )}
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label={`${title}${isStarred ? ', starred' : ''}${isPinned ? ', pinned' : ''}${isArchived ? ', archived' : ''}`}
        aria-current={isActive ? 'true' : undefined}
        onKeyDown={handleKeyDown}
      >
        {/* Pin indicator - subtle left border */}
        {isPinned && (
          <div className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-yellow-500" />
        )}

        {/* Main content */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium" title={title}>
              {title}
            </span>
            {isStarred && (
              <Star
                className="h-3 w-3 flex-shrink-0 fill-yellow-500 text-yellow-500"
                aria-hidden="true"
              />
            )}
          </div>

          {/* Time - always visible but subtle */}
          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
            {formatDistanceToNow(updatedAt, { addSuffix: true })}
          </div>
        </div>

        {/* Actions Menu - show on hover */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7 flex-shrink-0 text-gray-400 hover:text-teal-500 opacity-0 transition-opacity group-hover:opacity-100',
                isActive && 'opacity-100',
              )}
              onClick={stopPropagation}
              aria-label="Conversation options"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-44">
            {onPin && (
              <DropdownMenuItem onClick={handlePinClick}>
                <Pin
                  className={cn('mr-2 h-4 w-4', isPinned && 'fill-current text-yellow-500')}
                  aria-hidden="true"
                />
                {isPinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
            )}

            {onStar && (
              <DropdownMenuItem onClick={handleStarClick}>
                <Star
                  className={cn('mr-2 h-4 w-4', isStarred && 'fill-current text-yellow-500')}
                  aria-hidden="true"
                />
                {isStarred ? 'Unstar' : 'Star'}
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            {onRename && (
              <DropdownMenuItem onClick={handleRenameClick}>
                <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
                Rename
              </DropdownMenuItem>
            )}

            {onDuplicate && (
              <DropdownMenuItem onClick={handleDuplicateClick}>
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                Duplicate
              </DropdownMenuItem>
            )}

            {onShare && (
              <DropdownMenuItem onClick={handleShareClick}>
                <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Share
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            {onArchive && (
              <DropdownMenuItem onClick={handleArchiveClick}>
                <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                {isArchived ? 'Unarchive' : 'Archive'}
              </DropdownMenuItem>
            )}

            {onDelete && (
              <DropdownMenuItem
                onClick={handleDeleteClick}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={stopPropagation}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{title}&quot; and all its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={stopPropagation}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
