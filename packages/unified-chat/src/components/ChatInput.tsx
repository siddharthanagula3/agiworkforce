import {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
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
import {
  ALLOWED_ATTACHMENT_ACCEPT,
  PROVIDER_DISPLAY,
  validateAttachmentFile,
  type ProviderId,
} from '@agiworkforce/types';

export interface ChatInputProps {
  onSend: (content: string, agentMode?: string, effort?: string) => void;
  onStop: () => void;
  onPlusClick: () => void;
  onModelSelectorClick: () => void;
  allowModelFallbackModels?: boolean;
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
  allowModelFallbackModels = true,
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
  const [isDragOver, setIsDragOver] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
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
  // No usable model is selected — e.g. Local mode with no Ollama/BYOK model, where
  // the selection is reconciled to the empty sentinel. Auto modes ('auto-*') and
  // concrete IDs are non-empty, so cloud auto-routing stays enabled; only '' means
  // there is nothing to send to. Block send so a message can't silently no-op.
  const noModelSelected = selectedModelId.trim() === '';

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

  // Validate + append candidate files through the shared @agiworkforce/types
  // contract (MIME prefix + extension allowlist + MAX_ATTACHMENT_BYTES). Any
  // rejection surfaces the first failure message under the textarea so the
  // user knows why nothing attached. Round-2 audit P0 #4 (2026-05-21).
  const appendFiles = useCallback((candidates: File[]) => {
    if (candidates.length === 0) return;
    const accepted: File[] = [];
    const rejections: string[] = [];
    for (const file of candidates) {
      const result = validateAttachmentFile(file);
      if (result.ok) {
        accepted.push(file);
      } else {
        rejections.push(result.message);
      }
    }
    if (accepted.length > 0) {
      setAttachedFiles((prev) => [...prev, ...accepted]);
    }
    setAttachmentError(rejections[0] ?? null);
  }, []);

  // Drag-drop + paste-image — parity-gap round-2 P0 #3 (2026-05-21). Mirrors
  // Claude / ChatGPT: dropping files anywhere on the composer or pasting an
  // image from the clipboard attaches them to the message, with a visual
  // border highlight while dragging.
  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (disabled || isStreaming) return;
      e.preventDefault();
      if (!isDragOver) setIsDragOver(true);
    },
    [disabled, isStreaming, isDragOver],
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    // Only clear when the cursor actually exits the bounding box, not when
    // crossing a child element.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled || isStreaming) return;
      const files = Array.from(e.dataTransfer?.files ?? []);
      appendFiles(files);
    },
    [disabled, isStreaming, appendFiles],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (disabled || isStreaming) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item) continue;
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) pasted.push(file);
        }
      }
      if (pasted.length > 0) {
        // Prevent the binary blob from being inserted into the textarea as
        // garbage text — but only when we actually captured a file paste.
        e.preventDefault();
        appendFiles(pasted);
      }
    },
    [disabled, isStreaming, appendFiles],
  );

  // Object URLs for image thumbnails. Re-built whenever the attached file
  // set changes and revoked on unmount / change so we don't leak blob URLs.
  const thumbnailUrls = useMemo(() => {
    const urls: Array<{ key: string; url: string | null }> = [];
    for (let i = 0; i < attachedFiles.length; i++) {
      const file = attachedFiles[i];
      if (!file) continue;
      const key = `${file.name}-${i}-${file.size}`;
      const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      urls.push({ key, url });
    }
    return urls;
  }, [attachedFiles]);

  useEffect(() => {
    return () => {
      for (const t of thumbnailUrls) {
        if (t.url) URL.revokeObjectURL(t.url);
      }
    };
  }, [thumbnailUrls]);

  const handleSend = useCallback(() => {
    if (disabled || noModelSelected) return;
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
    noModelSelected,
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
    : noModelSelected
      ? 'Select a model to start'
      : hasMessages
        ? 'Reply...'
        : 'How can I help you today?';

  return (
    <div className={cn('mx-auto w-full max-w-3xl px-4 pb-2', className)}>
      <div
        className={cn(
          'overflow-hidden border transition-colors',
          'bg-[var(--chat-surface-elevated)]',
          isDragOver
            ? 'border-[var(--chat-accent-primary)] shadow-[0_0_0_2px_rgba(218,119,86,0.25)]'
            : focused
              ? 'border-[var(--chat-border-strong,var(--chat-border))] shadow-[0_0_0_2px_rgba(33,128,141,0.25)]'
              : 'border-[var(--chat-border)]',
        )}
        style={{ borderRadius: 16 }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Inline attachment validation error — dismissed on next valid add. */}
        {attachmentError && (
          <div
            role="status"
            aria-live="polite"
            className="px-3 pt-2 text-[11px] text-[var(--chat-destructive)]"
          >
            {attachmentError}
          </div>
        )}

        {/* Attached files preview — image thumbnails for image/*, text chip otherwise */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2">
            {attachedFiles.map((file, i) => {
              const thumb = thumbnailUrls[i];
              return (
                <span
                  key={thumb?.key ?? `${file.name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--chat-surface-hover)] px-2 py-0.5 text-xs text-[var(--chat-text-secondary)]"
                >
                  {thumb?.url ? (
                    <img src={thumb.url} alt={file.name} className="h-5 w-5 rounded object-cover" />
                  ) : null}
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
              );
            })}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={placeholder}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
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
        <div className="flex flex-col gap-1 px-3 pt-1.5 pb-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {/* Left: Plus button — opens attachment menu */}
              <div className="flex shrink-0 items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept={ALLOWED_ATTACHMENT_ACCEPT}
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      appendFiles(Array.from(files));
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
              </div>

              {/* Agent control chips stay visually attached to the plus button. */}
              {showAgentControl && conversationId && (
                <AgentControl
                  conversationId={conversationId}
                  projectId={projectId ?? null}
                  modelProviderId={modelProviderId}
                  className="min-w-0 max-w-full flex-wrap justify-start gap-1"
                />
              )}
            </div>

            {/* Right: Model selector + mic + send */}
            <div className="ml-auto flex max-w-full shrink-0 items-center justify-end gap-1.5">
              {/* Inline model selector popover */}
              <ModelSelector
                onSettingsClick={onModelSelectorClick}
                allowFallbackModels={allowModelFallbackModels}
                className="min-w-0 max-w-[12rem]"
              />

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
                  disabled={disabled || noModelSelected}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                    disabled || noModelSelected
                      ? 'bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)] cursor-not-allowed'
                      : 'bg-[var(--chat-accent-primary)] text-white hover:opacity-80',
                  )}
                >
                  <ArrowUp size={16} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
