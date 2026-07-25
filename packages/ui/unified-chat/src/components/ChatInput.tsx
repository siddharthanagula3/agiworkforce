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
import { Check, ChevronDown, Folder, FolderOpen, Mic, Plus, X } from 'lucide-react';
import { cleanupVoiceDictation, detectVoiceCommand } from '@agiworkforce/utils';
import { cn } from '../lib/utils';
import { useChatStore } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';
import { useSettingsStore } from '../stores/settingsStore';
import { AttachmentMenu } from './AttachmentMenu';
import { ModelSelector } from './ModelSelector';
import { SendButton } from './SendButton';
import { AgentControl } from './AgentControl';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useAgentControlStore } from '../stores/agentControlStore';
import { isCodeExecutionAvailable } from '../lib/codeExecutionAvailability';
import { isWebSearchAvailable } from '@agiworkforce/search';
import type { WritingStyle } from '../lib/writingStyle';
import type { ChatAttachmentPolicy } from '../lib/runtime';
import {
  ALLOWED_ATTACHMENT_ACCEPT,
  getModelMetadataById,
  resolveModelEffort,
  validateAttachmentFile,
  type CloudWorkMode,
} from '@agiworkforce/types';

/** Composer work mode — mirrors web ChatComposerNew's ComposerWorkMode. */
export type ChatWorkMode = CloudWorkMode;

/** Scope stamped into the send callback when the host feeds `projectPicker`. */
export interface ChatWorkScope {
  workMode: ChatWorkMode;
  /** Project scoping the send (threads into conversation creation). */
  projectId: string | null;
}

/**
 * "Project or folder" picker (web ChatComposerNew parity). Provided only by
 * hosts with real project data (desktop feeds projectStore). Selecting a
 * project scopes the conversation — the host owns the selection state and the
 * scoping side effects. The folder half of the picker reuses the existing
 * `onSelectFolder`/`currentFolderLabel` seam and renders only when the host
 * feeds it (desktop-only, privacy-gated by the host). A chat is scoped to a
 * project OR a folder, never both. Absent prop = no toggle, no picker.
 */
export interface ChatInputProjectPicker {
  /** Real projects from the host's project store (id + display name). */
  projects: Array<{ id: string; name: string }>;
  activeProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  /** Opens the host-owned project creation flow; absent when creation is unsupported. */
  onCreateProject?: () => void;
}

export interface ChatInputProps {
  /**
   * `attachments` carries the raw `File` objects the user attached in the
   * composer (DESKTOP-ATTACHMENT-SEND-WIRE-SEVERED-01) — previously dropped
   * here entirely. Host runtimes are responsible for encoding them onto the
   * wire (e.g. `TauriRuntime` reads them into base64 for IPC).
   */
  onSend: (
    content: string,
    agentMode?: string,
    effort?: string,
    attachments?: File[],
    research?: boolean,
    writingStyle?: WritingStyle,
    /** Present only when the host feeds `projectPicker` (workMode + projectId). */
    workScope?: ChatWorkScope,
  ) => void;
  onStop: () => void;
  /**
   * AUDIT-FIX CMP-29: `onPlusClick` (REQUIRED) and `onVoiceClick` used to be
   * declared here, destructured to `_`-prefixed aliases, and never referenced —
   * so every host was forced to wire a handler that could not run. This
   * component owns both behaviours itself: the "+" button is the trigger for
   * the shared `AttachmentMenu`, and the mic runs `useVoiceInput`. Both props
   * are removed rather than fired alongside the internal handlers, which would
   * have double-driven the desktop host's legacy `toggle-voice-input` event.
   */
  onModelSelectorClick: () => void;
  allowModelFallbackModels?: boolean;
  /** Show Ask/Auto/Plan/Bypass only when the active runtime enforces it. */
  supportsAgentControl?: boolean;
  /**
   * Called when the user picks "Select folder" from the attachment menu.
   * Host apps that expose `canUseWorkingDirectory` (desktop) should provide
   * this to open a native folder dialog and sync it to the backend; the menu
   * item is capability-gated so this is only reachable on desktop.
   */
  onSelectFolder?: () => void;
  /** Host-owned desktop workflow recorder; absent on unsupported surfaces. */
  onRecordSkill?: () => void;
  /** Display label for the currently scoped project folder, if any. */
  currentFolderLabel?: string | null;
  /**
   * Clears the host's scoped local folder. Hosts that feed both
   * `onSelectFolder` and `projectPicker` must provide this so a project pick
   * can displace the folder (project/folder mutual exclusion) and the scope
   * chip can be cleared.
   */
  onClearFolder?: () => void;
  /** Chat | AGI Work toggle + "Project or folder" picker. See the type doc. */
  projectPicker?: ChatInputProjectPicker;
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
  /**
   * Whether the active runtime forwards `SendMessageOptions.codeExecution`
   * at all (`ChatRuntime.supportsCodeExecution`). Local/native runtimes
   * (Tauri) don't, so the "Run code" toggle is omitted entirely rather than
   * rendered as a control the runtime would silently ignore. Defaults false.
   */
  supportsCodeExecution?: boolean;
  /** Whether the active runtime can transport managed Research requests. */
  supportsResearch?: boolean;
  /** Whether this runtime sends Web search through Managed Cloud. */
  supportsManagedWebSearch?: boolean;
  /** Runtime-specific limits layered over the suite-wide local attachment policy. */
  attachmentPolicy?: ChatAttachmentPolicy;
}

export function ChatInput({
  onSend,
  onStop,
  onModelSelectorClick,
  allowModelFallbackModels = true,
  supportsAgentControl = true,
  onSelectFolder,
  onRecordSkill,
  currentFolderLabel = null,
  onClearFolder,
  projectPicker,
  hasMessages,
  className,
  disabled = false,
  disabledMessage,
  conversationId,
  projectId,
  supportsCodeExecution = false,
  supportsResearch = false,
  supportsManagedWebSearch = false,
  attachmentPolicy,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const draftContent = useChatStore((s) => s.draftContent);
  const setDraftContent = useChatStore((s) => s.setDraftContent);
  const clearDraftContent = useChatStore((s) => s.clearDraftContent);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const hasTextContent = draftContent.trim().length > 0;
  const [isDragOver, setIsDragOver] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  // UI-WEBSEARCH-TOGGLE-01: read + write the REAL chatStore web-search state (not
  // a local useState that diverged from the send path). Default is OFF (chatStore
  // `webSearchEnabled: false`) — the user must explicitly enable web search.
  const webSearchEnabled = useChatStore((s) => s.webSearchEnabled);
  const setWebSearchEnabled = useChatStore((s) => s.setWebSearchEnabled);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [activeStyle, setActiveStyle] = useState<WritingStyle | null>(null);

  // Work-mode segmented toggle (Chat | AGI Work) — web ChatComposerNew parity.
  // 'agiwork' reveals the "Project or folder" chip row below the composer and
  // stamps workMode + projectId into the send callback. Rendered only when the
  // host passes projectPicker (real project data) — hosts that don't feed it
  // (mobile) see no toggle and an unchanged send signature.
  const [workMode, setWorkMode] = useState<ChatWorkMode>('chat');
  const [scopePickerOpen, setScopePickerOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const scopePickerRef = useRef<HTMLDivElement>(null);
  const activeProjectId = projectPicker?.activeProjectId ?? null;

  // A persisted/reloaded project conversation is an AGI Work conversation.
  // Keep the visible mode and the next request aligned with that durable
  // membership; otherwise reopening a project chat silently sends
  // `work_mode: "chat"` until the user toggles AGI Work again.
  useEffect(() => {
    setWorkMode(activeProjectId ? 'agiwork' : 'chat');
  }, [activeProjectId, conversationId]);

  // Entering with a preselected project (sidebar "New chat in project") lands
  // the composer in AGI Work mode so the scoping is visible, never silent.
  useEffect(() => {
    if (activeProjectId) setWorkMode('agiwork');
  }, [activeProjectId]);

  // Mutual exclusion, folder side: a NEWLY chosen folder (host dialog resolves
  // asynchronously → currentFolderLabel transitions) displaces the project.
  // The project side is handled synchronously in handlePickProject below.
  const prevFolderLabelRef = useRef(currentFolderLabel);
  useEffect(() => {
    const prev = prevFolderLabelRef.current;
    prevFolderLabelRef.current = currentFolderLabel;
    if (currentFolderLabel && currentFolderLabel !== prev && activeProjectId) {
      projectPicker?.onSelectProject(null);
    }
  }, [currentFolderLabel, activeProjectId, projectPicker]);

  // Close the scope popover on outside click.
  useEffect(() => {
    if (!scopePickerOpen) return undefined;
    const onPointerDown = (e: MouseEvent) => {
      if (!scopePickerRef.current?.contains(e.target as Node)) {
        setScopePickerOpen(false);
        setProjectQuery('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [scopePickerOpen]);

  const activePickerProject = projectPicker
    ? (projectPicker.projects.find((p) => p.id === activeProjectId) ?? null)
    : null;
  const scopeHasSelection = Boolean(activePickerProject || currentFolderLabel);
  const scopeLabel = activePickerProject?.name ?? currentFolderLabel ?? 'Project or folder';
  const filteredPickerProjects = projectPicker
    ? projectPicker.projects.filter((p) =>
        p.name.toLowerCase().includes(projectQuery.trim().toLowerCase()),
      )
    : [];

  const closeScopePicker = useCallback(() => {
    setScopePickerOpen(false);
    setProjectQuery('');
  }, []);

  const handlePickProject = useCallback(
    (id: string) => {
      projectPicker?.onSelectProject(id);
      // A chat is scoped to a project OR a local folder, never both.
      onClearFolder?.();
      closeScopePicker();
    },
    [projectPicker, onClearFolder, closeScopePicker],
  );

  const handleClearScopeSelection = useCallback(() => {
    projectPicker?.onSelectProject(null);
    onClearFolder?.();
  }, [projectPicker, onClearFolder]);

  const handlePickFolderFromScope = useCallback(() => {
    closeScopePicker();
    // The host's native dialog resolves async; the folder-transition effect
    // above displaces the project once a folder was actually chosen.
    onSelectFolder?.();
  }, [closeScopePicker, onSelectFolder]);

  // Switching back to Chat clears the scope selection: what the chip shows is
  // exactly what the next send carries — no hidden project sticking to a
  // "Chat"-labeled composer.
  const handleWorkModeChange = useCallback(
    (mode: ChatWorkMode) => {
      setWorkMode(mode);
      if (mode === 'chat') {
        projectPicker?.onSelectProject(null);
        onClearFolder?.();
        closeScopePicker();
      }
    },
    [projectPicker, onClearFolder, closeScopePicker],
  );

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

  const genericWebSearchDeploymentEnabled = useSettingsStore(
    (s) => s.genericWebSearchDeploymentEnabled,
  );
  const selectedModelMetadata = getModelMetadataById(selectedModelId);
  const webSearchAvailable =
    !supportsManagedWebSearch ||
    isWebSearchAvailable({
      provider: modelProviderId,
      modelSupportsNativeSearch:
        selectedModelMetadata?.capabilities.search ?? modelProviderId === 'managed_cloud',
      modelSupportsTools: selectedModelMetadata?.capabilities.tools ?? selectedModel?.supportsTools,
      genericBackendConfigured: genericWebSearchDeploymentEnabled,
    });

  useEffect(() => {
    if (webSearchEnabled && !webSearchAvailable) setWebSearchEnabled(false);
  }, [setWebSearchEnabled, webSearchAvailable, webSearchEnabled]);

  // A mode/runtime switch must not leave a hidden Research selection armed.
  // The send path also gates on `supportsResearch`, but clearing here prevents
  // the old choice from silently reappearing if the user later returns to a
  // managed runtime.
  useEffect(() => {
    if (!supportsResearch) setResearchEnabled(false);
  }, [supportsResearch]);

  // "Run code" toggle: persisted preference lives in settingsStore (not
  // chatStore, unlike webSearch) — see settingsStore's field doc comment.
  // `codeExecutionEnabled` reflects the user's stated intent even when
  // currently unavailable (the row disables instead of silently unchecking,
  // matching web's ChatComposerNew). `codeExecutionDeploymentEnabled` is the
  // per-deployment E2B cut-over flag hosts write via
  // `setCodeExecutionDeploymentEnabled` — see useChat's `sendMessage`, which
  // recomputes this SAME formula at send time rather than trusting the
  // toggle's rendered state.
  const codeExecutionEnabled = useSettingsStore((s) => s.codeExecutionEnabled);
  const toggleCodeExecution = useSettingsStore((s) => s.toggleCodeExecution);
  const codeExecutionDeploymentEnabled = useSettingsStore((s) => s.codeExecutionDeploymentEnabled);
  const codeExecutionAvailable =
    supportsCodeExecution &&
    isCodeExecutionAvailable(
      getModelMetadataById(selectedModelId)?.capabilities.codeExecution,
      getModelMetadataById(selectedModelId)?.capabilities.tools,
      modelProviderId,
      codeExecutionDeploymentEnabled,
    );

  // Resolve agent control state for the active conversation
  const resolveAgentControl = useAgentControlStore((s) => s.resolve);
  const showAgentControl = Boolean(conversationId && supportsAgentControl);
  const { state: voiceState, start: startVoice } = useVoiceInput({
    onTranscript: (text) => {
      const cleanedText = cleanupVoiceDictation(text);
      const isCommand = detectVoiceCommand(cleanedText);
      const current = useChatStore.getState().draftContent;
      setDraftContent(
        isCommand ? cleanedText : current ? `${current} ${cleanedText}` : cleanedText,
        conversationId,
      );
      textareaRef.current?.focus();
    },
  });

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

  // The store owns the live textarea value. External prefills/context updates,
  // direct typing, voice input, and send/reset therefore share one source of
  // truth instead of using Zustand as a one-shot command bus.
  useEffect(() => {
    adjustHeight();
    if (draftContent) textareaRef.current?.focus();
  }, [draftContent, adjustHeight]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setDraftContent(e.target.value, conversationId);
      adjustHeight();
    },
    [adjustHeight, conversationId, setDraftContent],
  );

  // Validate + append candidate files through the shared @agiworkforce/types
  // contract (MIME prefix + extension allowlist + MAX_ATTACHMENT_BYTES). Any
  // rejection surfaces the first failure message under the textarea so the
  // user knows why nothing attached. Round-2 audit P0 #4 (2026-05-21).
  const appendFiles = useCallback(
    (candidates: File[]) => {
      if (candidates.length === 0) return;
      const accepted: File[] = [];
      const rejections: string[] = [];
      for (const file of candidates) {
        const result = validateAttachmentFile(file);
        if (!result.ok) {
          rejections.push(result.message);
          continue;
        }
        const runtimeRejection = attachmentPolicy?.validate(file);
        if (runtimeRejection) {
          rejections.push(runtimeRejection);
          continue;
        }
        accepted.push(file);
      }
      if (accepted.length > 0) {
        const maxFiles = attachmentPolicy?.maxFiles ?? Number.POSITIVE_INFINITY;
        const maxBytes = attachmentPolicy?.maxTotalBytes ?? Number.POSITIVE_INFINITY;
        const availableCount = Math.max(0, maxFiles - attachedFiles.length);
        const bounded: File[] = [];
        let totalBytes = attachedFiles.reduce((sum, file) => sum + file.size, 0);
        for (const file of accepted.slice(0, availableCount)) {
          if (totalBytes + file.size > maxBytes) {
            rejections.push(
              `Attached files exceed the ${Math.round(maxBytes / (1024 * 1024))} MiB total limit.`,
            );
            continue;
          }
          totalBytes += file.size;
          bounded.push(file);
        }
        if (accepted.length > availableCount) {
          rejections.push(`Attach at most ${maxFiles} files per message.`);
        }
        setAttachedFiles((previous) => [...previous, ...bounded]);
      }
      setAttachmentError(rejections[0] ?? null);
    },
    [attachedFiles, attachmentPolicy],
  );

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
    const typedContent = draftContent.trim();
    if ((!typedContent && attachedFiles.length === 0) || isStreaming) return;

    // Attachment-only turns are intentionally enabled by SendButton. Previously
    // the button became active as soon as a file was attached, but this handler
    // still rejected the click when the textarea was empty, creating a silent
    // no-op. Give the model an explicit, visible request without interpolating
    // the untrusted file name into the instruction channel.
    const content =
      typedContent ||
      (attachedFiles.length === 1
        ? 'Please analyze the attached file.'
        : 'Please analyze the attached files.');

    // Read current agent control state and forward to onSend
    let agentMode: string | undefined;
    let effort: string | undefined;
    if (conversationId) {
      const agentState = resolveAgentControl(conversationId, projectId ?? null);
      agentMode = agentState.mode;
      effort = resolveModelEffort(selectedModelId, agentState.effort);
    }

    const attachments = attachedFiles.length > 0 ? attachedFiles : undefined;
    const research = supportsResearch && researchEnabled;
    if (projectPicker) {
      // Hosts feeding the picker get the scope stamped into the send; the
      // signature stays unchanged for hosts that don't (mobile).
      onSend(content, agentMode, effort, attachments, research, activeStyle ?? undefined, {
        workMode,
        projectId: activeProjectId,
      });
    } else if (activeStyle) {
      onSend(content, agentMode, effort, attachments, research, activeStyle);
    } else {
      onSend(content, agentMode, effort, attachments, research);
    }
    clearDraftContent(conversationId);
    el.style.height = 'auto';
    setAttachedFiles([]);
    setAttachmentError(null);
  }, [
    disabled,
    noModelSelected,
    draftContent,
    isStreaming,
    onSend,
    conversationId,
    projectId,
    resolveAgentControl,
    selectedModelId,
    attachedFiles,
    clearDraftContent,
    researchEnabled,
    supportsResearch,
    activeStyle,
    projectPicker,
    workMode,
    activeProjectId,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Plain Enter sends; Shift+Enter inserts a newline (the ChatGPT/Claude chat
      // convention). Cmd/Ctrl+Enter also sends. IME composition (e.g. CJK) must not
      // submit mid-candidate, so guard on isComposing.
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const [focused, setFocused] = useState(false);

  const placeholder = disabled
    ? (disabledMessage ?? 'Connect to start chatting')
    : noModelSelected
      ? 'Select a model to start'
      : hasMessages
        ? 'Reply…'
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
                    <img
                      src={thumb.url}
                      alt={file.name}
                      width={20}
                      height={20}
                      className="h-5 w-5 rounded object-cover"
                    />
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
          value={draftContent}
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

        {/* Bottom toolbar.
            SINGLE non-wrapping control row (flex-nowrap) — mirrors web's
            ChatComposerNew, which deliberately avoids flex-wrap so the send
            button can never drop to a second line as the column narrows.
            The min-w-0 shrink chain lets the left group (plus + AgentControl
            chips) and the model selector collapse first, while the voice + send
            buttons stay shrink-0 and pinned to the right edge. */}
        <div className="flex flex-col gap-1 px-3 pt-1.5 pb-2">
          <div className="flex flex-nowrap items-center gap-1 sm:gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {/* Left: Plus button — opens attachment menu */}
              <div className="flex shrink-0 items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept={attachmentPolicy?.accept ?? ALLOWED_ATTACHMENT_ACCEPT}
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
                  onSelectFolder={onSelectFolder}
                  onRecordSkill={onRecordSkill}
                  currentFolderLabel={currentFolderLabel}
                  webSearchEnabled={webSearchEnabled}
                  onWebSearchToggle={() => setWebSearchEnabled(!webSearchEnabled)}
                  webSearchAvailable={webSearchAvailable}
                  researchEnabled={researchEnabled}
                  onResearchToggle={() => setResearchEnabled((v) => !v)}
                  supportsResearch={supportsResearch}
                  codeExecutionEnabled={codeExecutionEnabled}
                  codeExecutionAvailable={codeExecutionAvailable}
                  onCodeExecutionToggle={supportsCodeExecution ? toggleCodeExecution : undefined}
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
                      // Round "+" trigger matching web's composer (h-9 rounded-full,
                      // accent tint when files are attached or the menu is open).
                      'relative flex h-9 w-9 items-center justify-center rounded-full',
                      'transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                      attachedFiles.length > 0 || attachmentMenuOpen
                        ? 'bg-[var(--chat-accent-primary)]/15 text-[var(--chat-accent-primary)]'
                        : 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                    )}
                  >
                    <Plus size={18} />
                    {attachedFiles.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--chat-accent-primary)] text-[8px] font-bold text-white">
                        {attachedFiles.length}
                      </span>
                    )}
                  </button>
                </AttachmentMenu>
              </div>

              {/* Work-mode segmented toggle (Chat | AGI Work) — web parity,
                  sitting immediately right of "+". Rendered only when the host
                  feeds projectPicker. */}
              {projectPicker && (
                <div
                  role="group"
                  aria-label="Composer mode"
                  className="flex shrink-0 items-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-hover)]/40 p-0.5 text-xs font-medium"
                >
                  {(['chat', 'agiwork'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleWorkModeChange(mode)}
                      disabled={disabled}
                      aria-pressed={workMode === mode}
                      className={cn(
                        'flex h-7 items-center rounded-full px-3 transition-colors',
                        workMode === mode
                          ? 'bg-[var(--chat-surface-elevated)] text-[var(--chat-text-primary)] shadow-sm'
                          : 'text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)]',
                        disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      {mode === 'chat' ? 'Chat' : 'AGI Work'}
                    </button>
                  ))}
                </div>
              )}

              {/* Agent control chips stay visually attached to the plus button. */}
              {showAgentControl && conversationId && (
                <AgentControl
                  conversationId={conversationId}
                  projectId={projectId ?? null}
                  modelId={selectedModelId}
                  className="min-w-0 max-w-full flex-wrap justify-start gap-1"
                />
              )}
            </div>

            {/* Right: Model selector + mic + send.
                min-w-0 (NOT shrink-0) so the model pill is the item that
                truncates first as the column narrows — mirroring web, where the
                shrinkable model area shares the nowrap row. The mic + send below
                are shrink-0, so under flex-nowrap + the container's overflow-hidden
                the send button can never be pushed off-edge or clipped. */}
            <div className="ml-auto flex min-w-0 max-w-full items-center justify-end gap-1.5">
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
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
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

              {/* Send / Stop — shared 3-state SendButton (mirrors web's composer).
                  The desktop chat store only models `isStreaming`, so we drive
                  the honest two reachable states (stop while streaming, otherwise
                  send). The button's `queue` state exists in the shared API for
                  web parity but is never fabricated here. */}
              <SendButton
                mode={isStreaming ? 'stop' : 'send'}
                hasContent={hasTextContent || attachedFiles.length > 0}
                disabled={disabled || noModelSelected}
                onClick={isStreaming ? onStop : handleSend}
                className="shrink-0"
              />
            </div>
          </div>
        </div>
      </div>

      {/* AGI Work scope row — "Project or folder ▾" chip DIRECTLY BELOW the
          composer (web ChatComposerNew / claude.ai Cowork reference layout).
          Rendered only in AGI Work mode with host-provided project data; the
          local-folder action appears only when the host feeds the folder seam
          (desktop, privacy-gated by the host). */}
      {projectPicker && workMode === 'agiwork' && (
        <div className="relative mt-2 flex items-center gap-2" ref={scopePickerRef}>
          <div
            className={cn(
              'flex h-8 min-w-0 items-center rounded-full border transition-all',
              scopeHasSelection
                ? 'border-[var(--chat-accent-primary)]/40 bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary)]'
                : 'border-[var(--chat-border)] bg-[var(--chat-surface-hover)]/40 text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)]',
            )}
          >
            <button
              type="button"
              onClick={() => {
                setScopePickerOpen((prev) => !prev);
                setProjectQuery('');
              }}
              disabled={disabled}
              className={cn(
                'flex h-full min-w-0 items-center gap-1.5 pl-2.5 text-xs font-medium',
                scopeHasSelection ? 'pr-1' : 'pr-2.5',
                disabled && 'cursor-not-allowed opacity-50',
              )}
              aria-label="Project or folder"
              aria-expanded={scopePickerOpen}
              title={scopeHasSelection ? scopeLabel : undefined}
            >
              {currentFolderLabel ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="max-w-[220px] truncate">{scopeLabel}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
            </button>
            {scopeHasSelection && (
              <button
                type="button"
                onClick={handleClearScopeSelection}
                className="mr-1.5 shrink-0 rounded-full p-0.5 hover:bg-[var(--chat-accent-primary)]/20"
                aria-label="Clear project or folder selection"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {scopePickerOpen && (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-1.5 shadow-xl">
              <input
                type="text"
                value={projectQuery}
                onChange={(e) => setProjectQuery(e.target.value)}
                placeholder="Search projects..."
                aria-label="Search projects"
                autoFocus
                className="mb-1.5 w-full rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-hover)]/30 px-3 py-2 text-sm text-[var(--chat-text-primary)] outline-none placeholder:text-[var(--chat-text-placeholder)]"
              />
              <div className="max-h-56 overflow-y-auto">
                {filteredPickerProjects.length === 0 && (
                  <div className="px-3 py-2 text-sm text-[var(--chat-text-secondary)]">
                    {projectPicker.projects.length === 0 ? 'No projects yet' : 'No projects found'}
                  </div>
                )}
                {filteredPickerProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => handlePickProject(project.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)]"
                  >
                    <span className="min-w-0 flex-1 truncate text-left">{project.name}</span>
                    {activeProjectId === project.id && (
                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>

              {projectPicker.onCreateProject && (
                <>
                  <div className="my-1 border-t border-[var(--chat-border)]" />
                  <button
                    type="button"
                    onClick={() => {
                      closeScopePicker();
                      projectPicker.onCreateProject?.();
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)]"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Create project
                  </button>
                </>
              )}

              {/* Local folder — rendered only when the host feeds the folder
                  seam (desktop-only + privacy-gated at the host). */}
              {onSelectFolder && (
                <>
                  <div className="my-1 border-t border-[var(--chat-border)]" />
                  <button
                    type="button"
                    onClick={handlePickFolderFromScope}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)]"
                  >
                    <FolderOpen className="h-4 w-4 shrink-0 text-[var(--chat-text-secondary)]" />
                    <span className="flex-1 text-left">
                      {currentFolderLabel ? 'Choose a different folder' : 'Choose a local folder'}
                    </span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
