'use client';

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  Plus,
  X,
  Paperclip,
  Globe,
  Sparkles,
  Wand2,
  ChevronRight,
  Check,
  Camera,
  Brain,
  EyeOff,
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
import { useChatStore } from '@shared/stores/chat-store';
import { useModelStore } from '@shared/stores/model-store';
import { getModelMetadata } from '@/constants/llm';
import { useThinkingStore } from '@shared/stores/thinking-store';
import type { ChatMode } from '@features/chat/types';
import { FREE_TRIAL_MAX_INPUT_CHARS, getFreeTrialRemaining } from '../../stores/freeTrialStore';
import { CONNECTORS } from '@features/connectors/data/connectors';
import { useConnectors } from '@features/connectors/hooks/use-connectors';
import { Switch } from '@shared/ui/switch';
import { EFFORT_LABEL } from '@agiworkforce/types';

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
      /** Resolved skill body injected as a system message in the LLM request. */
      skillBody?: string;
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
  /** Opens the Cloud Managed waitlist modal from locked model/usage upgrade affordances. */
  onUpgradeRequest?: () => void;
  /** Website free trial state. When enabled, the composer is text-only Auto Economy. */
  freeTrial?: {
    enabled: boolean;
    promptsUsed: number | null;
    promptLimit: number;
  };
}

const CONNECTOR_PHASE1 = CONNECTORS.filter((c) => c.phase === 1).slice(0, 8);

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

/** Toggle row used in the + menu for connected send options. */
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
  onUpgradeRequest,
  freeTrial,
}: ChatComposerProps) => {
  const [message, setMessage] = useState('');
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const {
    attachments,
    previews,
    addFiles,
    removeFile,
    clearAll: clearAttachments,
  } = useAttachments({
    onError: (message) => setLocalNotice(message),
  });
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [skillBody, setSkillBody] = useState<string | null>(null);
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
  const [styleMode, setStyleMode] = useState<StyleMode>('normal');
  const [showStyleSubmenu, setShowStyleSubmenu] = useState(false);
  const [showSkillsSubmenu, setShowSkillsSubmenu] = useState(false);
  const [showConnectorsSubmenu, setShowConnectorsSubmenu] = useState(false);
  const isFreeTrial = freeTrial?.enabled ?? false;
  const trialPromptLimit = freeTrial?.promptLimit ?? 3;
  const trialPromptsRemaining = getFreeTrialRemaining(
    freeTrial?.promptsUsed ?? null,
    trialPromptLimit,
  );
  const trialExhausted = isFreeTrial && trialPromptsRemaining <= 0;

  // Capability gating: enable/disable composer affordances based on the SELECTED
  // model's capabilities so a user never sends an input the model can't handle
  // (e.g. an image to a text-only model, or web search to a no-search model).
  const composerSelectedModelId = useModelStore((s) => s.selectedModelId);
  const selectedModelCaps = getModelMetadata(composerSelectedModelId)?.capabilities;
  const modelSupportsVision = selectedModelCaps?.vision ?? false;
  const modelSupportsSearch = selectedModelCaps?.search ?? false;
  const modelSupportsThinkingCap = selectedModelCaps?.thinking ?? false;

  // If the user switches to a model that can't search, clear the web-search
  // toggle so it never stays "on" for an unsupported model.
  useEffect(() => {
    if (webSearchEnabled && !modelSupportsSearch) setWebSearchEnabled(false);
  }, [webSearchEnabled, modelSupportsSearch]);

  // Incognito / temporary chat
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const isIncognito = useChatStore((s) =>
    s.activeConversationId
      ? (s.conversations[s.activeConversationId]?.isTemporary ?? false)
      : false,
  );
  const toggleTemporary = useChatStore((s) => s.toggleTemporaryConversation);
  const handleIncognitoToggle = useCallback(() => {
    if (activeConversationId) toggleTemporary(activeConversationId);
  }, [activeConversationId, toggleTemporary]);
  const canToggleIncognito = Boolean(activeConversationId) && !isLoading && !disabled;

  // Thinking / effort store
  const thinkingEnabled = useThinkingStore((s) => s.enabled);
  const thinkingEffort = useThinkingStore((s) => s.effort);
  const setThinkingEffort = useThinkingStore((s) => s.setEffort);
  const thinkingCycle = useThinkingStore((s) => s.cycleEffort);
  const handleThinkingClick = useCallback(() => {
    if (!thinkingEnabled) {
      setThinkingEffort('low');
    } else {
      thinkingCycle();
    }
  }, [thinkingEnabled, setThinkingEffort, thinkingCycle]);

  // Real connector state from the server
  const connectors = useConnectors();

  // Build connector list for the + menu submenu: show connected connectors first,
  // then fill with phase-1 connectors. Cap at 8 to keep the popover compact.
  const connectorMenuList = React.useMemo(() => {
    const connected = CONNECTORS.filter((c) => connectors.connectedIds.has(c.id));
    if (connected.length > 0) {
      // Show all connected ones plus any phase-1 not yet connected, capped at 8.
      const phase1NotConnected = CONNECTOR_PHASE1.filter((c) => !connectors.connectedIds.has(c.id));
      return [...connected, ...phase1NotConnected].slice(0, 8);
    }
    return CONNECTOR_PHASE1;
  }, [connectors.connectedIds]);

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
    // Ghost-text autocomplete hits /api/completion, which requires an active paid
    // subscription — never call it for free-trial users (avoids 403 spam per keystroke).
    enabled: promptCompletionEnabled && !isFreeTrial && !showSlashMenu && !showMentions,
  });

  const clearComposerState = useCallback(() => {
    setMessage('');
    clearAttachments();
    setSelectedSkill(null);
    setSkillBody(null);
    setWebSearchEnabled(false);
    setStyleMode('normal');
    setShowStyleSubmenu(false);
    setActiveTags([]);
    setLocalNotice(null);
    clearSuggestion();

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [clearAttachments, clearSuggestion]);

  useEffect(() => {
    if (!isFreeTrial) return;
    setSelectedSkill(null);
    setSkillBody(null);
    setWebSearchEnabled(false);
    setStyleMode('normal');
    setShowOverflowMenu(false);
    setShowSkillsSubmenu(false);
    setShowConnectorsSubmenu(false);
    setShowStyleSubmenu(false);
    if (attachments.length > 0) {
      clearAttachments();
    }
  }, [attachments.length, clearAttachments, isFreeTrial]);

  useEffect(() => {
    if (clearSignal === undefined || clearSignal === lastClearSignalRef.current) return;
    lastClearSignalRef.current = clearSignal;
    clearComposerState();
  }, [clearComposerState, clearSignal]);

  // Fetch skill body whenever a skill is selected (covers both slash-command and + menu paths).
  // Body is stored in state and injected as a system message when the user sends.
  useEffect(() => {
    if (!selectedSkill) {
      setSkillBody(null);
      return;
    }
    let cancelled = false;
    const skillName = selectedSkill.name;
    void (async () => {
      try {
        const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}`);
        if (!res.ok) throw new Error(`Could not load ${skillName}`);
        const json = (await res.json()) as { body?: unknown };
        const body = typeof json.body === 'string' && json.body.trim() ? json.body : null;
        if (!body) throw new Error(`Could not load ${skillName}`);
        if (!cancelled) {
          setSkillBody(body);
          setLocalNotice(null);
        }
      } catch {
        if (!cancelled) {
          setSkillBody(null);
          setSelectedSkill(null);
          setLocalNotice(`Could not load ${skillName} skill instructions. Select the skill again.`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSkill]);

  // Handle prefillText prop · React "derived state from props" pattern.
  // When the parent passes a new non-empty prefillText, we update message
  // and notify the parent. This uses the recommended setState-during-render
  // pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  const [prevPrefill, setPrevPrefill] = useState(prefillText);
  if (prefillText && prefillText.length > 0 && prefillText !== prevPrefill) {
    setPrevPrefill(prefillText);
    setMessage(prefillText);
    onPrefillConsumed?.();
  }

  const addImageAttachments = useCallback(
    (files: File[]) => {
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      if (imageFiles.length === 0) {
        setLocalNotice(
          'Web chat currently accepts images only. Other file types require Cloud file support.',
        );
        return;
      }

      setLocalNotice(
        imageFiles.length === files.length
          ? null
          : 'Only images were attached. Other file types require Cloud file support.',
      );
      addFiles(imageFiles);
    },
    [addFiles],
  );

  // Handle droppedFiles prop · same derived-state-from-props pattern as prefillText.
  // When the parent passes files dropped onto the message area, feed them into the
  // attachment hook and notify the parent so it can clear the pending state.
  const [prevDroppedFiles, setPrevDroppedFiles] = useState(droppedFiles);
  if (droppedFiles && droppedFiles.length > 0 && droppedFiles !== prevDroppedFiles) {
    setPrevDroppedFiles(droppedFiles);
    if (!modelSupportsVision) {
      setLocalNotice(
        'The selected model can’t read images. Switch to a vision model (e.g. Gemini 3.1 Flash Lite) to attach images.',
      );
    } else {
      addImageAttachments(droppedFiles);
    }
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
    setWebSearchEnabled((prev) => !prev);
  }, []);

  const closeMenu = useCallback(() => {
    setShowOverflowMenu(false);
    setShowSkillsSubmenu(false);
    setShowConnectorsSubmenu(false);
    setShowStyleSubmenu(false);
  }, []);

  // Stable refs so handleInputChange never captures suggestion/clearSuggestion
  // directly in its dep array. Previously, including them caused the callback
  // to get a new identity on every streaming token (suggestion clears when the
  // user types), which triggered React error #185 "Maximum update depth exceeded"
  // via the controlled-textarea onChange → setMessage → re-render loop.
  const suggestionRef = useRef(suggestion);
  suggestionRef.current = suggestion;
  const clearSuggestionRef = useRef(clearSuggestion);
  clearSuggestionRef.current = clearSuggestion;

  // Handle input change: detect @mention and /command; clear stale ghost-text
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart || 0;
      setMessage(value);

      // Clear ghost-text suggestion on new input (via ref to avoid dep instability)
      if (suggestionRef.current) {
        clearSuggestionRef.current();
      }

      if (isFreeTrial && value.startsWith('/')) {
        setShowSlashMenu(false);
        setShowMentions(false);
        setLocalNotice(
          'Slash commands are available on hosted cloud upgrades. Free web chat accepts plain text prompts.',
        );
        return;
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
    [isFreeTrial],
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

  const handleSlashSelect = useCallback(
    (commandId: string) => {
      if (isFreeTrial) {
        setMessage('');
        setShowSlashMenu(false);
        setLocalNotice(
          'Slash commands are part of hosted cloud upgrades. Free web chat is text-only Auto Economy.',
        );
        setTimeout(() => textareaRef.current?.focus(), 0);
        return;
      }
      setMessage('');
      setShowSlashMenu(false);
      if (commandId === 'search') setWebSearchEnabled(true);
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [isFreeTrial],
  );

  const handleSkillSelect = useCallback(
    (skillName: string) => {
      if (isFreeTrial) {
        setMessage('');
        setShowSlashMenu(false);
        setLocalNotice(
          'Skills are available on hosted cloud upgrades. Use plain text prompts in the free web trial.',
        );
        setTimeout(() => textareaRef.current?.focus(), 0);
        return;
      }
      setSelectedSkill({ id: skillName, name: skillName, description: '', category: 'Skill' });
      setMessage('');
      setShowSlashMenu(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [isFreeTrial],
  );

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
      if (trialExhausted) {
        onUpgradeRequest?.();
        return;
      }
      if (isFreeTrial && attachments.length > 0) {
        setLocalNotice(
          'The website free trial is text-only. Upgrade for hosted file and image uploads.',
        );
        return;
      }
      if (isFreeTrial && message.trim().length > FREE_TRIAL_MAX_INPUT_CHARS) {
        setLocalNotice(
          'This prompt is too large for the website free trial. Shorten it or upgrade for larger hosted prompts.',
        );
        return;
      }

      const result = onSend(
        message,
        attachments.length > 0 ? attachments : undefined,
        selectedSkill?.id,
        {
          agentMode,
          folderId: selectedFolderId,
          webSearchEnabled,
          thinkingEnabled,
          styleMode: styleMode !== 'normal' ? styleMode : undefined,
          skillBody: skillBody ?? undefined,
        },
      );

      if (result === false) return;
      clearComposerState();
    }, // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      message,
      attachments,
      selectedSkill,
      skillBody,
      isLoading,
      disabled,
      trialExhausted,
      isFreeTrial,
      onUpgradeRequest,
      agentMode,
      selectedFolderId,
      thinkingEnabled,
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
  const composerDisabled = disabled || trialExhausted;

  /**
   * Derive the 3-state mode for SendButton:
   * - 'stop'  -- AI is loading (actively streaming); clicking aborts the stream
   * - 'queue' -- AI is generating but user has typed a message to queue
   * - 'send'  -- idle; button submits the current message
   */
  const sendButtonMode = isLoading ? 'stop' : isGenerating && hasContent ? 'queue' : 'send';

  const handleFileDrop = useCallback(
    (files: File[]) => {
      if (!modelSupportsVision) {
        setLocalNotice(
          'The selected model can’t read images. Switch to a vision model (e.g. Gemini 3.1 Flash Lite) to attach images.',
        );
        return;
      }
      addImageAttachments(files);
    },
    [addImageAttachments, modelSupportsVision],
  );

  // + button indicator: amber tint when any feature is active
  const hasOverflowActive = selectedSkill !== null || webSearchEnabled || styleMode !== 'normal';

  return (
    <div className="relative w-full pb-4 sticky bottom-0 z-20 bg-background/95 backdrop-blur-sm md:static md:bg-transparent md:backdrop-blur-none">
      {modelSupportsVision && <DragDropOverlay onDrop={handleFileDrop} />}

      {isFreeTrial && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--chat-glass-border)] bg-[var(--chat-bg-elevated)]/90 px-3 py-2 text-xs text-[var(--chat-text-secondary)] shadow-sm">
          <span>
            Free trial · {trialPromptsRemaining}/{trialPromptLimit} prompts left
          </span>
          <button
            type="button"
            onClick={onUpgradeRequest}
            className="font-medium text-[var(--chat-accent-primary)] hover:underline"
          >
            Upgrade
          </button>
        </div>
      )}

      {localNotice && (
        <div
          role="alert"
          className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
        >
          {localNotice}
        </div>
      )}

      {/* Active Mode Tags */}
      <ActiveModeTags tags={activeTags} onDismiss={handleTagDismiss} />

      {/* Selected Skill Badge */}
      {selectedSkill && !isFreeTrial && (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-400">
            /{selectedSkill.name}
            <button
              onClick={() => setSelectedSkill(null)}
              className="rounded-full p-0.5 hover:bg-emerald-500/20"
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
        {showSlashMenu && !isFreeTrial && (
          <SlashCommandMenu
            ref={slashMenuRef}
            query={slashQuery}
            onSelect={handleSlashSelect}
            onSkillSelect={handleSkillSelect}
            onClose={() => setShowSlashMenu(false)}
          />
        )}

        {/* @Mention Dropdown */}
        {showMentions && filteredSkills.length > 0 && !isFreeTrial && (
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
            // Two-row layout (textarea full-width on top, controls below) via
            // flex-wrap + order — same pattern in both empty and docked states so
            // the placeholder never gets pushed to the centre.
            'flex flex-wrap items-end gap-1 p-2 sm:gap-2 sm:p-3',
            emptyState && 'px-4 py-3 sm:px-5',
          )}
        >
          {/* + Overflow Menu Button */}
          <div className={cn('relative order-2')} ref={overflowRef}>
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
              disabled={isLoading || composerDisabled}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                hasOverflowActive
                  ? 'bg-[var(--chat-accent-primary)]/15 text-[var(--chat-accent-primary)]'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                (isLoading || composerDisabled) && 'cursor-not-allowed opacity-50',
              )}
              aria-label="More options"
              aria-expanded={showOverflowMenu}
            >
              <Plus className="h-5 w-5" />
            </button>

            {/* + Menu Popover */}
            {showOverflowMenu && (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-border/60 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
                {
                  <>
                    {/* 1. Add photos */}
                    <button
                      type="button"
                      disabled={!modelSupportsVision}
                      onClick={() => {
                        fileInputRef.current?.click();
                        closeMenu();
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60',
                        !modelSupportsVision && 'cursor-not-allowed opacity-50',
                      )}
                      title={modelSupportsVision ? undefined : 'This model can’t read images'}
                    >
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-left">Add photos &amp; files</span>
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
                      <span className="text-[10px]">Desktop only</span>
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
                          {connectorMenuList.map((connector) => {
                            const isConnected = connectors.connectedIds.has(connector.id);
                            const isMutating = connectors.mutatingIds.has(connector.id);
                            const canToggle = isConnected || connector.authType !== 'oauth';
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
                                  disabled={isMutating || connectors.loading || !canToggle}
                                  aria-label={`Toggle ${connector.name}`}
                                  onCheckedChange={(checked) => {
                                    if (checked && connector.authType === 'oauth') return;
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

                    {/* 8. Web search toggle */}
                    <MenuToggleRow
                      icon={Globe}
                      label="Web search"
                      checked={webSearchEnabled}
                      onToggle={() => {
                        handleWebSearchToggle();
                        closeMenu();
                      }}
                      disabled={isLoading || disabled || !modelSupportsSearch}
                    />

                    {/* 9. Use style -- right flyout */}
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
                  </>
                }
              </div>
            )}
          </div>

          {/* Quick Toggle Pills · shown for everyone (incl. free Hobby trial);
              each toggle is gated by the selected model's capabilities below. */}
          {
            <div className={cn('flex items-center gap-1 order-3')}>
              <button
                onClick={handleWebSearchToggle}
                disabled={isLoading || disabled || !modelSupportsSearch}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all',
                  webSearchEnabled
                    ? 'bg-[var(--chat-accent-primary)]/15 text-[var(--chat-accent-primary)] ring-1 ring-[var(--chat-accent-primary)]/30'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  (isLoading || disabled || !modelSupportsSearch) &&
                    'cursor-not-allowed opacity-50',
                )}
                aria-label="Toggle web search"
                aria-pressed={webSearchEnabled}
                title={modelSupportsSearch ? undefined : 'This model can’t search the web'}
              >
                <Globe className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Search</span>
              </button>

              <button
                onClick={handleThinkingClick}
                disabled={isLoading || disabled || !modelSupportsThinkingCap}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all',
                  thinkingEnabled
                    ? 'bg-muted/60 text-[var(--chat-accent-primary)] ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  (isLoading || disabled || !modelSupportsThinkingCap) &&
                    'cursor-not-allowed opacity-50',
                )}
                aria-label={
                  thinkingEnabled
                    ? `Effort: ${EFFORT_LABEL[thinkingEffort]}. Click to cycle.`
                    : 'Enable thinking effort'
                }
                aria-pressed={thinkingEnabled}
                title={
                  thinkingEnabled
                    ? `Thinking effort: ${EFFORT_LABEL[thinkingEffort]}. Click to cycle levels.`
                    : 'Enable extended thinking with effort control'
                }
              >
                <Brain className="h-3.5 w-3.5" />
                {thinkingEnabled && (
                  <span className="hidden sm:inline">{EFFORT_LABEL[thinkingEffort]}</span>
                )}
              </button>

              {activeConversationId ? (
                <button
                  onClick={handleIncognitoToggle}
                  disabled={!canToggleIncognito}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all',
                    isIncognito
                      ? 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    !canToggleIncognito && 'cursor-not-allowed opacity-50',
                  )}
                  aria-label={isIncognito ? 'Disable incognito mode' : 'Enable incognito mode'}
                  aria-pressed={isIncognito}
                  title={
                    isIncognito
                      ? 'Temporary mode is on for this conversation. Click to disable.'
                      : 'Make the current conversation temporary.'
                  }
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Incognito</span>
                </button>
              ) : null}
            </div>
          }

          {/* Textarea + Ghost-text overlay wrapper */}
          <div
            className={cn(
              'relative flex-1 basis-full order-1',
              emptyState ? 'min-h-[40px]' : 'min-h-[52px]',
            )}
          >
            <GhostTextOverlay
              inputText={message}
              suggestion={suggestion}
              isLoading={isSuggestionLoading}
            />

            <textarea
              ref={textareaRef}
              data-composer-textarea
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              disabled={isLoading || composerDisabled}
              className={cn(
                'relative z-10 max-h-[240px] w-full resize-none overflow-y-auto border-0 bg-transparent px-2 leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50',
                emptyState
                  ? 'min-h-[40px] py-1.5 text-[18px] md:text-[18px]'
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

          {/* Model selector — inline in the control row for BOTH the empty and
              docked states so it always sits beside the send button, ChatGPT-style. */}
          <ComposerFooter
            inline
            className="order-4 ml-auto"
            showModelSelector
            lockModelSelector={false}
            showStyleSelector={!isFreeTrial}
            onUpgradeRequest={onUpgradeRequest}
          />

          {/* Voice Input Button */}
          {!isFreeTrial && (
            <VoiceInputButton
              onTranscript={(text) => {
                setMessage((prev) => {
                  const separator = prev.trim() ? ' ' : '';
                  return prev + separator + text;
                });
                setTimeout(() => textareaRef.current?.focus(), 50);
              }}
              disabled={isLoading || composerDisabled}
              className="order-5"
            />
          )}

          {/* Send / Stop Button */}
          <SendButton
            mode={sendButtonMode}
            hasContent={hasContent}
            disabled={composerDisabled}
            onClick={sendButtonMode === 'stop' ? handleStop : handleSubmit}
            className="order-6"
          />
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          disabled={isFreeTrial}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            handleFileDrop(files);
            e.target.value = '';
          }}
          aria-label="Image upload"
        />
      </div>

      {/* Disclaimer · sits below the composer (outside the pill), ChatGPT/Claude-
          style. Replaces the in-pill 'Cmd+Enter to send' keyboard hint. */}
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        AGI can make mistakes. Check important info.
      </p>
    </div>
  );
};

/**
 * ChatComposerNew with memoization optimization.
 *
 * + menu matches Claude's structure:
 *   Add files/photos, Skills flyout, Connectors flyout, Web search toggle,
 *   Use style flyout.
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
    prev.attachmentPrivacyShortLabel === next.attachmentPrivacyShortLabel &&
    prev.onUpgradeRequest === next.onUpgradeRequest &&
    prev.freeTrial?.enabled === next.freeTrial?.enabled &&
    prev.freeTrial?.promptsUsed === next.freeTrial?.promptsUsed &&
    prev.freeTrial?.promptLimit === next.freeTrial?.promptLimit
  );
});

ChatComposerNew.displayName = 'ChatComposerNew';
