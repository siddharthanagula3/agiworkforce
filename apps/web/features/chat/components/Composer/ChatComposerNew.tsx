'use client';

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  Plus,
  X,
  Image as ImageIcon,
  Globe,
  Sparkles,
  BookOpen,
  Wand2,
  ChevronRight,
  Check,
  Camera,
  FolderOpen,
  GitFork,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { ChatAIService, type SkillInfo } from '@features/chat/services/chat-ai-service';
import { ActiveModeTags, type ModeTag } from './ActiveModeTags';
import { SlashCommandMenu, type SlashCommandMenuHandle } from './SlashCommandMenu';
import { SkillsMenu } from '../SkillsMenu';
import { SendButton } from './SendButton';
import { ComposerFooter } from './ComposerFooter';
import { DragDropOverlay } from './DragDropOverlay';
import { GhostTextOverlay } from './GhostTextOverlay';
import { VoiceInputButton } from './VoiceInputButton';
import { AttachmentPreview } from './AttachmentPreview';
import { useAttachments } from '@features/chat/hooks/use-attachments';
import { useApiPromptCompletion } from '@/hooks/useApiPromptCompletion';
import type { ChatMode } from '@features/chat/types';
import { CONNECTORS } from '@features/connectors/data/connectors';
import { useConnectors } from '@features/connectors/hooks/use-connectors';
import { Switch } from '@shared/ui/switch';

interface ChatComposerProps {
  onSend: (
    content: string,
    attachments?: File[],
    skillId?: string,
    meta?: {
      agentMode: ChatMode;
      folderId: string | null;
      webSearchEnabled?: boolean;
      thinkingEnabled?: boolean;
      codeExecutionEnabled?: boolean;
      /** Output style hint forwarded to the LLM system prompt. undefined = 'normal'. */
      styleMode?: string;
    },
  ) => void | false;
  isLoading?: boolean;
  /**
   * True while an SSE stream is actively generating output.
   * When isGenerating=true and the user has typed a message, the SendButton
   * shows the amber "queue" state instead of the terra-cotta "send" state.
   */
  isGenerating?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Initial agent mode (defaults to 'solo') */
  initialAgentMode?: ChatMode;
  /** Whether to enable ghost-text prompt completion (default: true) */
  promptCompletionEnabled?: boolean;
  /** Pre-fill the textarea with this text (e.g. from empty-state pills). */
  prefillText?: string;
  /** Callback fired after prefillText has been consumed and applied. */
  onPrefillConsumed?: () => void;
  /** Files dropped onto the message area that should be added as attachments. */
  droppedFiles?: File[] | null;
  /** Callback fired after droppedFiles have been consumed and added to attachments. */
  onDroppedFilesConsumed?: () => void;
  /** Fires when the input transitions between empty and non-empty (debounced 500ms on clear). */
  onTypingChange?: (isTyping: boolean) => void;
  /** Called when the user clicks the stop button. Overrides the default ChatAIService.stopGeneration(). */
  onStop?: () => void;
  /** Increment to clear composer state after a parent-owned deferred send. */
  clearSignal?: number;
  /** Larger, centered composer presentation used on the empty new-chat state. */
  emptyState?: boolean;
  /**
   * Per-file privacy label rendered as a chip on each attachment thumbnail
   * (e.g. "Local", "BYOK", "Managed"). Sourced from the host's SendPreview
   * presentation. PLAN.md section 5: "Add per-file privacy labels".
   */
  attachmentPrivacyShortLabel?: string;
}

const CONNECTOR_PREVIEW = CONNECTORS.filter((c) => c.phase === 1).slice(0, 8);

type StyleMode = 'normal' | 'concise' | 'formal' | 'explanatory';

interface StyleOption {
  id: StyleMode;
  label: string;
  description: string;
}

const STYLE_OPTIONS: StyleOption[] = [
  { id: 'normal', label: 'Normal', description: 'Default balanced style' },
  { id: 'concise', label: 'Concise', description: 'Short and to the point' },
  { id: 'formal', label: 'Formal', description: 'Professional and precise' },
  { id: 'explanatory', label: 'Explanatory', description: 'Detailed with examples' },
];

/** Toggle row used in + menu for Research and Web search. */
function MenuToggleRow({
  icon: Icon,
  label,
  checked,
  onToggle,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted/60',
      )}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 text-left">{label}</span>
      {checked && <Check className="h-3.5 w-3.5 text-foreground" />}
    </button>
  );
}

const ChatComposerNewComponent = ({
  onSend,
  isLoading = false,
  isGenerating = false,
  placeholder = 'Ask anything. Type / for commands',
  disabled = false,
  initialAgentMode = 'solo',
  promptCompletionEnabled = true,
  prefillText,
  onPrefillConsumed,
  droppedFiles,
  onDroppedFilesConsumed,
  onTypingChange,
  onStop,
  clearSignal,
  emptyState = false,
  attachmentPrivacyShortLabel,
}: ChatComposerProps) => {
  const [message, setMessage] = useState('');
  const {
    attachments,
    previews,
    addFiles,
    removeFile,
    clearAll: clearAttachments,
  } = useAttachments({
    onError: (_msg) => {
      // Validation errors are surfaced by the useAttachments hook via its return value.
    },
  });
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>(() =>
    ChatAIService.getAvailableSkillsSync(),
  );
  const [activeTags, setActiveTags] = useState<ModeTag[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  // agentMode and selectedFolderId kept with safe defaults; state removed from UI
  // but still forwarded via onSend meta to preserve the API contract.
  const agentMode: ChatMode = initialAgentMode;
  const selectedFolderId: string | null = null;
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [styleMode, setStyleMode] = useState<StyleMode>('normal');
  const [showStyleSubmenu, setShowStyleSubmenu] = useState(false);
  const [showSkillsSubmenu, setShowSkillsSubmenu] = useState(false);
  const [showConnectorsSubmenu, setShowConnectorsSubmenu] = useState(false);

  // Real connector state from the server
  const connectors = useConnectors();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const mentionsRef = useRef<HTMLDivElement>(null);
  const slashMenuRef = useRef<SlashCommandMenuHandle>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasTypingRef = useRef(false);
  const lastClearSignalRef = useRef(clearSignal);

  // Track empty <-> non-empty transitions with 500ms debounce on clearing
  useEffect(() => {
    const hasContent = message.trim().length > 0;

    if (hasContent && !wasTypingRef.current) {
      wasTypingRef.current = true;
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      onTypingChange?.(true);
    } else if (!hasContent && wasTypingRef.current) {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      typingTimerRef.current = setTimeout(() => {
        wasTypingRef.current = false;
        onTypingChange?.(false);
        typingTimerRef.current = null;
      }, 500);
    }
  }, [message, onTypingChange]);

  // Cleanup typing timer on unmount
  useEffect(() => {
    const timer = typingTimerRef;
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  // Ghost-text prompt completion
  const {
    suggestion,
    isLoading: isSuggestionLoading,
    accept: acceptSuggestion,
    clear: clearSuggestion,
  } = useApiPromptCompletion(message, {
    enabled: promptCompletionEnabled && !showSlashMenu && !showMentions,
  });

  const clearComposerState = useCallback(() => {
    setMessage('');
    clearAttachments();
    setSelectedSkill(null);
    setWebSearchEnabled(false);
    setResearchEnabled(false);
    setStyleMode('normal');
    setShowStyleSubmenu(false);
    setActiveTags([]);
    clearSuggestion();

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [clearAttachments, clearSuggestion]);

  useEffect(() => {
    if (clearSignal === undefined || clearSignal === lastClearSignalRef.current) return;
    lastClearSignalRef.current = clearSignal;
    clearComposerState();
  }, [clearComposerState, clearSignal]);

  // Handle prefillText prop — React "derived state from props" pattern.
  // When the parent passes a new non-empty prefillText, we update message
  // and notify the parent. This uses the recommended setState-during-render
  // pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  const [prevPrefill, setPrevPrefill] = useState(prefillText);
  if (prefillText && prefillText.length > 0 && prefillText !== prevPrefill) {
    setPrevPrefill(prefillText);
    setMessage(prefillText);
    onPrefillConsumed?.();
  }

  // Handle droppedFiles prop — same derived-state-from-props pattern as prefillText.
  // When the parent passes files dropped onto the message area, feed them into the
  // attachment hook and notify the parent so it can clear the pending state.
  const [prevDroppedFiles, setPrevDroppedFiles] = useState(droppedFiles);
  if (droppedFiles && droppedFiles.length > 0 && droppedFiles !== prevDroppedFiles) {
    setPrevDroppedFiles(droppedFiles);
    addFiles(droppedFiles);
    onDroppedFilesConsumed?.();
  }

  // Load real skills data on mount
  useEffect(() => {
    ChatAIService.getAvailableSkills()
      .then((skills) => {
        if (skills.length > 0) {
          setAvailableSkills([
            {
              id: 'auto',
              name: 'Auto-Select',
              description: 'Let AI choose the best skill',
              category: 'General',
            },
            ...skills,
          ]);
        }
      })
      .catch(() => {
        // Keep sync defaults on failure
      });
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 52), 240);
    textarea.style.height = `${newHeight}px`;
  }, [message]);

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
        setShowSkillsSubmenu(false);
        setShowConnectorsSubmenu(false);
        setShowStyleSubmenu(false);
      }
      if (mentionsRef.current && !mentionsRef.current.contains(e.target as Node)) {
        setShowMentions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTagDismiss = useCallback((id: string) => {
    setActiveTags((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleWebSearchToggle = useCallback(() => {
    setWebSearchEnabled((prev) => {
      const next = !prev;
      if (next) setResearchEnabled(false);
      return next;
    });
  }, []);

  const handleResearchToggle = useCallback(() => {
    setResearchEnabled((prev) => {
      const next = !prev;
      if (next) setWebSearchEnabled(false);
      return next;
    });
  }, []);

  const closeMenu = useCallback(() => {
    setShowOverflowMenu(false);
    setShowSkillsSubmenu(false);
    setShowConnectorsSubmenu(false);
    setShowStyleSubmenu(false);
  }, []);

  // Handle input change: detect @mention and /command; clear stale ghost-text
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart || 0;
      setMessage(value);

      // Clear ghost-text suggestion on new input
      if (suggestion) {
        clearSuggestion();
      }

      // Slash command detection: only when message starts with /
      if (value.startsWith('/') && !value.includes(' ')) {
        setShowSlashMenu(true);
        setSlashQuery(value.slice(1));
        setShowMentions(false);
        return;
      }
      setShowSlashMenu(false);

      // @mention detection
      const textBeforeCursor = value.substring(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');
      if (lastAtIndex !== -1) {
        const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
        if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
          setShowMentions(true);
          setMentionQuery(textAfterAt);
          setMentionStartIndex(lastAtIndex);
          return;
        }
      }
      setShowMentions(false);
    },
    [suggestion, clearSuggestion],
  );

  const filteredSkills = availableSkills
    .filter(
      (skill) =>
        skill.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        skill.description.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        skill.id.toLowerCase().includes(mentionQuery.toLowerCase()),
    )
    .slice(0, 12);

  const handleMentionSelect = useCallback(
    (skill: SkillInfo) => {
      if (mentionStartIndex === -1) return;
      const before = message.substring(0, mentionStartIndex);
      const cursorPos = textareaRef.current?.selectionStart || message.length;
      const after = message.substring(cursorPos);
      const newMessage = `${before}@${skill.name} ${after}`;
      setMessage(newMessage);
      setSelectedSkill(skill.id === 'auto' ? null : skill);
      setShowMentions(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [message, mentionStartIndex],
  );

  const handleSlashSelect = useCallback((commandId: string) => {
    setMessage('');
    setShowSlashMenu(false);
    if (commandId === 'search') setWebSearchEnabled(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const handleStop = useCallback(() => {
    if (onStop) {
      onStop();
    } else {
      ChatAIService.stopGeneration();
    }
  }, [onStop]);

  const handleSubmit = useCallback(
    () => {
      if (!message.trim() && attachments.length === 0) return;
      if (isLoading || disabled) return;

      const result = onSend(
        message,
        attachments.length > 0 ? attachments : undefined,
        selectedSkill?.id,
        {
          agentMode,
          folderId: selectedFolderId,
          webSearchEnabled,
          styleMode: styleMode !== 'normal' ? styleMode : undefined,
        },
      );

      if (result === false) return;
      clearComposerState();
    }, // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      message,
      attachments,
      selectedSkill,
      isLoading,
      disabled,
      agentMode,
      selectedFolderId,
      onSend,
      clearComposerState,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Forward navigation keys to SlashCommandMenu when open
      if (showSlashMenu) {
        const consumed = slashMenuRef.current?.handleKey(e.key);
        if (consumed) {
          e.preventDefault();
          return;
        }
      }

      // Tab or ArrowRight at end of input accepts ghost-text suggestion
      if ((e.key === 'Tab' || e.key === 'ArrowRight') && suggestion) {
        const textarea = textareaRef.current;
        const atEnd = textarea ? textarea.selectionStart === textarea.value.length : true;
        if (atEnd) {
          e.preventDefault();
          const accepted = acceptSuggestion();
          setMessage((prev) => prev + accepted);
          return;
        }
      }

      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !showMentions) {
        e.preventDefault();
        handleSubmit();
      }

      if (e.key === 'Escape') {
        setShowMentions(false);
        setShowOverflowMenu(false);
        setShowSlashMenu(false);
        clearSuggestion();
      }
    },
    [handleSubmit, showMentions, showSlashMenu, suggestion, acceptSuggestion, clearSuggestion],
  );

  const hasContent = Boolean(message.trim() || attachments.length > 0);

  /**
   * Derive the 3-state mode for SendButton:
   * - 'stop'  -- AI is loading (actively streaming); clicking aborts the stream
   * - 'queue' -- AI is generating but user has typed a message to queue
   * - 'send'  -- idle; button submits the current message
   */
  const sendButtonMode = isLoading ? 'stop' : isGenerating && hasContent ? 'queue' : 'send';

  const footerHint = showSlashMenu
    ? 'Tab to accept · Esc to dismiss'
    : suggestion
      ? 'Tab to accept suggestion · Cmd+Enter to send'
      : 'Cmd+Enter to send · Enter for newline';

  const handleFileDrop = useCallback(
    (files: File[]) => {
      addFiles(files);
    },
    [addFiles],
  );

  // + button indicator: amber tint when any feature is active
  const hasOverflowActive =
    selectedSkill !== null || webSearchEnabled || researchEnabled || styleMode !== 'normal';

  return (
    <div className="relative w-full pb-4 sticky bottom-0 z-20 bg-background/95 backdrop-blur-sm md:static md:bg-transparent md:backdrop-blur-none">
      <DragDropOverlay onDrop={handleFileDrop} />

      {/* Active Mode Tags */}
      <ActiveModeTags tags={activeTags} onDismiss={handleTagDismiss} />

      {/* Selected Skill Badge */}
      {selectedSkill && (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary">
            <Sparkles className="h-3 w-3" />
            {selectedSkill.name}
            <button
              onClick={() => setSelectedSkill(null)}
              className="rounded-full p-0.5 hover:bg-primary/20"
              aria-label={`Remove ${selectedSkill.name} skill`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        </div>
      )}

      {/* Attachments */}
      <AttachmentPreview
        previews={previews}
        onRemove={removeFile}
        className="mb-2"
        privacyShortLabel={attachmentPrivacyShortLabel}
      />

      {/* Main Input Container */}
      <div
        id="chat-composer"
        className={cn(
          'relative border bg-[var(--chat-bg-elevated)] shadow-sm backdrop-blur-sm transition-all duration-200',
          emptyState ? 'rounded-[26px]' : 'rounded-2xl',
          isFocused
            ? 'border-[var(--chat-accent-primary)]/40 shadow-md ring-2 ring-[var(--chat-accent-primary)]/30'
            : 'border-[var(--chat-glass-border)]',
        )}
      >
        {/* Slash Command Menu */}
        {showSlashMenu && (
          <SlashCommandMenu
            ref={slashMenuRef}
            query={slashQuery}
            onSelect={handleSlashSelect}
            onClose={() => setShowSlashMenu(false)}
          />
        )}

        {/* @Mention Dropdown */}
        {showMentions && filteredSkills.length > 0 && (
          <div
            ref={mentionsRef}
            className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border/60 bg-popover/95 shadow-xl backdrop-blur-xl"
          >
            <div className="p-1.5">
              <div className="mb-1.5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Skills
              </div>
              {filteredSkills.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => handleMentionSelect(skill)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {skill.id === 'auto' ? (
                      <Sparkles className="h-3.5 w-3.5" />
                    ) : (
                      <span className="text-[10px] font-bold">
                        {skill.name.substring(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{skill.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {skill.description}
                    </div>
                  </div>
                  {skill.category && skill.id !== 'auto' && (
                    <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      {skill.category}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          className={cn(
            'flex items-end gap-1 p-2 sm:gap-2 sm:p-3',
            emptyState && 'min-h-[132px] flex-wrap px-5 py-4 sm:px-6',
          )}
        >
          {/* + Overflow Menu Button */}
          <div className={cn('relative', emptyState && 'order-2')} ref={overflowRef}>
            <button
              onClick={() => {
                const next = !showOverflowMenu;
                setShowOverflowMenu(next);
                if (!next) {
                  setShowStyleSubmenu(false);
                  setShowSkillsSubmenu(false);
                  setShowConnectorsSubmenu(false);
                }
              }}
              disabled={isLoading || disabled}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                hasOverflowActive
                  ? 'bg-[var(--chat-accent-primary)]/15 text-[var(--chat-accent-primary)]'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                (isLoading || disabled) && 'cursor-not-allowed opacity-50',
              )}
              aria-label="More options"
              aria-expanded={showOverflowMenu}
            >
              <Plus className="h-5 w-5" />
            </button>

            {/* + Menu Popover */}
            {showOverflowMenu && (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-border/60 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
                {/* 1. Add files or photos */}
                <button
                  type="button"
                  onClick={() => {
                    fileInputRef.current?.click();
                    closeMenu();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                >
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-left">Add files or photos</span>
                </button>

                {/* 2. Take a screenshot */}
                <button
                  type="button"
                  disabled
                  className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/60"
                  aria-disabled="true"
                >
                  <Camera className="h-4 w-4" />
                  <span className="flex-1 text-left">Take a screenshot</span>
                  <span className="text-[10px]">Soon</span>
                </button>

                {/* 3. Add to project (stub) */}
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                >
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-left">Add to project</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>

                {/* 4. Add from GitHub (stub) */}
                <button
                  type="button"
                  disabled
                  className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/60"
                  aria-disabled="true"
                >
                  <GitFork className="h-4 w-4" />
                  <span className="flex-1 text-left">Add from GitHub</span>
                </button>

                {/* Divider */}
                <div className="my-1 border-t border-border/30" />

                {/* 5. Skills -- right flyout */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSkillsSubmenu((prev) => !prev);
                      setShowConnectorsSubmenu(false);
                      setShowStyleSubmenu(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60',
                      selectedSkill && 'text-primary',
                    )}
                  >
                    <Sparkles
                      className={cn(
                        'h-4 w-4',
                        selectedSkill ? 'text-primary' : 'text-muted-foreground',
                      )}
                    />
                    <span className="flex-1 text-left">
                      {selectedSkill ? selectedSkill.name : 'Skills'}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>

                  {showSkillsSubmenu && (
                    <div className="absolute left-full top-0 z-50 ml-1 rounded-xl border border-border/60 bg-popover/95 shadow-xl backdrop-blur-xl">
                      <SkillsMenu
                        query=""
                        onSelect={(skill) => {
                          setSelectedSkill({
                            id: skill.name,
                            name: skill.name,
                            description: skill.description,
                            category: skill.source,
                          });
                          closeMenu();
                        }}
                        onClose={() => setShowSkillsSubmenu(false)}
                      />
                    </div>
                  )}
                </div>

                {/* 6. Connectors -- right flyout */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowConnectorsSubmenu((prev) => !prev);
                      setShowSkillsSubmenu(false);
                      setShowStyleSubmenu(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                  >
                    {/* Simple connector icon */}
                    <svg
                      className="h-4 w-4 text-muted-foreground"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden="true"
                    >
                      <circle cx="3.5" cy="8" r="2" />
                      <circle cx="12.5" cy="8" r="2" />
                      <path d="M5.5 8h5" />
                    </svg>
                    <span className="flex-1 text-left">Connectors</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>

                  {showConnectorsSubmenu && (
                    <div className="absolute left-full top-0 z-50 ml-1 w-64 rounded-xl border border-border/60 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
                      {CONNECTOR_PREVIEW.map((connector) => {
                        const isConnected = connectors.connectedIds.has(connector.id);
                        const isMutating = connectors.mutatingIds.has(connector.id);
                        return (
                          <div
                            key={connector.id}
                            className="flex items-center gap-2.5 rounded-lg px-3 py-2"
                          >
                            <span className="text-base" aria-hidden="true">
                              {connector.iconEmoji ?? connector.iconText}
                            </span>
                            <span className="flex-1 truncate text-sm">{connector.name}</span>
                            <Switch
                              checked={isConnected}
                              disabled={isMutating || connectors.loading}
                              aria-label={`Toggle ${connector.name}`}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  void connectors.connect(connector.id, connector.authType);
                                } else {
                                  void connectors.disconnect(connector.id);
                                }
                              }}
                              className="h-5 w-9 data-[state=checked]:bg-[var(--chat-accent-primary)]"
                            />
                          </div>
                        );
                      })}

                      {/* Connector footer */}
                      <div className="mt-1 border-t border-border/30 pt-1">
                        <a
                          href="/connectors"
                          onClick={closeMenu}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                        >
                          Manage connectors
                        </a>
                        <a
                          href="/connectors/new"
                          onClick={closeMenu}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                        >
                          + Add connector
                        </a>
                        <a
                          href="/connectors/permissions"
                          onClick={closeMenu}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                        >
                          <span>Tool access</span>
                          <span className="text-xs text-muted-foreground/60">
                            Load tools when needed
                          </span>
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {/* 7. Plugins */}
                <a
                  href="/plugins"
                  onClick={closeMenu}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <rect x="2" y="2" width="5" height="5" rx="1" />
                    <rect x="9" y="2" width="5" height="5" rx="1" />
                    <rect x="2" y="9" width="5" height="5" rx="1" />
                    <path d="M11.5 9v6M9 11.5h6" />
                  </svg>
                  <span className="flex-1 text-left">Plugins</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </a>

                {/* Divider */}
                <div className="my-1 border-t border-border/30" />

                {/* 8. Research toggle */}
                <MenuToggleRow
                  icon={BookOpen}
                  label="Research"
                  checked={researchEnabled}
                  onToggle={() => {
                    handleResearchToggle();
                    closeMenu();
                  }}
                  disabled={isLoading || disabled}
                />

                {/* 9. Web search toggle */}
                <MenuToggleRow
                  icon={Globe}
                  label="Web search"
                  checked={webSearchEnabled}
                  onToggle={() => {
                    handleWebSearchToggle();
                    closeMenu();
                  }}
                  disabled={isLoading || disabled}
                />

                {/* 10. Use style -- right flyout */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowStyleSubmenu((prev) => !prev);
                      setShowSkillsSubmenu(false);
                      setShowConnectorsSubmenu(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60',
                      styleMode !== 'normal' && 'text-primary',
                    )}
                  >
                    <Wand2
                      className={cn(
                        'h-4 w-4',
                        styleMode !== 'normal' ? 'text-primary' : 'text-muted-foreground',
                      )}
                    />
                    <span className="flex-1 text-left">
                      {styleMode === 'normal'
                        ? 'Use style'
                        : (STYLE_OPTIONS.find((s) => s.id === styleMode)?.label ?? 'Use style')}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>

                  {showStyleSubmenu && (
                    <div className="absolute left-full top-0 z-50 ml-1 w-52 rounded-xl border border-border/60 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
                      {STYLE_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setStyleMode(option.id);
                            closeMenu();
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                            styleMode === option.id
                              ? 'bg-primary/10 text-primary'
                              : 'hover:bg-muted/60',
                          )}
                        >
                          <span className="flex-1 text-left">{option.label}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {option.description}
                          </span>
                          {styleMode === option.id && (
                            <Check className="h-3 w-3 shrink-0 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Toggle Pills -- preserved for direct access */}
          <div className={cn('flex items-center gap-1', emptyState && 'order-3')}>
            <button
              onClick={handleWebSearchToggle}
              disabled={isLoading || disabled || researchEnabled}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all',
                webSearchEnabled
                  ? 'bg-[var(--chat-accent-primary)]/15 text-[var(--chat-accent-primary)] ring-1 ring-[var(--chat-accent-primary)]/30'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                (isLoading || disabled || researchEnabled) && 'cursor-not-allowed opacity-50',
              )}
              aria-label="Toggle web search"
              aria-pressed={webSearchEnabled}
            >
              <Globe className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search</span>
            </button>

            <button
              onClick={handleResearchToggle}
              disabled={isLoading || disabled}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all',
                researchEnabled
                  ? 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                (isLoading || disabled) && 'cursor-not-allowed opacity-50',
              )}
              aria-label="Toggle research mode"
              aria-pressed={researchEnabled}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Research</span>
            </button>
          </div>

          {/* Textarea + Ghost-text overlay wrapper */}
          <div
            className={cn(
              'relative flex-1',
              emptyState ? 'order-1 min-h-[76px] basis-full' : 'min-h-[52px]',
            )}
          >
            <GhostTextOverlay
              inputText={message}
              suggestion={suggestion}
              isLoading={isSuggestionLoading}
            />

            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              disabled={isLoading || disabled}
              className={cn(
                'relative z-10 max-h-[240px] w-full resize-none overflow-y-auto border-0 bg-transparent px-2 leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50',
                emptyState
                  ? 'min-h-[76px] py-2 text-[20px] md:text-[20px]'
                  : 'min-h-[52px] py-3 text-sm md:text-[15px]',
              )}
              rows={1}
              aria-label="Message input"
              aria-describedby={suggestion ? 'ghost-text-hint' : undefined}
            />

            {suggestion && (
              <span id="ghost-text-hint" className="sr-only">
                Suggestion available: {suggestion}. Press Tab to accept.
              </span>
            )}
          </div>

          {/* Voice Input Button */}
          <VoiceInputButton
            onTranscript={(text) => {
              setMessage((prev) => {
                const separator = prev.trim() ? ' ' : '';
                return prev + separator + text;
              });
              setTimeout(() => textareaRef.current?.focus(), 50);
            }}
            disabled={isLoading || disabled}
            className={emptyState ? 'order-4 ml-auto' : undefined}
          />

          {/* Send / Stop Button */}
          <SendButton
            mode={sendButtonMode}
            hasContent={hasContent}
            disabled={disabled}
            onClick={sendButtonMode === 'stop' ? handleStop : handleSubmit}
            className={emptyState ? 'order-5' : undefined}
          />
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            addFiles(files);
            e.target.value = '';
          }}
          aria-label="File upload"
        />
      </div>

      <ComposerFooter hint={footerHint} showModelSelector />
    </div>
  );
};

/**
 * ChatComposerNew with memoization optimization.
 *
 * + menu matches Claude's structure:
 *   Add files/photos, Take screenshot (stub), Add to project (stub),
 *   Add from GitHub (stub), Skills flyout, Connectors flyout (real toggles),
 *   Plugins link, Research toggle, Web search toggle, Use style flyout.
 *
 * Removed from + menu: Focus Mode, Agent Mode, Project Context, Tools group,
 * Browse Directory. State kept with safe defaults so onSend meta is unchanged.
 */
export const ChatComposerNew = memo(ChatComposerNewComponent, (prev, next) => {
  return (
    prev.onSend === next.onSend &&
    prev.isLoading === next.isLoading &&
    prev.isGenerating === next.isGenerating &&
    prev.placeholder === next.placeholder &&
    prev.disabled === next.disabled &&
    prev.initialAgentMode === next.initialAgentMode &&
    prev.promptCompletionEnabled === next.promptCompletionEnabled &&
    prev.prefillText === next.prefillText &&
    prev.onPrefillConsumed === next.onPrefillConsumed &&
    prev.droppedFiles === next.droppedFiles &&
    prev.onDroppedFilesConsumed === next.onDroppedFilesConsumed &&
    prev.onTypingChange === next.onTypingChange &&
    prev.onStop === next.onStop &&
    prev.clearSignal === next.clearSignal &&
    prev.emptyState === next.emptyState &&
    prev.attachmentPrivacyShortLabel === next.attachmentPrivacyShortLabel
  );
});

ChatComposerNew.displayName = 'ChatComposerNew';
