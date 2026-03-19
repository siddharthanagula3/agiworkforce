'use client';

/**
 * EditableMessage - Inline edit mode for user messages.
 *
 * Ported from desktop EditableMessage with web-appropriate styling.
 * Features:
 * - Auto-resizing textarea pre-filled with message content
 * - Auto-focus with cursor at end
 * - Cmd/Ctrl+Enter to save, Escape to cancel
 * - Save and Cancel buttons
 * - Character count near limit
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@shared/ui/button';
import { cn } from '@shared/lib/utils';

export interface EditableMessageProps {
  /** The message object with at least content */
  message: { id: string; content: string };
  /** Called with the new content when the user saves */
  onSave: (newContent: string) => void;
  /** Called when the user cancels editing */
  onCancel: () => void;
  /** Maximum character limit (default 20000) */
  maxLength?: number;
  /** Additional class names */
  className?: string;
}

export function EditableMessage({
  message,
  onSave,
  onCancel,
  maxLength = 20000,
  className,
}: EditableMessageProps) {
  const [content, setContent] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Auto-resize textarea to fit content
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 60), 400);
    textarea.style.height = `${newHeight}px`;
  }, []);

  // Resize on content change
  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  // Auto-focus and place cursor at end on mount
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(content.length, content.length);
    }
    adjustHeight();
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed || trimmed === message.content.trim()) {
      onCancel();
      return;
    }
    setIsSaving(true);
    onSave(trimmed);
  }, [content, message.content, onSave, onCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [handleSave, onCancel],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (e.target.value.length <= maxLength) {
        setContent(e.target.value);
      }
    },
    [maxLength],
  );

  const hasChanges = content.trim() !== message.content.trim();
  const isNearLimit = content.length > maxLength * 0.9;

  return (
    <div className={cn('w-full space-y-2', className)}>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Edit your message..."
        disabled={isSaving}
        className={cn(
          'w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50',
          'border-border transition-all duration-200',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
        style={{ minHeight: '60px', maxHeight: '400px' }}
      />

      {/* Footer: hints and action buttons */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isNearLimit && (
            <span className="tabular-nums text-amber-500">
              {content.length.toLocaleString()} / {maxLength.toLocaleString()}
            </span>
          )}
          <span>
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
              {typeof navigator !== 'undefined' && navigator.platform?.includes('Mac')
                ? '\u2318'
                : 'Ctrl'}
              +Enter
            </kbd>{' '}
            to save
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
            className="h-8 gap-1.5 text-xs"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !content.trim()}
            className={cn('h-8 gap-1.5 text-xs', hasChanges && 'ring-2 ring-primary/30')}
          >
            <Check className="h-3.5 w-3.5" />
            {isSaving ? 'Saving...' : 'Save & Retry'}
          </Button>
        </div>
      </div>
    </div>
  );
}
