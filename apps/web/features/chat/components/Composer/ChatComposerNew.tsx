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
  ChevronDown,
  Check,
  Camera,
  Brain,
  EyeOff,
  ImagePlus,
  Image as ImageIcon,
  Terminal,
  Folder,
  FolderOpen,
  Telescope,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { ChatAIService, type SkillInfo } from '@features/chat/services/chat-ai-service';
import { ActiveModeTags, type ModeTag } from './ActiveModeTags';
import { SlashCommandMenu, type SlashCommandMenuHandle } from './SlashCommandMenu';
import { useSettingsModal } from '@features/settings/components/SettingsModalProvider';
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
import { EFFORT_LABEL, getModels } from '@agiworkforce/types';
import { providerSupportsWebSearch } from '@/lib/web-search-support';
import { useCapability } from '@agiworkforce/unified-chat';
import { useCoworkFolderStore, supportsDirectoryPicker } from '@shared/stores/cowork-folder-store';
import { useProjectStore } from '@features/projects';
import { useRouter } from 'next/navigation';

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
      /** Deep Research mode: server injects research system prompt and forces web search. */
      researchEnabled?: boolean;
      /** Output style hint forwarded to the LLM system prompt. undefined = 'normal'. */
      styleMode?: string;
      /** Resolved skill body injected as a system message in the LLM request. */
      skillBody?: string;
      /** Display name of the active skill, forwarded for timeline step labeling. */
      skillName?: string;
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
  /** Opens the upgrade plan dialog from locked model/usage upgrade affordances. */
  onUpgradeRequest?: () => void;
  /**
   * Called when the user submits in image-generation mode.
   * The composer clears its state regardless; the parent owns the async flow and
   * message injection.
   */
  onGenerateImage?: (
    prompt: string,
    options: { aspectRatio: ImageAspectRatio; modelId: string },
  ) => void;
  /** Website free trial state. When enabled, the composer is text-only Auto Economy. */
  freeTrial?: {
    enabled: boolean;
    promptsUsed: number | null;
    promptLimit: number;
  };
}

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

// ---------------------------------------------------------------------------
// Image mode types and constants
// ---------------------------------------------------------------------------

export type ImageAspectRatio = 'auto' | '1:1' | '3:4' | '9:16' | '4:3' | '16:9';

export interface ImageAspectOption {
  id: ImageAspectRatio;
  label: string;
  /** Maps to the /api/media/image/generate `size` enum. */
  size: '1024x1024' | '1024x1792' | '1792x1024';
}

export const IMAGE_ASPECT_OPTIONS: ImageAspectOption[] = [
  { id: 'auto', label: 'Auto', size: '1024x1024' },
  { id: '1:1', label: 'Square 1:1', size: '1024x1024' },
  { id: '3:4', label: 'Portrait 3:4', size: '1024x1792' },
  { id: '9:16', label: 'Story 9:16', size: '1024x1792' },
  { id: '4:3', label: 'Landscape 4:3', size: '1792x1024' },
  { id: '16:9', label: 'Widescreen 16:9', size: '1792x1024' },
];

export interface ImageModelOption {
  id: string;
  label: string;
  provider: 'google' | 'openai' | 'stability';
}

// Map the catalog's declarative `imageApi` backend → the provider enum the
// /api/media/image/generate route accepts. This is the ONLY place the two
// vocabularies meet; everything else is data. An image model with no imageApi
// (no route adapter, e.g. managed-cloud-only ideogram) is excluded from the picker.
const IMAGE_API_TO_PROVIDER: Record<string, ImageModelOption['provider']> = {
  gemini: 'google',
  imagen: 'google',
  openai: 'openai',
  stability: 'stability',
};

// Image-generation models for the in-composer picker, derived entirely from the
// canonical models.json catalog (single source of truth) — never hardcoded.
// Adding a new image model is a models.curation.json edit (set modelType:'image'
// + imageApi); it then shows up here and routes correctly with ZERO code change.
export const IMAGE_MODELS: ImageModelOption[] = getModels({ modelTypes: ['image'] })
  .map((m) => {
    const provider = m.imageApi ? IMAGE_API_TO_PROVIDER[m.imageApi] : undefined;
    return provider ? { id: m.id, label: m.name, provider } : null;
  })
  .filter((m): m is ImageModelOption => m !== null);

// Default = the first image model in catalog order (the founder controls the
// default purely by ordering models.curation.json — no id referenced in code).
const IMAGE_MODEL_DEFAULT = IMAGE_MODELS[0]?.id ?? '';

/** Toggle row used in the + menu for connected send options. */
function MenuToggleRow({
  icon: Icon,
  label,
  checked,
  onToggle,
  disabled,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Native tooltip — used to explain WHY a row is disabled (e.g. no search path). */
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={title}
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
  onGenerateImage,
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
  // Settings-modal opener for the plus-menu Skills/Connectors/Plugins entries
  // (founder directive 2026-07-10: entries open the modal pane, no inline lists).
  const { openSettings } = useSettingsModal();
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
  // Cowork folder — local-only; handle is never forwarded to any API route.
  const folderName = useCoworkFolderStore((s) => s.folderName);
  const pickFolder = useCoworkFolderStore((s) => s.pickFolder);
  const clearFolder = useCoworkFolderStore((s) => s.clearFolder);
  const canPickFolder = supportsDirectoryPicker();

  // Platform capabilities (PLATFORM axis — does this surface expose the action at
  // all). Sourced from the shared capability matrix via the CapabilityProvider;
  // never branch on `platform === 'desktop'` or probe browser APIs. These gate
  // RENDERING (absent on web), composing with the model/tier gates below.
  const canUseWorkingDirectory = useCapability('canUseWorkingDirectory');
  const canTakeScreenshotCap = useCapability('canTakeScreenshot');

  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [codeExecutionEnabled, setCodeExecutionEnabled] = useState(false);
  const [styleMode, setStyleMode] = useState<StyleMode>('normal');
  const [showStyleSubmenu, setShowStyleSubmenu] = useState(false);

  // claude.ai-parity work-mode toggle (Chat | AGI Work). Segmented pill sits
  // immediately right of the "+" in the composer bottom row. When 'agiwork', a
  // Project selector row renders BELOW the composer (web = projects only; the
  // local-folder variant is desktop-only). Kept in local state — the mode is a
  // composer affordance and does not change the send contract today.
  const [workMode, setWorkMode] = useState<'chat' | 'agiwork'>('chat');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const router = useRouter();
  // Real projects from the shared store (hydrated from /api/projects by the page).
  const projects = useProjectStore((s) => s.projects);
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const projectMenuRef = useRef<HTMLDivElement>(null);

  // Image generation mode state
  const [imageMode, setImageMode] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatio>('auto');
  const [imageModelId, setImageModelId] = useState<string>(IMAGE_MODEL_DEFAULT);
  const [showImageAspectMenu, setShowImageAspectMenu] = useState(false);
  const [showImageModelMenu, setShowImageModelMenu] = useState(false);

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
  const selectedModelMeta = getModelMetadata(composerSelectedModelId);
  const selectedModelCaps = selectedModelMeta?.capabilities;
  const modelSupportsVision = selectedModelCaps?.vision ?? false;
  // A model's catalog `search`/`research` flag is necessary but NOT sufficient: some
  // providers set search:true for models AGI does not yet wire a web-search path for
  // (xai/qwen/moonshot). Gate the toggles on BOTH the catalog capability AND the
  // provider actually executing search, so the toggle is never cosmetic (turning it
  // on then getting "I can't browse the internet"). anthropic/google/openai inject a
  // native tool; perplexity searches natively; managed_cloud (Auto) resolves
  // server-side to a search-capable model — see providerSupportsWebSearch.
  const providerCanWebSearch = providerSupportsWebSearch(selectedModelMeta?.provider);
  const modelSupportsSearch = (selectedModelCaps?.search ?? false) && providerCanWebSearch;
  // Deep Research is its own capability field in models.json, distinct from
  // plain web search - values diverge in both directions (e.g. claude-haiku-4.5
  // has search:true/research:false, gpt-5.5 has search:false/research:true).
  // Gating on modelSupportsSearch alone both wrongly exposes Research for
  // search-only models and wrongly blocks it for research-only models.
  // Deep Research forces web_search on server-side (applyResearchMode), so it needs
  // the same provider search path — gate it the same way to avoid a cosmetic toggle.
  const modelSupportsResearch = (selectedModelCaps?.research ?? false) && providerCanWebSearch;
  const modelSupportsThinkingCap = selectedModelCaps?.thinking ?? false;
  const modelSupportsCodeExecution = selectedModelCaps?.codeExecution ?? false;

  // If the user switches to a model that can't search, clear the web-search
  // toggle so it never stays "on" for an unsupported model.
  useEffect(() => {
    if (webSearchEnabled && !modelSupportsSearch) setWebSearchEnabled(false);
  }, [webSearchEnabled, modelSupportsSearch]);

  // Clear Research if the model loses research support.
  useEffect(() => {
    if (researchEnabled && !modelSupportsResearch) setResearchEnabled(false);
  }, [researchEnabled, modelSupportsResearch]);

  // If the user switches to a model that can't execute code, clear the toggle.
  useEffect(() => {
    if (codeExecutionEnabled && !modelSupportsCodeExecution) setCodeExecutionEnabled(false);
  }, [codeExecutionEnabled, modelSupportsCodeExecution]);

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
    // Web search / Deep Research / style are PERSISTENT toggles (claude.ai parity):
    // once on they stay on across sends (checkmark remains in the + menu) until the
    // user turns them off. Do NOT reset them here (the after-send clear) — that made
    // Web search a fire-once flag. They still auto-clear via the capability effects
    // above when the selected model can't support them, and via the free-trial reset.
    setShowStyleSubmenu(false);
    setActiveTags([]);
    setLocalNotice(null);
    clearSuggestion();
    setImageMode(false);
    setImageAspectRatio('auto');
    setImageModelId(IMAGE_MODEL_DEFAULT);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [clearAttachments, clearSuggestion]);

  useEffect(() => {
    if (!isFreeTrial) return;
    setSelectedSkill(null);
    setSkillBody(null);
    setWebSearchEnabled(false);
    setResearchEnabled(false);
    setStyleMode('normal');
    setShowOverflowMenu(false);
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

  // Handle prefillText prop · when the parent passes a new non-empty prefillText, copy it
  // into the local message and notify the parent it was consumed. This runs in an EFFECT,
  // not during render: onPrefillConsumed is a PARENT (WebChatPage) state setter, and calling
  // it during this component's render triggers React's "Cannot update a component while
  // rendering a different component" warning (the recurring dev-overlay "1 Issue").
  const [prevPrefill, setPrevPrefill] = useState(prefillText);
  useEffect(() => {
    if (prefillText && prefillText.length > 0 && prefillText !== prevPrefill) {
      setPrevPrefill(prefillText);
      setMessage(prefillText);
      onPrefillConsumed?.();
    }
  }, [prefillText, prevPrefill, onPrefillConsumed]);

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
        "The selected model can't read images. Switch to a vision model (e.g. Gemini 3.1 Flash Lite) to attach images.",
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

  // Close popover on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
        setShowStyleSubmenu(false);
      }
      if (mentionsRef.current && !mentionsRef.current.contains(e.target as Node)) {
        setShowMentions(false);
      }
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setShowProjectMenu(false);
      }
    }
    // The composer textarea's onKeyDown only fires while the textarea has focus; once the
    // "+" menu opens, focus moves into the popover, so Escape must be handled at the
    // document level to close the menu (otherwise it stays open until an outside click).
    function handleEscapeKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setShowOverflowMenu(false);
      setShowStyleSubmenu(false);
      setShowMentions(false);
      setShowProjectMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, []);

  const handleTagDismiss = useCallback((id: string) => {
    setActiveTags((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleWebSearchToggle = useCallback(() => {
    setWebSearchEnabled((prev) => !prev);
  }, []);

  const handleResearchToggle = useCallback(() => {
    setResearchEnabled((prev) => !prev);
  }, []);

  const handleCodeExecutionToggle = useCallback(() => {
    setCodeExecutionEnabled((prev) => !prev);
  }, []);

  const closeMenu = useCallback(() => {
    setShowOverflowMenu(false);
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

  const handleSubmit = useCallback(() => {
    if (!message.trim() && attachments.length === 0) return;
    if (isLoading || disabled) return;
    if (trialExhausted) {
      onUpgradeRequest?.();
      return;
    }

    // Image generation mode: delegate entirely to parent via onGenerateImage.
    if (imageMode) {
      const prompt = message.trim();
      if (!prompt) return;
      onGenerateImage?.(prompt, { aspectRatio: imageAspectRatio, modelId: imageModelId });
      clearComposerState();
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
        codeExecutionEnabled,
        researchEnabled,
        styleMode: styleMode !== 'normal' ? styleMode : undefined,
        skillBody: skillBody ?? undefined,
        skillName: selectedSkill?.name ?? undefined,
      },
    );

    if (result === false) return;
    clearComposerState();
  }, [
    message,
    attachments,
    selectedSkill,
    skillBody,
    isLoading,
    disabled,
    trialExhausted,
    isFreeTrial,
    onUpgradeRequest,
    imageMode,
    imageAspectRatio,
    imageModelId,
    onGenerateImage,
    agentMode,
    selectedFolderId,
    // web search / research / style toggles MUST be in the dep array: they are
    // read directly in the body, and omitting them (previous eslint-disable)
    // made handleSubmit close over STALE values — toggling "Web search" then
    // sending without another keystroke sent web_search:false, so the model
    // never searched and replied "I can't browse the web" (audit DEMO-BLOCKER).
    webSearchEnabled,
    researchEnabled,
    styleMode,
    thinkingEnabled,
    codeExecutionEnabled,
    onSend,
    clearComposerState,
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

      // Plain Enter sends; Shift+Enter inserts a newline (the ChatGPT/Claude chat
      // convention). Cmd/Ctrl+Enter also sends. Never submit while a picker owns
      // Enter (slash/mentions) or mid-IME-composition (e.g. CJK candidates).
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !e.nativeEvent.isComposing &&
        !showMentions &&
        !showSlashMenu
      ) {
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
      // Check the free-trial gate first so dropped files are never briefly
      // added and then silently stripped by the isFreeTrial cleanup effect
      // above (flash-then-vanish) - show a clear message instead.
      if (isFreeTrial) {
        setLocalNotice(
          'Attachments are not available on the free trial. Upgrade to attach photos & files.',
        );
        return;
      }
      if (!modelSupportsVision) {
        setLocalNotice(
          "The selected model can't read images. Switch to a vision model (e.g. Gemini 3.1 Flash Lite) to attach images.",
        );
        return;
      }
      addImageAttachments(files);
    },
    [addImageAttachments, modelSupportsVision, isFreeTrial],
  );

  // + button indicator: amber tint when any feature is active
  const hasOverflowActive =
    selectedSkill !== null ||
    webSearchEnabled ||
    researchEnabled ||
    codeExecutionEnabled ||
    styleMode !== 'normal';

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
            className="font-medium text-[var(--chat-accent-primary-text)] hover:underline"
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

      {/* Working Folder Chip — desktop-only capability; absent on web/mobile */}
      {canUseWorkingDirectory && folderName && (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
            <FolderOpen className="h-3 w-3 shrink-0" />
            {folderName}
            <button
              type="button"
              onClick={clearFolder}
              className="rounded-full p-0.5 hover:bg-amber-500/20"
              aria-label="Clear working folder"
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
            // Column layout: the textarea sits full-width on row 1, and the control
            // cluster below is a SINGLE flex-nowrap row so the Send button can never
            // drop to a second line. A previous flex-wrap+order layout wrapped inside
            // a conversation once the sidebar narrowed the column: flex-wrap breaks
            // lines on each item's CONTENT size, so min-w-0 alone can't stop it — only
            // flex-nowrap forces one line, while the min-w-0 chain lets the model
            // pill/hint shrink to fit within it.
            'flex flex-col gap-2 p-2 sm:p-3',
            emptyState && 'px-4 py-3 sm:px-5',
          )}
        >
          {/* Textarea + Ghost-text overlay wrapper — row 1, full width */}
          <div className={cn('relative w-full', emptyState ? 'min-h-[40px]' : 'min-h-[52px]')}>
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
              placeholder={imageMode ? 'Describe or edit an image' : placeholder}
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

          {/* Control cluster — row 2, a single non-wrapping line (flex-nowrap). */}
          <div className="flex min-w-0 flex-nowrap items-center gap-1 sm:gap-2">
            {/* + Overflow Menu Button */}
            <div className={cn('relative shrink-0')} ref={overflowRef}>
              <button
                onClick={() => {
                  const next = !showOverflowMenu;
                  setShowOverflowMenu(next);
                  if (!next) {
                    setShowStyleSubmenu(false);
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
                      {/* 0. Work mode (Chat | AGI Work) — shown in the menu ONLY below sm,
                        where the inline segmented toggle is hidden to free composer-row
                        width for the model selector. Keeps work-mode fully switchable on
                        the narrow (mobile) composer instead of dropping the control. */}
                      {!imageMode && (
                        <div className="sm:hidden">
                          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
                            <span className="flex-1 text-left text-sm">Mode</span>
                            <div className="flex items-center rounded-full border border-[var(--chat-glass-border)] bg-muted/40 p-0.5 text-xs font-medium">
                              {(['chat', 'agiwork'] as const).map((mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => setWorkMode(mode)}
                                  disabled={isLoading || composerDisabled}
                                  aria-pressed={workMode === mode}
                                  className={cn(
                                    'flex h-7 items-center rounded-full px-3 transition-colors',
                                    workMode === mode
                                      ? 'bg-background text-foreground shadow-sm'
                                      : 'text-muted-foreground hover:text-foreground',
                                    (isLoading || composerDisabled) &&
                                      'cursor-not-allowed opacity-50',
                                  )}
                                >
                                  {mode === 'chat' ? 'Chat' : 'AGI Work'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="my-1 border-t border-border/40" />
                        </div>
                      )}

                      {/* 1. Add photos */}
                      <button
                        type="button"
                        disabled={!modelSupportsVision || isFreeTrial}
                        onClick={() => {
                          fileInputRef.current?.click();
                          closeMenu();
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60',
                          (!modelSupportsVision || isFreeTrial) && 'cursor-not-allowed opacity-50',
                        )}
                        title={
                          isFreeTrial
                            ? 'Upgrade to attach photos & files'
                            : modelSupportsVision
                              ? undefined
                              : "This model can't read images"
                        }
                      >
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 text-left">Add photos &amp; files</span>
                      </button>

                      {/* 2. Create image */}
                      <button
                        type="button"
                        onClick={() => {
                          setImageMode(true);
                          closeMenu();
                          setTimeout(() => textareaRef.current?.focus(), 0);
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60',
                          imageMode && 'text-primary',
                        )}
                      >
                        <ImagePlus
                          className={cn(
                            'h-4 w-4',
                            imageMode ? 'text-primary' : 'text-muted-foreground',
                          )}
                        />
                        <span className="flex-1 text-left">Create image</span>
                      </button>

                      {/* 3. Take a screenshot — desktop-only capability. Render-gated
                        so it is ABSENT (not merely disabled) on web/mobile. */}
                      {canTakeScreenshotCap && (
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                        >
                          <Camera className="h-4 w-4" />
                          <span className="flex-1 text-left">Take a screenshot</span>
                        </button>
                      )}

                      {/* 4. Select working folder — desktop-only capability (local
                        File System Access). Render-gated: ABSENT on web/mobile.
                        The browser-API `canPickFolder` check is NOT the platform
                        gate; it only disables when the desktop browser lacks the
                        API. */}
                      {canUseWorkingDirectory && (
                        <button
                          type="button"
                          disabled={!canPickFolder}
                          title={
                            canPickFolder
                              ? folderName
                                ? `Working folder: ${folderName}`
                                : undefined
                              : 'Folder access is not supported in this browser'
                          }
                          onClick={() => {
                            pickFolder();
                            closeMenu();
                          }}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                            !canPickFolder && 'cursor-not-allowed opacity-50',
                            canPickFolder && folderName
                              ? 'text-amber-300 hover:bg-muted/60'
                              : 'hover:bg-muted/60',
                          )}
                        >
                          {folderName ? (
                            <FolderOpen className="h-4 w-4 shrink-0 text-amber-400" />
                          ) : (
                            <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="flex-1 text-left">
                            {folderName ? folderName : 'Add working folder'}
                          </span>
                          {folderName && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                clearFolder();
                              }}
                              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                              aria-label="Clear working folder"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                          {!canPickFolder && (
                            <span className="text-[10px] text-muted-foreground">Not supported</span>
                          )}
                        </button>
                      )}

                      {/* Divider */}
                      <div className="my-1 border-t border-border/30" />

                      {/* 5. Skills -- entry point that opens the settings modal at
                        the Skills pane (founder directive 2026-07-10: the plus-menu
                        holds ENTRIES, not inline lists — the lists live in the
                        settings modal). Per-message skill selection stays available
                        via the @mention dropdown in the textarea. */}
                      <button
                        type="button"
                        onClick={() => {
                          closeMenu();
                          openSettings('skills');
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

                      {/* 6. Connectors -- entry point that opens the settings modal
                        at the Connectors pane. An inline connect toggle here would
                        imply a mid-chat capability that does not exist (per-
                        conversation connector enablement has no runtime backing),
                        so the honest surface is the settings pane — no fake
                        toggles, no inline list. */}
                      <button
                        type="button"
                        onClick={() => {
                          closeMenu();
                          openSettings('connectors');
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

                      {/* 7. Plugins -- entry point that opens the settings modal at
                        the Plugins pane. */}
                      <button
                        type="button"
                        onClick={() => {
                          closeMenu();
                          openSettings('plugins');
                        }}
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
                      </button>

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
                        title={
                          !modelSupportsSearch
                            ? "Web search isn't available for this model. Switch to Claude, Gemini, or an Auto mode."
                            : undefined
                        }
                      />

                      {/* 8a. Deep Research toggle */}
                      <MenuToggleRow
                        icon={Telescope}
                        label="Deep Research"
                        checked={researchEnabled}
                        onToggle={() => {
                          handleResearchToggle();
                          closeMenu();
                        }}
                        disabled={isLoading || disabled || !modelSupportsResearch}
                        title={
                          !modelSupportsResearch
                            ? "Deep Research isn't available for this model. Switch to Claude, Gemini, or an Auto mode."
                            : undefined
                        }
                      />

                      {/* 8b. Code execution toggle */}
                      <MenuToggleRow
                        icon={Terminal}
                        label="Run code"
                        checked={codeExecutionEnabled}
                        onToggle={() => {
                          handleCodeExecutionToggle();
                          closeMenu();
                        }}
                        disabled={isLoading || disabled || !modelSupportsCodeExecution}
                      />

                      {/* 8c. Extended thinking — enables thinking effort. Cycling the
                        effort level lives in the model picker; here it's a simple
                        on affordance so the control is not lost from the input row. */}
                      <MenuToggleRow
                        icon={Brain}
                        label={
                          thinkingEnabled
                            ? `Extended thinking · ${EFFORT_LABEL[thinkingEffort]}`
                            : 'Extended thinking'
                        }
                        checked={thinkingEnabled}
                        onToggle={() => {
                          handleThinkingClick();
                          closeMenu();
                        }}
                        disabled={isLoading || disabled || !modelSupportsThinkingCap}
                      />

                      {/* 8d. Incognito / temporary chat toggle */}
                      {activeConversationId && (
                        <MenuToggleRow
                          icon={EyeOff}
                          label="Temporary chat"
                          checked={isIncognito}
                          onToggle={() => {
                            handleIncognitoToggle();
                            closeMenu();
                          }}
                          disabled={!canToggleIncognito}
                        />
                      )}

                      {/* 9. Use style -- right flyout */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            setShowStyleSubmenu((prev) => !prev);
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
                              : (STYLE_OPTIONS.find((s) => s.id === styleMode)?.label ??
                                'Use style')}
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

            {/* Work-mode segmented toggle (Chat | AGI Work) — claude.ai parity.
              Sits immediately right of the "+" button. All the old always-present
              tool "pills" (Search / Research / Run code / Think / Incognito) moved
              INTO the + menu, so the composer bottom row stays a SINGLE
              non-wrapping line at every width (fixes the Send-button-drops-to-a-
              second-line overflow bug).
              NARROW WIDTHS: this ~135px toggle is `hidden ... sm:flex`, so below sm
              (mobile, 375/320px) it is relocated into the + menu (see the "Mode" row
              above). At those widths the toggle + style + model + mic + send cannot
              coexist on one row, so — like claude.ai's mobile composer — the toggle and
              style drop out of the row, leaving the model selector visible, tappable,
              and clear of Send. */}
            {!imageMode && (
              <div className="hidden shrink-0 items-center rounded-full border border-[var(--chat-glass-border)] bg-muted/40 p-0.5 text-xs font-medium sm:flex">
                {(['chat', 'agiwork'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setWorkMode(mode)}
                    disabled={isLoading || composerDisabled}
                    aria-pressed={workMode === mode}
                    className={cn(
                      'flex h-7 items-center rounded-full px-3 transition-colors',
                      workMode === mode
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                      (isLoading || composerDisabled) && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    {mode === 'chat' ? 'Chat' : 'AGI Work'}
                  </button>
                ))}
              </div>
            )}

            {/* Image-mode pills (only when the user is generating an image). */}
            {imageMode && (
              <div className={cn('flex shrink-0 items-center gap-1')}>
                {/* Image pill: click to exit image mode */}
                <button
                  type="button"
                  onClick={() => {
                    setImageMode(false);
                    setImageAspectRatio('auto');
                    setImageModelId(IMAGE_MODEL_DEFAULT);
                  }}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-primary/15 px-2.5 text-xs font-medium text-primary ring-1 ring-primary/30 transition-all hover:bg-primary/25"
                  aria-label="Exit image generation mode"
                  title="Click to exit image generation mode"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>Image</span>
                  <X className="h-3 w-3 opacity-60" />
                </button>

                {/* Aspect ratio selector */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowImageAspectMenu((p) => !p);
                      setShowImageModelMenu(false);
                    }}
                    className="flex h-8 items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground"
                    aria-label="Select aspect ratio"
                  >
                    {IMAGE_ASPECT_OPTIONS.find((o) => o.id === imageAspectRatio)?.label ?? 'Auto'}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {showImageAspectMenu && (
                    <div className="absolute bottom-full left-0 z-50 mb-1 w-44 rounded-xl border border-border/60 bg-popover/95 p-1 shadow-xl backdrop-blur-xl">
                      {IMAGE_ASPECT_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setImageAspectRatio(opt.id);
                            setShowImageAspectMenu(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors',
                            imageAspectRatio === opt.id
                              ? 'bg-primary/10 text-primary'
                              : 'hover:bg-muted/60',
                          )}
                        >
                          <span className="flex-1 text-left">{opt.label}</span>
                          {imageAspectRatio === opt.id && (
                            <Check className="h-3 w-3 shrink-0 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Model selector. In normal mode the full ComposerFooter sits inline beside
              the send button. In image mode the image-model picker takes its place —
              both use `ml-auto` so they right-align and push the mic + send to the
              right edge of the toolbar. In the flex-nowrap control row the footer is
              the only shrinkable item (min-w-0), so it truncates instead of wrapping. */}
            {!imageMode && (
              <ComposerFooter
                inline
                className="ml-auto min-w-0"
                showModelSelector
                lockModelSelector={false}
                showStyleSelector={!isFreeTrial}
                onUpgradeRequest={onUpgradeRequest}
              />
            )}

            {imageMode && (
              <div className="relative ml-auto shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowImageModelMenu((p) => !p);
                    setShowImageAspectMenu(false);
                  }}
                  className="flex h-8 items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground"
                  aria-label="Select image model"
                >
                  <span className="max-w-[120px] truncate">
                    {IMAGE_MODELS.find((m) => m.id === imageModelId)?.label ??
                      'Gemini 3.1 Flash Image'}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
                {showImageModelMenu && (
                  <div className="absolute bottom-full right-0 z-50 mb-1 w-52 rounded-xl border border-border/60 bg-popover/95 p-1 shadow-xl backdrop-blur-xl">
                    {IMAGE_MODELS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setImageModelId(m.id);
                          setShowImageModelMenu(false);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors',
                          imageModelId === m.id
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted/60',
                        )}
                      >
                        <span className="flex-1 text-left">{m.label}</span>
                        {imageModelId === m.id && (
                          <Check className="h-3 w-3 shrink-0 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Voice Input Button - always rendered (like Search/Research) so free-trial
              users see a visible-disabled control with a tooltip instead of the mic
              disappearing from the DOM. */}
            <div
              className="relative shrink-0"
              title={isFreeTrial ? 'Upgrade to use voice input' : undefined}
            >
              <VoiceInputButton
                onTranscript={(text) => {
                  setMessage((prev) => {
                    const separator = prev.trim() ? ' ' : '';
                    return prev + separator + text;
                  });
                  setTimeout(() => textareaRef.current?.focus(), 50);
                }}
                disabled={isLoading || composerDisabled || isFreeTrial}
              />
            </div>

            {/* Send / Stop Button */}
            <SendButton
              mode={sendButtonMode}
              hasContent={hasContent}
              disabled={composerDisabled}
              onClick={sendButtonMode === 'stop' ? handleStop : handleSubmit}
              className="shrink-0"
            />
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          disabled={!modelSupportsVision || isFreeTrial}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            handleFileDrop(files);
            e.target.value = '';
          }}
          aria-label="Image upload"
        />
      </div>

      {/* AGI Work project selector row — claude.ai Cowork "Project ⌄" parity.
          Renders BELOW the composer when the work-mode toggle is 'agiwork'. On
          web this lists the user's real Projects (from the shared project store,
          hydrated from /api/projects). The local-folder variant is desktop-only.
          NOTE: attaching the chosen project to the created conversation is a
          server follow-up (createConversation does not yet accept projectId — see
          WebChatPage). Today this selects/º navigates to the project context. */}
      {workMode === 'agiwork' && !isFreeTrial && (
        <div className="relative mt-2 flex items-center gap-2" ref={projectMenuRef}>
          <span className="text-xs text-muted-foreground">Project</span>
          <button
            type="button"
            onClick={() => setShowProjectMenu((v) => !v)}
            className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-[var(--chat-glass-border)] bg-muted/40 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60"
            aria-haspopup="listbox"
            aria-expanded={showProjectMenu}
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="max-w-[200px] truncate">
              {selectedProject ? selectedProject.name : 'Choose a project'}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          </button>
          {selectedProject && (
            <button
              type="button"
              onClick={() => setSelectedProjectId(null)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear selected project"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {showProjectMenu && (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border/60 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
              <input
                type="text"
                value={projectQuery}
                onChange={(e) => setProjectQuery(e.target.value)}
                placeholder="Search projects"
                className="mb-1.5 w-full rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-[var(--chat-accent-primary)]/40"
                aria-label="Search projects"
              />
              <div className="max-h-56 overflow-y-auto">
                {projects
                  .filter((p) => p.name.toLowerCase().includes(projectQuery.toLowerCase()))
                  .slice(0, 20)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setShowProjectMenu(false);
                        setProjectQuery('');
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors',
                        selectedProjectId === p.id
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted/60',
                      )}
                    >
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{p.name}</span>
                      {selectedProjectId === p.id && (
                        <Check className="h-3 w-3 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                {projects.filter((p) => p.name.toLowerCase().includes(projectQuery.toLowerCase()))
                  .length === 0 && (
                  <p className="px-2.5 py-2 text-xs text-muted-foreground">No projects found.</p>
                )}
              </div>
              <div className="my-1 border-t border-border/30" />
              <button
                type="button"
                onClick={() => {
                  setShowProjectMenu(false);
                  router.push('/projects?new=1');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/60"
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1">Create new project</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowProjectMenu(false);
                  router.push('/projects');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/60"
              >
                <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1">View all projects</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Disclaimer · sits below the composer (outside the pill), ChatGPT/Claude-
          style. No persistent keyboard-send hint is shown (matches claude.ai; founder
          directive) — plain-Enter/Cmd+Enter send is handled in the textarea keydown. */}
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
 *   Add files/photos; Skills / Connectors / Plugins entries that open the
 *   settings modal at their pane (no inline lists); Web search toggle;
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
