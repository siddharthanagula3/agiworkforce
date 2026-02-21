/**
 * EditableMessage Component
 *
 * A textarea-based edit mode component for user messages.
 * Features:
 * - Auto-resizing textarea
 * - Keyboard shortcuts (Ctrl/Cmd+Enter to save, Escape to cancel)
 * - Character count indicator
 * - Save/Cancel action buttons
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface EditableMessageProps {
  /** The initial content to edit */
  initialContent: string;
  /** Called when the user saves the edited message */
  onSave: (newContent: string) => void;
  /** Called when the user cancels editing */
  onCancel: () => void;
  /** Optional maximum character limit */
  maxLength?: number;
  /** Optional class name for the container */
  className?: string;
  /** Whether to auto-focus the textarea */
  autoFocus?: boolean;
}

export const EditableMessage: React.FC<EditableMessageProps> = ({
  initialContent,
  onSave,
  onCancel,
  maxLength = 20000,
  className,
  autoFocus = true,
}) => {
  const [content, setContent] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Auto-resize textarea based on content
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set height to scrollHeight, with min and max constraints
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 60), 400);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  // Adjust height on content change
  useEffect(() => {
    adjustTextareaHeight();
  }, [content, adjustTextareaHeight]);

  // Auto-focus and adjust height on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end
      textareaRef.current.setSelectionRange(content.length, content.length);
    }
    adjustTextareaHeight();
  }, [autoFocus, adjustTextareaHeight, content.length]);

  const handleSave = useCallback(() => {
    const trimmedContent = content.trim();
    if (trimmedContent && trimmedContent !== initialContent.trim()) {
      setIsSaving(true);
      onSave(trimmedContent);
    } else if (!trimmedContent) {
      // Empty content, cancel instead
      onCancel();
    } else {
      // No changes, just cancel
      onCancel();
    }
  }, [content, initialContent, onSave, onCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl/Cmd + Enter to save
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
        return;
      }

      // Escape to cancel
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
    },
    [handleSave, onCancel],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      if (newValue.length <= maxLength) {
        setContent(newValue);
      }
    },
    [maxLength],
  );

  const hasChanges = content.trim() !== initialContent.trim();
  const characterCount = content.length;
  const isNearLimit = characterCount > maxLength * 0.9;

  return (
    <div className={cn('w-full space-y-2', className)}>
      {/* Textarea */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Edit your message..."
          className={cn(
            'w-full resize-none rounded-lg border bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100',
            'placeholder:text-zinc-500 focus:outline-hidden focus:ring-2 focus:ring-primary/50',
            'border-zinc-700 focus:border-primary/50',
            'transition-all duration-200',
          )}
          style={{ minHeight: '60px', maxHeight: '400px' }}
          disabled={isSaving}
        />
      </div>

      {/* Footer with character count and actions */}
      <div className="flex items-center justify-between gap-2">
        {/* Character count */}
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span
            className={cn(
              'tabular-nums transition-colors',
              isNearLimit ? 'text-amber-400' : 'text-zinc-500',
            )}
          >
            {characterCount.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-600">
            <kbd className="px-1 py-0.5 bg-zinc-700/50 rounded text-[10px] font-mono">
              {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
            </kbd>{' '}
            to save
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium',
              'bg-zinc-700/50 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100',
              'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <X size={14} />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !content.trim()}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium',
              'bg-primary/90 text-white hover:bg-primary',
              'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              hasChanges && 'ring-2 ring-primary/30',
            )}
          >
            <Check size={14} />
            {isSaving ? 'Saving...' : 'Save & Regenerate'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditableMessage;
