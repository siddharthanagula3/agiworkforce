import {
  useRef,
  useEffect,
  useCallback,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { ArrowUp, Mic, Plus, Square } from 'lucide-react';
import { cleanupVoiceDictation, detectVoiceCommand } from '@agiworkforce/utils';
import { cn } from '../lib/utils';
import { useChatStore } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';
import { AttachmentMenu } from './AttachmentMenu';
import { ModelSelector } from './ModelSelector';
import { AgentControl } from './AgentControl';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useAgentControlStore } from '../stores/agentControlStore';
import { PROVIDER_DISPLAY, type ProviderId } from '@agiworkforce/types';

export interface ChatInputProps {
  onSend: (content: string, agentMode?: string, effort?: string) => void;
  onStop: () => void;
  onPlusClick: () => void;
  onModelSelectorClick: () => void;
  onVoiceClick?: () => void;
  hasMessages: boolean;
  className?: string;
  /**
   * When true the textarea and send path are disabled.
   * `disabledMessage` is shown as the placeholder text.
   */
  disabled?: boolean;
  disabledMessage?: string;
  /**
   * The active conversation ID — used to look up agent control state.
   * If omitted the AgentControl row is not rendered.
   */
  conversationId?: string | null;
  /**
   * The project this conversation belongs to.
   * Used by AgentControl to read/write project-level defaults.
   */
  projectId?: string | null;
}

export function ChatInput({
  onSend,
  onStop,
  onPlusClick: _onPlusClick,
  onModelSelectorClick,
  onVoiceClick: _onVoiceClick,
  hasMessages,
  className,
  disabled = false,
  disabledMessage,
  conversationId,
  projectId,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [activeStyle, setActiveStyle] = useState<
    'formal' | 'casual' | 'concise' | 'detailed' | null
  >(null);

  // Read the currently selected model's provider to determine effort visibility
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const models = useModelStore((s) => s.models);
  const selectedModel = models.find((m) => m.id === selectedModelId);
  const modelProviderId = (selectedModel?.provider as string) ?? '';

  // Resolve agent control state for the active conversation
  const resolveAgentControl = useAgentControlStore((s) => s.resolve);
  const showAgentControl = Boolean(conversationId);
  const { state: voiceState, start: startVoice } = useVoiceInput({
    onTranscript: (text) => {
      const el = textareaRef.current;
      if (!el) return;
      const current = el.value;
      const cleanedText = cleanupVoiceDictation(text);
      const isCommand = detectVoiceCommand(cleanedText);
      el.value = isCommand ? cleanedText : current ? `${current} ${cleanedText}` : cleanedText;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
    },
  });

  const draftContent = useChatStore((s) => s.draftContent);
  const setDraftContent = useChatStore((s) => s.setDraftContent);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-expand textarea height — grows to 240px then scrolls internally
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
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
    if (disabled) return;
    const el = textareaRef.current;
    if (!el) return;
    const content = el.value.trim();
    if (!content || isStreaming) return;

    // Read current agent control state and forward to onSend
    let agentMode: string | undefined;
    let effort: string | undefined;
    if (conversationId) {
      const agentState = resolveAgentControl(conversationId, projectId ?? null);
      agentMode = agentState.mode;
      // Only pass effort when the model's provider supports it
      const providerKey = modelProviderId as ProviderId;
      if (PROVIDER_DISPLAY[providerKey]?.supportsEffort) {
        effort = agentState.effort;
      }
    }

    onSend(content, agentMode, effort);
    el.value = '';
    el.style.height = 'auto';
    setAttachedFiles([]);
  }, [
    disabled,
    isStreaming,
    onSend,
    conversationId,
    projectId,
    resolveAgentControl,
    modelProviderId,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl+Enter sends; plain Enter inserts newline (Claude/ChatGPT/Codex Desktop pattern)
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const [focused, setFocused] = useState(false);
  const modKey = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';

  const placeholder = disabled
    ? (disabledMessage ?? 'Connect to start chatting')
    : hasMessages
      ? 'Reply...'
      : 'How can I help you today?';

  return (
    <div className={cn('mx-auto w-full max-w-3xl px-4 pb-2', className)}>
      <div
        className={cn(
          'overflow-hidden border',
          'bg-[var(--chat-surface-elevated)]',
          focused
            ? 'border-[var(--chat-border-strong,var(--chat-border))] shadow-[0_0_0_2px_rgba(33,128,141,0.25)]'
            : 'border-[var(--chat-border)]',
        )}
        style={{ borderRadius: 16 }}
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          className={cn(
            'w-full resize-none border-0 bg-transparent px-4 pt-3 pb-1',
            'text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)]',
            'focus:outline-none',
            'min-h-[28px]',
            disabled && 'cursor-not-allowed opacity-50',
          )}
          style={{ maxHeight: 240, overflowY: 'auto' }}
          aria-label="Chat message input"
        />

        {/* Bottom toolbar */}
        <div className="relative flex items-center justify-between px-3 py-2">
          {/* Left: Plus button — opens attachment menu */}
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
          <AttachmentMenu
            open={attachmentMenuOpen}
            onOpenChange={setAttachmentMenuOpen}
            onAddFiles={() => fileInputRef.current?.click()}
            webSearchEnabled={webSearchEnabled}
            onWebSearchToggle={() => setWebSearchEnabled((v) => !v)}
            researchEnabled={researchEnabled}
            onResearchToggle={() => setResearchEnabled((v) => !v)}
            activeStyle={activeStyle}
            onStyleChange={setActiveStyle}
            onScreenshot={(file) => setAttachedFiles((prev) => [...prev, file])}
          >
            <button
              ref={plusButtonRef}
              type="button"
              aria-label="Add attachment"
              aria-expanded={attachmentMenuOpen}
              className={cn(
                'relative flex h-8 w-8 items-center justify-center rounded-lg',
                'text-[var(--chat-text-secondary)] transition-colors duration-150',
                'hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                (attachedFiles.length > 0 || attachmentMenuOpen) &&
                  'text-[var(--chat-accent-primary)]',
              )}
            >
              <Plus size={16} />
              {attachedFiles.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--chat-accent-primary)] text-[8px] font-bold text-white">
                  {attachedFiles.length}
                </span>
              )}
            </button>
          </AttachmentMenu>

          {/* Center: Agent control chips — only when a conversation is active */}
          {showAgentControl && conversationId && (
            <AgentControl
              conversationId={conversationId}
              projectId={projectId ?? null}
              modelProviderId={modelProviderId}
            />
          )}

          {/* Right: Model selector + mic + send */}
          <div className="flex items-center gap-2">
            {/* Inline model selector popover */}
            <ModelSelector onSettingsClick={onModelSelectorClick} />

            {/* Mic button — ghost, hidden when streaming */}
            {!isStreaming && voiceState !== 'unsupported' && (
              <button
                type="button"
                onClick={startVoice}
                aria-label={voiceState === 'listening' ? 'Stop recording' : 'Voice input'}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full',
                  'transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                  voiceState === 'listening'
                    ? 'text-[var(--chat-accent-primary)] animate-pulse hover:bg-[var(--chat-accent-primary)]/10'
                    : 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                )}
              >
                <Mic size={16} strokeWidth={1.75} />
              </button>
            )}

            {/* Send / Stop — round accent circle */}
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generation"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--chat-accent-primary)] text-white transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]"
              >
                <Square size={13} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                aria-label={`Send message (${modKey}+Enter)`}
                disabled={disabled}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                  disabled
                    ? 'bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)] cursor-not-allowed'
                    : 'bg-[var(--chat-accent-primary)] text-white hover:opacity-80',
                )}
              >
                <ArrowUp size={16} strokeWidth={2} />
              </button>
            )}
          </div>

          {/* Cmd/Ctrl+Enter shortcut helper — visible only when focused */}
          {focused && !isStreaming && (
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-[var(--chat-text-muted)] pointer-events-none select-none whitespace-nowrap">
              {modKey}+Enter to send
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
