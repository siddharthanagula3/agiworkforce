import {
  useRef,
  useEffect,
  useCallback,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { Mic, Plus, Square, ChevronDown, Check, Settings } from 'lucide-react';
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
  /**
   * When true the textarea and send path are disabled.
   * `disabledMessage` is shown as the placeholder text.
   */
  disabled?: boolean;
  disabledMessage?: string;
}

export function ChatInput({
  onSend,
  onStop,
  onPlusClick: _onPlusClick,
  onModelSelectorClick,
  onVoiceClick,
  hasMessages,
  className,
  disabled = false,
  disabledMessage,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const { displayName, models, selectedModelId, selectModel } = useModel();
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

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

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [modelDropdownOpen]);

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
    if (disabled) return;
    const el = textareaRef.current;
    if (!el) return;
    const content = el.value.trim();
    if (!content || isStreaming) return;
    onSend(content);
    el.value = '';
    el.style.height = 'auto';
    setAttachedFiles([]);
  }, [disabled, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const placeholder = disabled
    ? (disabledMessage ?? 'Connect to start chatting')
    : hasMessages
      ? 'Reply...'
      : 'How can I help you today?';

  return (
    <div className={cn('mx-auto w-full max-w-3xl px-4 pb-2', className)}>
      <div
        className={cn(
          'overflow-hidden rounded-2xl border border-[var(--chat-border)]',
          'bg-[var(--chat-surface-elevated)]',
        )}
      >
        {/* Attached files preview */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2">
            {attachedFiles.map((file, i) => (
              <span
                key={`${file.name}-${i}`}
                className="inline-flex items-center gap-1 rounded-md bg-[var(--chat-surface-hover)] px-2 py-0.5 text-xs text-[var(--chat-text-secondary)]"
              >
                {file.name}
                <button
                  type="button"
                  onClick={() => setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="ml-0.5 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-primary)]"
                  aria-label={`Remove ${file.name}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={placeholder}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={cn(
            'w-full resize-none border-0 bg-transparent px-4 pt-3 pb-1',
            'text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)]',
            'focus:outline-none',
            'min-h-[44px]',
            disabled && 'cursor-not-allowed opacity-50',
          )}
          style={{ maxHeight: 200 }}
          aria-label="Chat message input"
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 py-2">
          {/* Left: Plus button — opens file picker */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,.pdf,.txt,.md,.csv,.json,.js,.ts,.py,.rs,.go,.java,.html,.css"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) {
                setAttachedFiles(Array.from(files));
              }
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Add attachment"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              'text-[var(--chat-text-secondary)] transition-colors duration-150',
              'hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
              attachedFiles.length > 0 && 'text-[var(--chat-accent-primary)]',
            )}
          >
            <Plus size={16} />
            {attachedFiles.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--chat-accent-primary)] text-[8px] font-bold text-white">
                {attachedFiles.length}
              </span>
            )}
          </button>

          {/* Right: Model selector + mic/stop */}
          <div className="flex items-center gap-2">
            {/* Model selector with dropdown */}
            <div className="relative" ref={modelDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  if (models.length > 0) {
                    setModelDropdownOpen((prev) => !prev);
                  } else {
                    onModelSelectorClick();
                  }
                }}
                aria-label="Select model"
                aria-expanded={modelDropdownOpen}
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

              {modelDropdownOpen && models.length > 0 && (
                <div className="absolute bottom-full mb-1 right-0 z-50 w-64 max-h-80 overflow-y-auto rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] shadow-lg">
                  <div className="p-1">
                    {/* Group models by provider */}
                    {Object.entries(
                      models.reduce<Record<string, typeof models>>((acc, m) => {
                        const key = m.provider.charAt(0).toUpperCase() + m.provider.slice(1);
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(m);
                        return acc;
                      }, {}),
                    ).map(([provider, providerModels]) => (
                      <div key={provider}>
                        <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--chat-text-muted)]">
                          {provider}
                        </p>
                        {providerModels.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              selectModel(m.id);
                              setModelDropdownOpen(false);
                            }}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                              m.id === selectedModelId
                                ? 'bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary)]'
                                : 'text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]',
                            )}
                          >
                            <span className="flex-1 truncate">{m.name}</span>
                            {m.id === selectedModelId && <Check size={14} className="shrink-0" />}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                  {/* Settings link at bottom */}
                  <div className="border-t border-[var(--chat-border)] p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setModelDropdownOpen(false);
                        onModelSelectorClick();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
                    >
                      <Settings size={13} />
                      <span>Manage API Keys</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

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
