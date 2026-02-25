/**
 * MessageActions Component
 *
 * Renders action buttons for messages including copy, bookmark,
 * reactions, regenerate, edit, and delete.
 */

import React, { memo } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Copy,
  Edit2,
  RotateCw,
  SmilePlus,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { MessageReaction } from '../../../stores/unifiedChatStore';
import { ReactionConfig } from './types';

export interface MessageActionsProps {
  // State
  showActions: boolean;
  copied: boolean;
  bookmarked?: boolean;
  isEditing: boolean;
  reactions?: MessageReaction[];
  isAssistant: boolean;
  isUser: boolean;
  hasError?: boolean;

  // Reaction picker
  reactionConfigs: ReactionConfig[];
  showReactionPicker: boolean;
  onToggleReactionPicker: () => void;
  onReaction: (reaction: MessageReaction) => void;

  // Handlers
  onCopy: () => void;
  onBookmark: () => void;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onStartEdit?: () => void;
  onDelete?: () => void;
  onSpeak?: () => void;

  // Conditional rendering
  canEdit: boolean;
  canRegenerate: boolean;
  isSpeaking?: boolean;
  ttsSupported?: boolean;
}

const MessageActionsComponent: React.FC<MessageActionsProps> = ({
  showActions,
  copied,
  bookmarked,
  isEditing,
  reactions,
  isAssistant,
  isUser,
  hasError,
  reactionConfigs,
  showReactionPicker,
  onToggleReactionPicker,
  onReaction,
  onCopy,
  onBookmark,
  onRegenerate,
  onRetry,
  onStartEdit,
  onDelete,
  onSpeak,
  canEdit,
  canRegenerate,
  isSpeaking,
  ttsSupported,
}) => {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-1 mt-2 transition-opacity focus-within:opacity-100',
        showActions ? 'opacity-100' : 'opacity-0 focus-within:opacity-100',
      )}
      role="group"
      aria-label="Message actions"
    >
      {/* Copy button */}
      <button
        onClick={onCopy}
        className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
        title="Copy message"
      >
        {copied ? (
          <Check size={14} className="text-emerald-500" />
        ) : (
          <Copy size={14} className="text-zinc-600 dark:text-zinc-400" />
        )}
      </button>

      {/* Speak button — assistant only, requires browser TTS */}
      {isAssistant && ttsSupported && onSpeak && (
        <button
          onClick={onSpeak}
          className={cn(
            'p-1.5 rounded transition-colors',
            isSpeaking
              ? 'bg-teal-500/20 text-teal-400 hover:bg-teal-500/30'
              : 'hover:bg-zinc-200 dark:hover:bg-zinc-700',
          )}
          title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
          aria-label={isSpeaking ? 'Stop reading aloud' : 'Read message aloud'}
        >
          {isSpeaking ? (
            <Square size={14} className="text-teal-400" />
          ) : (
            <Volume2 size={14} className="text-zinc-600 dark:text-zinc-400" />
          )}
        </button>
      )}

      {/* Bookmark button */}
      <button
        onClick={onBookmark}
        className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
        title={bookmarked ? 'Remove bookmark' : 'Bookmark message'}
      >
        {bookmarked ? (
          <BookmarkCheck size={14} className="text-amber-500" />
        ) : (
          <Bookmark size={14} className="text-zinc-600 dark:text-zinc-400" />
        )}
      </button>

      {/* Reaction picker */}
      <div className="relative">
        <button
          onClick={onToggleReactionPicker}
          className={cn(
            'p-1.5 rounded transition-colors',
            showReactionPicker
              ? 'bg-zinc-200 dark:bg-zinc-700'
              : 'hover:bg-zinc-200 dark:hover:bg-zinc-700',
          )}
          title="Add reaction"
        >
          <SmilePlus size={14} className="text-zinc-600 dark:text-zinc-400" />
        </button>

        {/* Reaction picker dropdown */}
        {showReactionPicker && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex items-center gap-0.5 p-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full shadow-lg z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {reactionConfigs.map((reaction) => (
              <button
                key={reaction.type}
                onClick={() => onReaction(reaction.type)}
                className={cn(
                  'p-1.5 rounded-full transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700',
                  reactions?.includes(reaction.type) && 'bg-primary/20 text-primary',
                )}
                title={reaction.label}
              >
                {reaction.icon}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Existing reactions display */}
      {reactions && reactions.length > 0 && (
        <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-full">
          {reactionConfigs
            .filter((r) => reactions?.includes(r.type))
            .map((reaction) => (
              <button
                key={reaction.type}
                onClick={() => onReaction(reaction.type)}
                className="p-0.5 hover:scale-110 transition-transform"
                title={`Remove ${reaction.label}`}
              >
                {reaction.icon}
              </button>
            ))}
        </div>
      )}

      {/* Regenerate button (assistant only) */}
      {isAssistant && canRegenerate && !hasError && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
          title="Regenerate"
        >
          <RotateCw size={14} className="text-zinc-600 dark:text-zinc-400" />
        </button>
      )}

      {/* Retry button (for failed messages) */}
      {hasError && onRetry && (
        <button
          onClick={onRetry}
          className="p-1.5 hover:bg-red-200 dark:hover:bg-red-900/30 rounded transition-colors"
          title="Retry sending"
        >
          <RotateCw size={14} className="text-red-600 dark:text-red-400" />
        </button>
      )}

      {/* Edit button (user only) */}
      {isUser && canEdit && !hasError && !isEditing && onStartEdit && (
        <button
          onClick={onStartEdit}
          className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
          title="Edit message"
        >
          <Edit2 size={14} className="text-zinc-600 dark:text-zinc-400" />
        </button>
      )}

      {/* Delete button */}
      {onDelete && (
        <button
          onClick={onDelete}
          className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
          title="Delete"
        >
          <Trash2 size={14} className="text-zinc-600 dark:text-zinc-400" />
        </button>
      )}
    </div>
  );
};

MessageActionsComponent.displayName = 'MessageActions';

export const MessageActions = memo(MessageActionsComponent);
