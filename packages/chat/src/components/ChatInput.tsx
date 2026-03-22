import { useRef, useEffect, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { Mic, Plus, Square, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { useChatStore } from '../stores/chatStore';
import { useModel } from '../hooks/useModel';

export interface ChatInputProps {
  onSend: (content: string) => void;
  onStop: () => void;
  onPlusClick: () => void;
  onModelSelectorClick: () => void;
  onVoiceClick: () => void;
  hasMessages: boolean;
  className?: string;
}

export function ChatInput({
  onSend,
  onStop,
  onPlusClick,
  onModelSelectorClick,
  onVoiceClick,
  hasMessages,
  className,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const { displayName } = useModel();

  const draftContent = useChatStore((s) => s.draftContent);
  const setDraftContent = useChatStore((s) => s.setDraftContent);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-expand textarea height
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  // Apply draft content from store (e.g. from chip clicks)
  useEffect(() => {
    if (draftContent && textareaRef.current) {
      textareaRef.current.value = draftContent;
      textareaRef.current.focus();
      adjustHeight();
      setDraftContent('');
    }
  }, [draftContent, setDraftContent, adjustHeight]);

  const handleChange = useCallback(
    (_e: ChangeEvent<HTMLTextAreaElement>) => {
      adjustHeight();
    },
    [adjustHeight],
  );

  const handleSend = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const content = el.value.trim();
    if (!content || isStreaming) return;
    onSend(content);
    el.value = '';
    el.style.height = 'auto';
  }, [isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const placeholder = hasMessages ? 'Reply...' : 'How can I help you today?';

  return (
    <div className={cn('mx-auto w-full max-w-3xl px-4 pb-2', className)}>
      <div
        className={cn(
          'overflow-hidden rounded-2xl border border-[var(--chat-border)]',
          'bg-[var(--chat-surface-elevated)]',
        )}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={placeholder}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={cn(
            'w-full resize-none border-0 bg-transparent px-4 pt-3 pb-1',
            'text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)]',
            'focus:outline-none',
            'min-h-[44px]',
          )}
          style={{ maxHeight: 200 }}
          aria-label="Chat message input"
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 py-2">
          {/* Left: Plus button */}
          <button
            type="button"
            onClick={onPlusClick}
            aria-label="Add attachment or action"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              'text-[var(--chat-text-secondary)] transition-colors duration-150',
              'hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
            )}
          >
            <Plus size={16} />
          </button>

          {/* Right: Model selector + mic/stop */}
          <div className="flex items-center gap-2">
            {/* Model selector */}
            <button
              type="button"
              onClick={onModelSelectorClick}
              aria-label="Select model"
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2.5 py-1',
                'text-xs text-[var(--chat-text-secondary)] transition-colors duration-150',
                'hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
              )}
            >
              <span className="max-w-[140px] truncate font-medium">{displayName}</span>
              <ChevronDown size={12} className="shrink-0 opacity-60" />
            </button>

            {/* Mic / Stop */}
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generation"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg',
                  'text-[var(--chat-destructive)] transition-colors duration-150',
                  'hover:bg-[var(--chat-destructive)]/10',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                )}
              >
                <Square size={15} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onVoiceClick}
                aria-label="Voice input"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg',
                  'text-[var(--chat-text-secondary)] transition-colors duration-150',
                  'hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                )}
              >
                <Mic size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
