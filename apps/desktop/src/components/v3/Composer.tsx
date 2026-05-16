import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { ArrowUp, Mic, Plus, Square, ChevronDown } from 'lucide-react';
import { cn, useChatStore, useChatModelStore } from '@agiworkforce/unified-chat';
import { PlusMenu } from './PlusMenu';
import { ModelPopover } from './ModelPopover';
import { MicSettings } from './MicSettings';

export interface ComposerProps {
  onSend: (content: string) => void;
  onStop: () => void;
  /** Overrides default placeholder text */
  placeholder?: string;
  /** When true, focus the textarea on mount */
  autoFocus?: boolean;
  /** Compact mode omits the footer disclaimer */
  size?: 'default' | 'compact';
  className?: string;
}

/**
 * v3 standalone Composer.
 *
 * Replaces unified-chat's ChatInput for the v3 shell. Decision: ChatInput does
 * not expose `composerActionsSlot` / `modelPopoverSlot`, so this is a
 * standalone implementation wired directly to the same Zustand stores
 * (useChatStore + useChatModelStore) that ChatInput uses.
 *
 * PlusMenu and ModelPopover are v3-specific popovers mounted inside this
 * component's relative container.
 *
 * MicSettings is loaded from window.AGIPlugins?.MicSettings (built by
 * desktop-overlays teammate) — window stub pattern matches design source.
 */
export function Composer({
  onSend,
  onStop,
  placeholder,
  autoFocus = false,
  size = 'default',
  className,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [focused, setFocused] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [micOpen, setMicOpen] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  const isStreaming = useChatStore((s) => s.isStreaming);
  const draftContent = useChatStore((s) => s.draftContent);
  const setDraftContent = useChatStore((s) => s.setDraftContent);
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  const selectedModelId = useChatModelStore((s) => s.selectedModelId);
  const models = useChatModelStore((s) => s.models);
  const thinkingEnabled = useChatModelStore((s) => s.thinkingEnabled);

  const selectedModel = models.find((m) => m.id === selectedModelId);
  const modelName = selectedModel?.name ?? selectedModelId;

  const isFocused = focused || plusOpen || modelOpen;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, []);

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [autoFocus]);

  // Apply draft content from chip clicks
  useEffect(() => {
    if (draftContent && textareaRef.current) {
      textareaRef.current.value = draftContent;
      textareaRef.current.focus();
      adjustHeight();
      setHasContent(Boolean(draftContent.trim()));
      setDraftContent('');
    }
  }, [draftContent, setDraftContent, adjustHeight]);

  // Close popovers on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as Node)) return;
      setPlusOpen(false);
      setModelOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setHasContent(Boolean(e.target.value.trim()));
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
    setHasContent(false);
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

  const resolvedPlaceholder =
    placeholder ??
    (activeConversationId ? 'Reply, or ask a follow-up…' : 'How can I help you today?');

  return (
    <div ref={wrapRef} className={cn('relative mx-auto w-full max-w-3xl px-4 pb-2', className)}>
      <div
        className={cn(
          'overflow-visible border transition-shadow',
          'bg-[var(--chat-surface-elevated)]',
          isFocused
            ? 'border-[var(--chat-border-strong,var(--chat-border))] shadow-[0_0_0_2px_rgba(33,128,141,0.25)]'
            : 'border-[var(--chat-border)]',
        )}
        style={{ borderRadius: 16 }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={resolvedPlaceholder}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn(
            'w-full resize-none border-0 bg-transparent px-4 pt-3 pb-1',
            'text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)]',
            'focus:outline-none min-h-[28px]',
          )}
          style={{ maxHeight: 240, overflowY: 'auto' }}
          aria-label="Chat message input"
        />

        {/* Toolbar */}
        <div className="relative flex items-center justify-between px-3 py-2">
          {/* Left: Plus button */}
          <button
            type="button"
            aria-label="Add files, skills, connectors…"
            aria-expanded={plusOpen}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              'text-[var(--chat-text-secondary)] transition-colors duration-150',
              'hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
              plusOpen && 'bg-[var(--chat-surface-hover)] text-[var(--chat-accent-primary)]',
            )}
            onClick={() => {
              setPlusOpen((o) => !o);
              setModelOpen(false);
            }}
          >
            <Plus size={16} />
          </button>

          {/* Right: Model pill + Mic + Send/Stop */}
          <div className="flex items-center gap-2">
            {/* Model pill */}
            <button
              type="button"
              aria-label="Choose model"
              aria-expanded={modelOpen}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-lg px-2.5',
                'text-xs font-medium transition-colors duration-150',
                'text-[var(--chat-text-secondary)]',
                'hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                modelOpen && 'bg-[var(--chat-surface-hover)] text-[var(--chat-text-primary)]',
              )}
              onClick={() => {
                setModelOpen((o) => !o);
                setPlusOpen(false);
              }}
            >
              <span>{modelName}</span>
              {/* Adaptive/Standard read-only HUD — shows current thinking state */}
              <span
                className="rounded px-1 py-0.5 text-[10px] font-semibold"
                style={
                  thinkingEnabled
                    ? { background: 'rgba(33,128,141,0.15)', color: 'var(--chat-accent-primary)' }
                    : { background: 'var(--chat-surface-hover)', color: 'var(--chat-text-muted)' }
                }
              >
                {thinkingEnabled ? 'Adaptive' : 'Standard'}
              </span>
              <ChevronDown size={12} />
            </button>

            {/* Mic button */}
            {!isStreaming && (
              <button
                type="button"
                aria-label="Voice input settings"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full',
                  'text-[var(--chat-text-secondary)] transition-colors duration-150',
                  'hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setMicOpen((o) => !o);
                }}
              >
                <Mic size={15} strokeWidth={1.75} />
              </button>
            )}

            {/* Send / Stop */}
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generation"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--chat-accent-primary)] text-white transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]"
              >
                <Square size={13} />
              </button>
            ) : hasContent ? (
              <button
                type="button"
                onClick={handleSend}
                aria-label="Send message"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--chat-accent-primary)] text-white transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]"
              >
                <ArrowUp size={16} strokeWidth={2} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Footer disclaimer */}
      {isFocused && size !== 'compact' && (
        <p className="mt-1.5 text-center text-[11px]" style={{ color: 'var(--chat-text-muted)' }}>
          AI can make mistakes. Please double-check responses.
        </p>
      )}

      {/* Popovers — bottom-full positions them above the composer */}
      <div className="absolute bottom-full left-0 right-0">
        {plusOpen && (
          <PlusMenu
            onClose={() => setPlusOpen(false)}
            webSearchOn={true}
            onWebSearchToggle={() => {}}
            onInsertCommand={(cmd) => {
              if (textareaRef.current) {
                textareaRef.current.value = cmd + ' ';
                textareaRef.current.focus();
                adjustHeight();
                setHasContent(true);
              }
              setPlusOpen(false);
            }}
          />
        )}
        {modelOpen && <ModelPopover onClose={() => setModelOpen(false)} />}
      </div>

      {micOpen && <MicSettings onClose={() => setMicOpen(false)} />}
    </div>
  );
}
