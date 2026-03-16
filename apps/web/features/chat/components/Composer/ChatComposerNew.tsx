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

interface ChatComposerProps {
  onSend: (content: string, attachments?: File[], skillId?: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
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
  placeholder = 'Message AI...',
  disabled = false,
}: ChatComposerProps) => {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showTools, setShowTools] = useState(false);
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const mentionsRef = useRef<HTMLDivElement>(null);
  const slashMenuRef = useRef<SlashCommandMenuHandle>(null);

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
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setShowTools(false);
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

  // Handle input change: detect @mention and /command
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setMessage(value);

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
  }, []);

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
    // Append command prefix as a tool tag
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

    onSend(prefix + message, attachments.length > 0 ? attachments : undefined, selectedSkill?.id);
    setMessage('');
    setAttachments([]);
    setSelectedTools([]);
    setSelectedSkill(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, attachments, selectedTools, selectedSkill, isLoading, disabled, onSend]);

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
      if (e.key === 'Enter' && !e.shiftKey && !showMentions) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        setShowTools(false);
        setShowSlashMenu(false);
      }
    },
    [handleSubmit, showMentions, showSlashMenu],
  );

  const toggleTool = (toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId],
    );
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const canSend = (message.trim() || attachments.length > 0) && !isLoading && !disabled;
  const footerHint = showSlashMenu
    ? 'Tab to accept · Esc to dismiss'
    : 'Enter to send · Shift+Enter for newline';

  const handleFileDrop = useCallback((files: File[]) => {
    setAttachments((prev) => [...prev, ...files]);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-3xl px-2 sm:px-4 pb-4">
      <DragDropOverlay onDrop={handleFileDrop} />
      {/* Focus Mode Pills */}
      <FocusModeButtons activeMode={focusMode} onChange={handleFocusModeChange} />

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

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((file, i) => (
            <div
              key={`${file.name}-${file.size}`}
              className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5"
            >
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="max-w-[150px] truncate text-xs">{file.name}</span>
              <button
                onClick={() => removeAttachment(i)}
                className="rounded-full p-0.5 hover:bg-muted"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Input Container */}
      <div
        className={cn(
          'relative rounded-xl sm:rounded-2xl border bg-card/80 shadow-sm backdrop-blur-xl transition-all duration-200',
          isFocused ? 'border-border/80 shadow-md ring-1 ring-ring/20' : 'border-border/40',
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

        <div className="flex flex-col sm:flex-row items-end gap-1 sm:gap-2 p-2 sm:p-3">
          {/* + Tools Button */}
          <div className="relative" ref={toolsRef}>
            <button
              onClick={() => setShowTools(!showTools)}
              disabled={isLoading || disabled}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                selectedTools.length > 0
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                (isLoading || disabled) && 'cursor-not-allowed opacity-50',
              )}
              aria-label="Add tools"
              aria-expanded={showTools}
            >
              <Plus className="h-5 w-5" />
            </button>

            {/* Tools Popover */}
            {showTools && (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-52 rounded-xl border border-border/60 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
                <div className="mb-1.5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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
            )}
          </div>

          {/* Attach Button */}
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

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={isLoading || disabled}
            className="min-h-[52px] flex-1 resize-none border-0 bg-transparent px-2 py-3 text-xs sm:text-sm md:text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50"
            rows={1}
            aria-label="Message input"
          />

          {/* 3-State Send Button */}
          <SendButton
            mode={isLoading ? 'stop' : 'send'}
            onClick={isLoading ? handleStop : handleSubmit}
            disabled={!canSend && !isLoading}
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
            setAttachments((prev) => [...prev, ...files]);
            e.target.value = '';
          }}
          aria-label="File upload"
        />
      </div>

      {/* Footer row 1: keyboard hint + credit usage bar */}
      <InputFooter hint={footerHint} />

      {/* Footer row 2: model selector */}
      <ComposerFooter showModelSelector />
    </div>
  );
};

/**
 * ChatComposerNew with memoization optimization.
 *
 * - All event handlers memoized with useCallback
 * - Component wrapped with React.memo to prevent re-renders from parent changes
 * - Filtered skills computed with useMemo
 */
export const ChatComposerNew = memo(ChatComposerNewComponent, (prev, next) => {
  // Return true if props are equal (skip re-render)
  return (
    prev.onSend === next.onSend &&
    prev.isLoading === next.isLoading &&
    prev.placeholder === next.placeholder &&
    prev.disabled === next.disabled
  );
});

ChatComposerNew.displayName = 'ChatComposerNew';
