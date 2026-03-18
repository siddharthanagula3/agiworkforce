'use client';

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  Plus,
  Paperclip,
  X,
  Image as ImageIcon,
  Video,
  FileText,
  Globe,
  Sparkles,
  Brain,
  BookOpen,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { ChatAIService, type SkillInfo } from '@features/chat/services/chat-ai-service';
import { FocusModeButtons, type FocusMode } from './FocusModeButtons';
import { ActiveModeTags, type ModeTag } from './ActiveModeTags';
import { SlashCommandMenu, type SlashCommandMenuHandle } from './SlashCommandMenu';
import { SendButton } from './SendButton';
import { ComposerFooter } from './ComposerFooter';
import { InputFooter } from './InputFooter';
import { DragDropOverlay } from './DragDropOverlay';
import { GhostTextOverlay } from './GhostTextOverlay';
import { AgentModeSwitcher } from './AgentModeSwitcher';
import { FolderContextSelector } from './FolderContextSelector';
import { VoiceInputButton } from './VoiceInputButton';
import { AttachmentPreview } from './AttachmentPreview';
import { useAttachments } from '@features/chat/hooks/use-attachments';
import { useApiPromptCompletion } from '@/hooks/useApiPromptCompletion';
import type { ChatMode } from '@features/chat/types';

interface ChatComposerProps {
  onSend: (
    content: string,
    attachments?: File[],
    skillId?: string,
    meta?: { agentMode: ChatMode; folderId: string | null },
  ) => void;
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
}

const TOOLS = [
  { id: 'image', label: 'Generate Image', icon: ImageIcon, color: 'text-purple-400' },
  { id: 'video', label: 'Generate Video', icon: Video, color: 'text-pink-400' },
  { id: 'document', label: 'Create Document', icon: FileText, color: 'text-blue-400' },
  { id: 'search', label: 'Web Search', icon: Globe, color: 'text-emerald-400' },
];

const FOCUS_MODE_TAGS: Record<NonNullable<FocusMode>, ModeTag[]> = {
  web: [{ id: 'web-search', label: 'Web Search', color: 'teal' }],
  academic: [
    { id: 'research', label: 'Research', color: 'blue' },
    { id: 'reasoning', label: 'Reasoning', color: 'indigo' },
  ],
  code: [{ id: 'coding', label: 'Coding', color: 'green' }],
  writing: [{ id: 'writing-assist', label: 'Writing', color: 'purple' }],
  research: [
    { id: 'deep-research', label: 'Research', color: 'blue' },
    { id: 'web-search-r', label: 'Web Search', color: 'teal' },
    { id: 'reasoning-r', label: 'Reasoning', color: 'indigo' },
  ],
};

const ChatComposerNewComponent = ({
  onSend,
  isLoading = false,
  isGenerating = false,
  placeholder = 'Message AGI Workforce...',
  disabled = false,
  initialAgentMode = 'solo',
  promptCompletionEnabled = true,
  prefillText,
  onPrefillConsumed,
  droppedFiles,
  onDroppedFilesConsumed,
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
      // A toast notification could be wired here in the future.
    },
  });
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>(() =>
    ChatAIService.getAvailableSkillsSync(),
  );
  const [focusMode, setFocusMode] = useState<FocusMode>(null);
  const [activeTags, setActiveTags] = useState<ModeTag[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [agentMode, setAgentMode] = useState<ChatMode>(initialAgentMode);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [researchEnabled, setResearchEnabled] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const mentionsRef = useRef<HTMLDivElement>(null);
  const slashMenuRef = useRef<SlashCommandMenuHandle>(null);

  // Ghost-text prompt completion
  const {
    suggestion,
    isLoading: isSuggestionLoading,
    accept: acceptSuggestion,
    clear: clearSuggestion,
  } = useApiPromptCompletion(message, {
    enabled: promptCompletionEnabled && !showSlashMenu && !showMentions,
  });

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
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 52), 200);
    textarea.style.height = `${newHeight}px`;
  }, [message]);

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
      }
      if (mentionsRef.current && !mentionsRef.current.contains(e.target as Node)) {
        setShowMentions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync tags when focus mode changes
  const handleFocusModeChange = useCallback((mode: FocusMode) => {
    setFocusMode(mode);
    setActiveTags(mode ? FOCUS_MODE_TAGS[mode] : []);
  }, []);

  const handleTagDismiss = useCallback((id: string) => {
    setActiveTags((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleWebSearchToggle = useCallback(() => {
    setWebSearchEnabled((prev) => {
      const next = !prev;
      if (next) {
        handleFocusModeChange('web');
      } else if (focusMode === 'web') {
        handleFocusModeChange(null);
      }
      return next;
    });
  }, [focusMode, handleFocusModeChange]);

  const handleThinkingToggle = useCallback(() => {
    setThinkingEnabled((prev) => !prev);
  }, []);

  const handleResearchToggle = useCallback(() => {
    setResearchEnabled((prev) => {
      const next = !prev;
      if (next) {
        handleFocusModeChange('research');
        setWebSearchEnabled(false);
      } else if (focusMode === 'research') {
        handleFocusModeChange(null);
      }
      return next;
    });
  }, [focusMode, handleFocusModeChange]);

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
    const toolMap: Record<string, string> = {
      search: 'search',
      image: 'image',
      doc: 'document',
    };
    const toolId = toolMap[commandId];
    if (toolId) {
      setSelectedTools((prev) => (prev.includes(toolId) ? prev : [...prev, toolId]));
    }
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const handleStop = useCallback(() => {
    ChatAIService.stopGeneration();
  }, []);

  const handleSubmit = useCallback(() => {
    if (!message.trim() && attachments.length === 0) return;
    if (isLoading || disabled) return;

    const toolPrefixes: Record<string, string> = {
      image: '[Generate Image] ',
      video: '[Generate Video] ',
      document: '[Create Document] ',
      search: '[Web Search] ',
    };
    const prefix = selectedTools.map((t) => toolPrefixes[t] || '').join('');
    const thinkingPrefix = thinkingEnabled ? '[Extended Thinking] ' : '';
    const researchPrefix =
      researchEnabled && !selectedTools.includes('search') ? '[Research Mode] ' : '';

    onSend(
      thinkingPrefix + researchPrefix + prefix + message,
      attachments.length > 0 ? attachments : undefined,
      selectedSkill?.id,
      {
        agentMode,
        folderId: selectedFolderId,
      },
    );

    setMessage('');
    clearAttachments();
    setSelectedTools([]);
    setSelectedSkill(null);
    setWebSearchEnabled(false);
    setThinkingEnabled(false);
    setResearchEnabled(false);
    clearSuggestion();

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [
    message,
    attachments,
    selectedTools,
    selectedSkill,
    isLoading,
    disabled,
    agentMode,
    selectedFolderId,
    thinkingEnabled,
    researchEnabled,
    onSend,
    clearAttachments,
    clearSuggestion,
  ]);

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

      if (e.key === 'Enter' && !e.shiftKey && !showMentions) {
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

  const toggleTool = useCallback((toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId],
    );
  }, []);

  const hasContent = Boolean(message.trim() || attachments.length > 0);

  /**
   * Derive the 3-state mode for SendButton:
   * - 'stop'  — AI is loading (actively streaming); clicking aborts the stream
   * - 'queue' — AI is generating but user has typed a message to queue
   * - 'send'  — idle; button submits the current message
   */
  const sendButtonMode = isLoading ? 'stop' : isGenerating && hasContent ? 'queue' : 'send';

  const footerHint = showSlashMenu
    ? 'Tab to accept · Esc to dismiss'
    : suggestion
      ? 'Tab to accept suggestion · Enter to send'
      : 'Enter to send · Shift+Enter for newline';

  const handleFileDrop = useCallback(
    (files: File[]) => {
      addFiles(files);
    },
    [addFiles],
  );

  // Determine if any overflow features are active (for the + button indicator)
  const hasOverflowActive =
    focusMode !== null ||
    agentMode !== 'solo' ||
    selectedFolderId !== null ||
    selectedTools.length > 0 ||
    webSearchEnabled ||
    thinkingEnabled ||
    researchEnabled;

  return (
    <div className="relative w-full pb-4 sticky bottom-0 z-20 bg-background/95 backdrop-blur-sm md:static md:bg-transparent md:backdrop-blur-none">
      <DragDropOverlay onDrop={handleFileDrop} />

      {/* Active Mode Tags — shown above the composer when a focus mode is active */}
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
          <span className="text-[10px] text-muted-foreground">{selectedSkill.category}</span>
        </div>
      )}

      {/* Selected Tools Tags */}
      {selectedTools.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {selectedTools.map((toolId) => {
            const tool = TOOLS.find((t) => t.id === toolId);
            if (!tool) return null;
            const Icon = tool.icon;
            return (
              <span
                key={toolId}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/50 px-2.5 py-1 text-xs"
              >
                <Icon className={cn('h-3 w-3', tool.color)} />
                {tool.label}
                <button
                  onClick={() => toggleTool(toolId)}
                  className="rounded-full p-0.5 hover:bg-muted"
                  aria-label={`Remove ${tool.label}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Attachments — rich preview with image thumbnails and doc chips */}
      <AttachmentPreview previews={previews} onRemove={removeFile} className="mb-2" />

      {/* Main Input Container */}
      <div
        id="chat-composer"
        className={cn(
          'relative rounded-2xl border bg-[var(--chat-bg-elevated)] shadow-sm backdrop-blur-sm transition-all duration-200',
          isFocused
            ? 'border-teal-500/40 shadow-md ring-2 ring-teal-500/30'
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

        <div className="flex items-end gap-1 p-2 sm:gap-2 sm:p-3">
          {/* + Overflow Menu Button — contains focus modes, agent mode, folder, tools */}
          <div className="relative" ref={overflowRef}>
            <button
              onClick={() => setShowOverflowMenu(!showOverflowMenu)}
              disabled={isLoading || disabled}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                hasOverflowActive
                  ? 'bg-teal-500/15 text-teal-500'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                (isLoading || disabled) && 'cursor-not-allowed opacity-50',
              )}
              aria-label="More options"
              aria-expanded={showOverflowMenu}
            >
              <Plus className="h-5 w-5" />
            </button>

            {/* Overflow Menu Popover */}
            {showOverflowMenu && (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-border/60 bg-popover/95 p-2 shadow-xl backdrop-blur-xl">
                {/* Focus Modes */}
                <div className="mb-2">
                  <div className="mb-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Focus Mode
                  </div>
                  <FocusModeButtons
                    activeMode={focusMode}
                    onChange={(mode) => {
                      handleFocusModeChange(mode);
                    }}
                  />
                </div>

                {/* Divider */}
                <div className="my-1.5 border-t border-border/30" />

                {/* Agent Mode */}
                <div className="mb-2">
                  <div className="mb-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Agent Mode
                  </div>
                  <div className="px-1">
                    <AgentModeSwitcher
                      mode={agentMode}
                      onChange={setAgentMode}
                      disabled={isLoading || disabled}
                    />
                  </div>
                </div>

                {/* Divider */}
                <div className="my-1.5 border-t border-border/30" />

                {/* Folder Context */}
                <div className="mb-2">
                  <div className="mb-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Project Context
                  </div>
                  <div className="px-1">
                    <FolderContextSelector
                      selectedFolderId={selectedFolderId}
                      onChange={setSelectedFolderId}
                      disabled={isLoading || disabled}
                    />
                  </div>
                </div>

                {/* Divider */}
                <div className="my-1.5 border-t border-border/30" />

                {/* Tools */}
                <div>
                  <div className="mb-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Tools
                  </div>
                  {TOOLS.map((tool) => {
                    const Icon = tool.icon;
                    const isSelected = selectedTools.includes(tool.id);
                    return (
                      <button
                        key={tool.id}
                        onClick={() => toggleTool(tool.id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                          isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60',
                        )}
                      >
                        <Icon className={cn('h-4 w-4', tool.color)} />
                        <span className="flex-1 text-left">{tool.label}</span>
                        {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Attach Button (paperclip) */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || disabled}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
              (isLoading || disabled) && 'cursor-not-allowed opacity-50',
            )}
            aria-label="Attach file"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          {/* Quick Toggle Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleWebSearchToggle}
              disabled={isLoading || disabled || researchEnabled}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all',
                webSearchEnabled
                  ? 'bg-teal-500/15 text-teal-400 ring-1 ring-teal-500/30'
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
              onClick={handleThinkingToggle}
              disabled={isLoading || disabled}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all',
                thinkingEnabled
                  ? 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                (isLoading || disabled) && 'cursor-not-allowed opacity-50',
              )}
              aria-label="Toggle extended thinking"
              aria-pressed={thinkingEnabled}
            >
              <Brain className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Think</span>
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
          <div className="relative min-h-[52px] flex-1">
            {/* Ghost-text overlay positioned behind the textarea */}
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
              // bg-transparent so the ghost-text overlay behind shows through
              className="relative z-10 min-h-[52px] w-full resize-none border-0 bg-transparent px-2 py-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50 md:text-[15px]"
              rows={1}
              aria-label="Message input"
              aria-describedby={suggestion ? 'ghost-text-hint' : undefined}
            />

            {/* Screen-reader announcement for ghost-text suggestion */}
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
          />

          {/* Send / Stop Button */}
          <SendButton
            mode={sendButtonMode}
            hasContent={hasContent}
            disabled={disabled}
            onClick={sendButtonMode === 'stop' ? handleStop : handleSubmit}
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

      {/* Footer: keyboard hint + credits */}
      <InputFooter hint={footerHint} />

      {/* Footer row 2: model selector */}
      <div className="mt-1.5 flex items-center justify-end gap-2 px-1">
        <ComposerFooter showModelSelector />
      </div>
    </div>
  );
};

/**
 * ChatComposerNew with memoization optimization.
 *
 * Enhancements over the original version:
 * - Ghost-text prompt completion via useApiPromptCompletion (Tab/ArrowRight to accept)
 * - Agent mode, focus modes, folder selector moved into "+" overflow menu
 * - Accepts prefillText prop for empty-state category pills
 * - Rounded-2xl border with teal focus ring
 * - Existing slash commands, @mentions, and voice input preserved
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
    prev.onDroppedFilesConsumed === next.onDroppedFilesConsumed
  );
});

ChatComposerNew.displayName = 'ChatComposerNew';
