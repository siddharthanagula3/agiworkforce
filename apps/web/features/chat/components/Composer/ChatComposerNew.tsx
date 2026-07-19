'use client';

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  Plus,
  X,
  Clock,
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
  FileText,
  Terminal,
  Folder,
  FolderOpen,
  Telescope,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { ActiveModeTags, type ModeTag } from './ActiveModeTags';
import { SlashCommandMenu, type SlashCommandMenuHandle } from './SlashCommandMenu';
import { useSettingsModal } from '@features/settings/components/SettingsModalProvider';
import { SendButton } from './SendButton';
import { ComposerFooter } from './ComposerFooter';
import { DragDropOverlay } from './DragDropOverlay';
import { VoiceInputButton } from './VoiceInputButton';
import { AttachmentPreview } from './AttachmentPreview';
import { useAttachments } from '@features/chat/hooks/use-attachments';
import { useSkillsList, type SkillItem } from '@features/chat/hooks/use-skills-list';
import { useChatStore } from '@shared/stores/chat-store';
import { useModelStore } from '@shared/stores/model-store';
import {
  getAllowedAutoModesForTier,
  getModelMetadata,
  getSelectableModels,
  isModelAllowedForTier,
  isAutoModeModelId,
} from '@shared/config/llm';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { useRouter } from 'next/navigation';
import { EFFORT_LABEL, getModels, type CloudWorkMode } from '@agiworkforce/types';
import { isWebSearchAvailable, providerSupportsWebSearch } from '@/lib/web-search-support';
import { useCapability } from '@agiworkforce/unified-chat';
import { useCoworkFolderStore, supportsDirectoryPicker } from '@shared/stores/cowork-folder-store';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';

/** Composer work mode — claude.ai Chat/Cowork parity ("AGI Work" here). */
export type ComposerWorkMode = CloudWorkMode;

interface ChatComposerProps {
  onSend: (
    content: string,
    attachments?: File[],
    skillId?: string,
    meta?: {
      /** Active mode at send time. 'agiwork' = project-scoped work chat. */
      workMode: ComposerWorkMode;
      /** Project scoping the send (threads into conversation creation). */
      projectId: string | null;
      webSearchEnabled?: boolean;
      thinkingEnabled?: boolean;
      codeExecutionEnabled?: boolean;
      officeCreationEnabled?: boolean;
      /** Deep Research mode: server injects research system prompt and forces web search. */
      researchEnabled?: boolean;
      /** Output style hint forwarded to the LLM system prompt. undefined = 'normal'. */
      styleMode?: string;
      /** Exact server-catalog skill name; the server resolves and loads its body. */
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
  /** Called when the user clicks the stop button. */
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
  /** Website free-plan state. The server owns the unpublished usage ceiling. */
  freeTrial?: {
    enabled: boolean;
    limitReached: boolean;
  };
  /**
   * "Project or folder" picker (Claude-composer parity). Provided only by hosts
   * with real project data for a NEW chat (web /chat empty state). Selecting a
   * project scopes the next created conversation (the host threads it into
   * createConversation → POST projectId). On working-directory-capable surfaces
   * (desktop) the same picker also offers a local folder; a chat is scoped to a
   * project OR a folder, never both. Absent prop = no picker rendered.
   */
  projectPicker?: ComposerProjectPicker;
}

export interface ComposerProjectPicker {
  /** Real projects from the host's project store (id + display name). */
  projects: Array<{ id: string; name: string }>;
  activeProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onCreateProject: () => void;
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
// route adapter is excluded from the picker.
const IMAGE_API_TO_PROVIDER: Record<string, ImageModelOption['provider']> = {
  gemini: 'google',
  imagen: 'google',
  openai: 'openai',
  stability: 'stability',
};

// Image-generation models for the in-composer picker, derived entirely from the
// canonical models.json catalog (single source of truth) — never hardcoded.
// Adding a new image model is a model-registry curation edit (set modelType:'image'
// + imageApi); it then shows up here and routes correctly with ZERO code change.
export const IMAGE_MODELS: ImageModelOption[] = getModels({ modelTypes: ['image'] })
  .map((m) => {
    const provider = m.imageApi ? IMAGE_API_TO_PROVIDER[m.imageApi] : undefined;
    return provider ? { id: m.id, label: m.name, provider } : null;
  })
  .filter((m): m is ImageModelOption => m !== null);

// Default = the first image model in catalog order (the founder controls the
// default purely by ordering the curation file — no id referenced in code).
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
  placeholder = 'Ask anything. Type / for commands',
  disabled = false,
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
  projectPicker,
}: ChatComposerProps) => {
  const [message, setMessage] = useState('');
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  // Follow-up queue (claude.ai / ChatGPT parity): a message composed while the
  // current turn is still streaming is captured here and auto-sent when the turn
  // finishes, so the user never has to wait or manually re-send. Snapshotting the
  // exact onSend arguments (incl. the toggle/skill/project meta) at queue time
  // avoids sending with stale options if the user changes a toggle afterward.
  const pendingQueueRef = useRef<Parameters<typeof onSend> | null>(null);
  const wasLoadingRef = useRef(false);
  const [queuedPreview, setQueuedPreview] = useState<string | null>(null);
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
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);
  const { skills: availableSkills, loading: skillsLoading, error: skillsError } = useSkillsList();
  const [activeTags, setActiveTags] = useState<ModeTag[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  // Cowork folder — local-only; handle is never forwarded to any API route.
  const folderName = useCoworkFolderStore((s) => s.folderName);
  const pickFolder = useCoworkFolderStore((s) => s.pickFolder);
  const clearFolder = useCoworkFolderStore((s) => s.clearFolder);
  const canPickFolder = supportsDirectoryPicker();
  const router = useRouter();
  const isFreeTrial = freeTrial?.enabled ?? false;

  // Work-mode segmented toggle (Chat | AGI Work) — claude.ai Chat/Cowork
  // parity. 'agiwork' reveals the "Project or folder" picker row BELOW the
  // composer and stamps workMode + projectId into the send meta; both are
  // backed (conversation project_id persistence + server-side project-context
  // injection), so the toggle is a real product mode, not a decorative tab.
  // Rendered only when the host passes projectPicker (real project data).
  const [workMode, setWorkMode] = useState<ComposerWorkMode>('chat');

  // "Project or folder" picker state (rendered only when the host passes
  // projectPicker — see the prop doc). The project selection lives in the
  // host's store; only the open/search UI state is local.
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');

  // Entering with a preselected project (sidebar "New chat in project" /
  // project-page handoff → ?projectId= → host store) lands paid accounts in
  // AGI Work. Free accounts keep ordinary project-scoped chat; Cowork/AGI Work
  // remains paid even though Free includes up to five Projects.
  const pickerActiveProjectId = projectPicker?.activeProjectId ?? null;
  useEffect(() => {
    if (isFreeTrial) {
      setWorkMode('chat');
    } else if (pickerActiveProjectId) {
      setWorkMode('agiwork');
    }
  }, [isFreeTrial, pickerActiveProjectId]);

  // Platform capabilities (PLATFORM axis — does this surface expose the action at
  // all). Sourced from the shared capability matrix via the CapabilityProvider;
  // never branch on `platform === 'desktop'` or probe browser APIs. These gate
  // RENDERING (absent on web), composing with the model/tier gates below.
  const canUseWorkingDirectory = useCapability('canUseWorkingDirectory');
  const canTakeScreenshotCap = useCapability('canTakeScreenshot');

  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [codeExecutionEnabled, setCodeExecutionEnabled] = useState(false);
  const [officeCreationEnabled, setOfficeCreationEnabled] = useState(false);
  const [styleMode, setStyleMode] = useState<StyleMode>('normal');
  const [showStyleSubmenu, setShowStyleSubmenu] = useState(false);

  // Image generation mode state
  const [imageMode, setImageMode] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatio>('auto');
  const [imageModelId, setImageModelId] = useState<string>(IMAGE_MODEL_DEFAULT);
  const [showImageAspectMenu, setShowImageAspectMenu] = useState(false);
  const [showImageModelMenu, setShowImageModelMenu] = useState(false);
  const [showCompatibleModels, setShowCompatibleModels] = useState(false);

  const trialExhausted = isFreeTrial && (freeTrial?.limitReached ?? false);

  // Capability gating: enable/disable composer affordances based on the SELECTED
  // model's capabilities so a user never sends an input the model can't handle
  // (e.g. an image to a text-only model, or web search to a no-search model).
  const composerSelectedModelId = useModelStore((s) => s.selectedModelId);
  const setComposerSelectedModelId = useModelStore((s) => s.setSelectedModelId);
  const subscriptionTier = useBillingStore((s) => s.subscription?.tier ?? 'free');
  const selectedModelMeta = getModelMetadata(composerSelectedModelId);
  const selectedModelCaps = selectedModelMeta?.capabilities;
  const modelSupportsVision = selectedModelCaps?.vision ?? false;
  const modelCanAcceptImages = isAutoModeModelId(composerSelectedModelId) || modelSupportsVision;
  const hasImageAttachments = attachments.some((file) => file.type.startsWith('image/'));
  const hasAttachmentConflict = hasImageAttachments && !modelCanAcceptImages;
  const compatibleModels = getSelectableModels().filter(
    (model) =>
      model.capabilities.vision &&
      (isFreeTrial || subscriptionTier === 'free'
        ? FREE_TRIAL_MODELS.includes(model.id)
        : isModelAllowedForTier(model.id, subscriptionTier)),
  );
  // Plain search can use either a provider-native path or AGI's generic
  // function-tool fallback. `/api/me` exposes only whether that fallback is
  // configured; the shared helper combines it with the selected model's real
  // native-search/tool capabilities so Web/Desktop/Mobile cannot drift.
  const providerCanWebSearch = providerSupportsWebSearch(selectedModelMeta?.provider);
  const genericWebSearchConfigured = useBillingStore(
    (s) => s.featureFlags?.generic_web_search ?? false,
  );
  const modelSupportsSearch = isWebSearchAvailable({
    provider: selectedModelMeta?.provider,
    modelSupportsNativeSearch: selectedModelCaps?.search,
    modelSupportsTools: selectedModelCaps?.tools,
    genericBackendConfigured: genericWebSearchConfigured,
  });
  // Deep Research is its own capability field in models.json, distinct from
  // plain web search. Current Claude Haiku 4.5, for example, has
  // search:true/research:false, so the two controls cannot share one flag.
  // Gating on modelSupportsSearch alone both wrongly exposes Research for
  // search-only models and wrongly blocks it for research-only models.
  // Deep Research forces web_search on server-side (applyResearchMode), so it needs
  // the same provider search path — gate it the same way to avoid a cosmetic toggle.
  const modelSupportsResearch = (selectedModelCaps?.research ?? false) && providerCanWebSearch;
  const modelSupportsThinkingCap = selectedModelCaps?.thinking ?? false;
  // Same both-signals rule as web search above: the catalog capability is
  // necessary but not sufficient. Native-tier providers (anthropic/google/
  // openai) run code on their own provider-hosted interpreter, so the catalog
  // flag alone is enough for them. Everyone else executes via E2B, which the
  // server only offers when the deployment's cut-over flag is on
  // (AGI_E2B_EXECUTION=1, surfaced via /api/me feature_flags.code_execution) —
  // gate those on BOTH signals so the "Run code" toggle is never a cosmetic
  // dead control. The server's real gate is the inline check in
  // request-processor.ts (~line 1239, `resolvedModelCaps?.codeExecution ?? true`);
  // that check is deliberately MORE permissive than this one for models absent
  // from the catalog (defaults to allowed, so a missing catalog entry never
  // silently drops the tool), so this is not a byte-for-byte mirror — this
  // client-side gate stays conservative (defaults to unavailable) so the
  // toggle is never rendered as a control the model may not actually honor.
  // Mirrored exactly by packages/ui/unified-chat/src/lib/codeExecutionAvailability.ts
  // (desktop/mobile), which shares this file's 3-signal formula.
  const deploymentCodeExecution = useBillingStore((s) => s.featureFlags?.code_execution ?? false);
  const providerHasNativeCodeExecution = ['anthropic', 'google', 'openai'].includes(
    (selectedModelMeta?.provider ?? '').toLowerCase(),
  );
  const modelSupportsCodeExecution =
    (selectedModelCaps?.codeExecution ?? false) &&
    (providerHasNativeCodeExecution || deploymentCodeExecution);
  const modelSupportsOfficeCreation = selectedModelCaps?.tools ?? false;

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

  useEffect(() => {
    if (officeCreationEnabled && !modelSupportsOfficeCreation) setOfficeCreationEnabled(false);
  }, [officeCreationEnabled, modelSupportsOfficeCreation]);

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
  const projectPickerRef = useRef<HTMLDivElement>(null);
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

  const clearComposerState = useCallback(() => {
    setMessage('');
    clearAttachments();
    setSelectedSkill(null);
    // Web search / Deep Research / style are PERSISTENT toggles (claude.ai parity):
    // once on they stay on across sends (checkmark remains in the + menu) until the
    // user turns them off. Do NOT reset them here (the after-send clear) — that made
    // Web search a fire-once flag. They still auto-clear via the capability effects
    // above when the selected model can't support them.
    setShowStyleSubmenu(false);
    setActiveTags([]);
    setLocalNotice(null);
    setImageMode(false);
    setImageAspectRatio('auto');
    setImageModelId(IMAGE_MODEL_DEFAULT);
    setShowCompatibleModels(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [clearAttachments]);

  useEffect(() => {
    if (!isFreeTrial) return;
    setResearchEnabled(false);
  }, [isFreeTrial]);

  useEffect(() => {
    if (clearSignal === undefined || clearSignal === lastClearSignalRef.current) return;
    lastClearSignalRef.current = clearSignal;
    clearComposerState();
  }, [clearComposerState, clearSignal]);

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

  const handleFileDrop = useCallback(
    (files: File[]) => {
      // Validate the file kind before model capability. A rejected executable,
      // PDF, or other unsupported file must never be described as an image the
      // selected model cannot read.
      const hasImage = files.some((file) => file.type.startsWith('image/'));
      if (!hasImage) {
        addImageAttachments(files);
        return;
      }

      addImageAttachments(files);
    },
    [addImageAttachments],
  );

  // Handle droppedFiles prop · same derived-state-from-props pattern as prefillText.
  // When the parent passes files dropped onto the message area, feed them into the
  // attachment hook and notify the parent so it can clear the pending state.
  // This is an effect, not a render-time state update: render-phase updates can
  // loop under concurrent React and produced act warnings in every unit test.
  const lastDroppedFilesRef = useRef<File[] | null>(null);
  useEffect(() => {
    if (
      !droppedFiles ||
      droppedFiles.length === 0 ||
      droppedFiles === lastDroppedFilesRef.current
    ) {
      return;
    }
    lastDroppedFilesRef.current = droppedFiles;
    handleFileDrop(droppedFiles);
    onDroppedFilesConsumed?.();
  }, [droppedFiles, handleFileDrop, onDroppedFilesConsumed]);

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
      if (projectPickerRef.current && !projectPickerRef.current.contains(e.target as Node)) {
        setShowProjectPicker(false);
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
      setShowProjectPicker(false);
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

  const handleOfficeCreationToggle = useCallback(() => {
    setOfficeCreationEnabled((prev) => !prev);
  }, []);

  const closeMenu = useCallback(() => {
    setShowOverflowMenu(false);
    setShowStyleSubmenu(false);
  }, []);

  // ---------------------------------------------------------------------------
  // "Project or folder" picker — derived state and handlers
  // ---------------------------------------------------------------------------
  const activePickerProject = projectPicker
    ? (projectPicker.projects.find((p) => p.id === projectPicker.activeProjectId) ?? null)
    : null;
  // The folder half of the chip label only exists on working-directory surfaces;
  // on web the cowork folder store is never populated through this control.
  const pickerFolderName = !isFreeTrial && canUseWorkingDirectory ? folderName : null;
  const pickerHasSelection = Boolean(activePickerProject || pickerFolderName);
  const pickerLabel = activePickerProject?.name ?? pickerFolderName ?? 'Project or folder';
  const filteredPickerProjects = projectPicker
    ? projectPicker.projects.filter((p) =>
        p.name.toLowerCase().includes(projectQuery.trim().toLowerCase()),
      )
    : [];

  const closeProjectPicker = useCallback(() => {
    setShowProjectPicker(false);
    setProjectQuery('');
  }, []);

  const handlePickProject = useCallback(
    (projectId: string) => {
      projectPicker?.onSelectProject(projectId);
      // A chat is scoped to a project OR a local folder, never both.
      clearFolder();
      closeProjectPicker();
    },
    [projectPicker, clearFolder, closeProjectPicker],
  );

  const handleClearPickerSelection = useCallback(() => {
    projectPicker?.onSelectProject(null);
    clearFolder();
  }, [projectPicker, clearFolder]);

  const handlePickFolderFromPicker = useCallback(() => {
    closeProjectPicker();
    void pickFolder().then(() => {
      // Only displace the project selection when a folder was actually chosen
      // (pickFolder resolves without setting state if the user cancels).
      if (useCoworkFolderStore.getState().folderName) {
        projectPicker?.onSelectProject(null);
      }
    });
  }, [closeProjectPicker, pickFolder, projectPicker]);

  // Switching back to Chat clears the scope selection: what the chip shows is
  // exactly what the next send carries — no hidden project sticking to a
  // "Chat"-labeled composer.
  const handleWorkModeChange = useCallback(
    (mode: ComposerWorkMode) => {
      setWorkMode(mode);
      if (mode === 'chat') {
        projectPicker?.onSelectProject(null);
        clearFolder();
        closeProjectPicker();
      }
    },
    [projectPicker, clearFolder, closeProjectPicker],
  );

  // Handle input change: detect @mention and /command.
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
        skill.description.toLowerCase().includes(mentionQuery.toLowerCase()),
    )
    .slice(0, 12);

  const handleMentionSelect = useCallback(
    (skill: SkillItem) => {
      if (mentionStartIndex === -1) return;
      const before = message.substring(0, mentionStartIndex);
      const cursorPos = textareaRef.current?.selectionStart || message.length;
      const after = message.substring(cursorPos);
      const newMessage = `${before}@${skill.name} ${after}`;
      setMessage(newMessage);
      setSelectedSkill(skill);
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

  const handleSkillSelect = useCallback(
    (skillName: string) => {
      const skill = availableSkills.find((candidate) => candidate.name === skillName);
      if (!skill) return;
      setSelectedSkill(skill);
      setMessage('');
      setShowSlashMenu(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [availableSkills],
  );

  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  const handleSubmit = useCallback(() => {
    if (!message.trim() && attachments.length === 0) return;
    if (disabled) return;
    if (hasAttachmentConflict) return;
    if (trialExhausted) {
      onUpgradeRequest?.();
      return;
    }

    // Image generation mode: delegate entirely to parent via onGenerateImage.
    // Image generation is not part of the streaming chat turn, so it is not
    // queued — it simply waits until the current turn is idle.
    if (imageMode) {
      if (isLoading) return;
      const prompt = message.trim();
      if (!prompt) return;
      onGenerateImage?.(prompt, { aspectRatio: imageAspectRatio, modelId: imageModelId });
      clearComposerState();
      return;
    }

    const sendArgs: Parameters<typeof onSend> = [
      message,
      attachments.length > 0 ? attachments : undefined,
      selectedSkill?.name,
      {
        workMode: isFreeTrial ? 'chat' : workMode,
        projectId: pickerActiveProjectId,
        webSearchEnabled,
        thinkingEnabled,
        codeExecutionEnabled,
        officeCreationEnabled,
        researchEnabled,
        styleMode: styleMode !== 'normal' ? styleMode : undefined,
        skillName: selectedSkill?.name ?? undefined,
      },
    ];

    // Follow-up while the current turn is still streaming: queue this message and
    // flush it when the turn finishes (see the isLoading-transition effect below).
    // Only the latest queued message is kept. This is the honest counterpart to the
    // server's per-conversation concurrency guard — the client never fires a second
    // concurrent turn; it waits for the first to settle.
    if (isLoading) {
      pendingQueueRef.current = sendArgs;
      setQueuedPreview(message.trim() || 'Attachment');
      clearComposerState();
      return;
    }

    const result = onSend(...sendArgs);

    if (result === false) return;
    clearComposerState();
  }, [
    message,
    attachments,
    selectedSkill,
    isLoading,
    disabled,
    hasAttachmentConflict,
    trialExhausted,
    onUpgradeRequest,
    imageMode,
    imageAspectRatio,
    imageModelId,
    onGenerateImage,
    workMode,
    isFreeTrial,
    pickerActiveProjectId,
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
    officeCreationEnabled,
    onSend,
    clearComposerState,
  ]);

  // Flush a queued follow-up when the streaming turn finishes (isLoading true→false).
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading) {
      const pending = pendingQueueRef.current;
      if (pending) {
        pendingQueueRef.current = null;
        setQueuedPreview(null);
        onSend(...pending);
      }
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, onSend]);

  const cancelQueuedMessage = useCallback(() => {
    pendingQueueRef.current = null;
    setQueuedPreview(null);
  }, []);

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
      }
    },
    [handleSubmit, showMentions, showSlashMenu],
  );

  const hasContent = Boolean(message.trim() || attachments.length > 0);
  const composerDisabled = disabled || trialExhausted;

  /**
   * Derive the SendButton mode. While a turn streams the button always offers
   * 'stop' (Stop stays reachable); a follow-up composed during streaming is
   * queued via Enter and shown as a pending chip, then auto-sent on completion
   * (see handleSubmit + the flush effect above) — so the button never needs a
   * separate 'queue' state, which would have hidden Stop.
   */
  const sendButtonMode = isLoading ? 'stop' : 'send';

  // + button indicator: amber tint when any feature is active
  const hasOverflowActive =
    selectedSkill !== null ||
    webSearchEnabled ||
    researchEnabled ||
    codeExecutionEnabled ||
    officeCreationEnabled ||
    styleMode !== 'normal';

  return (
    <div className="relative w-full pb-4 sticky bottom-0 z-20 bg-background/95 backdrop-blur-sm md:static md:bg-transparent md:backdrop-blur-none">
      <DragDropOverlay onDrop={handleFileDrop} />

      {localNotice && (
        <div
          role="alert"
          className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
        >
          {localNotice}
        </div>
      )}

      {queuedPreview && (
        <div
          className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
          data-testid="queued-followup"
        >
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            Queued · sends when the current response finishes: {queuedPreview}
          </span>
          <button
            type="button"
            onClick={cancelQueuedMessage}
            className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Cancel queued message"
          >
            Cancel
          </button>
        </div>
      )}

      {trialExhausted && (
        <div
          role="alert"
          className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
        >
          <span>Free usage limit reached. Upgrade to continue.</span>
          <button
            type="button"
            onClick={onUpgradeRequest}
            className="shrink-0 font-semibold text-amber-200 underline underline-offset-2"
          >
            Upgrade
          </button>
        </div>
      )}

      {/* Active Mode Tags */}
      <ActiveModeTags tags={activeTags} onDismiss={handleTagDismiss} />

      {/* Selected Skill Badge */}
      {selectedSkill && (
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

      {/* Working Folder Chip — desktop-only capability; absent on web/mobile.
          When the unified "Project or folder" picker is present its chip shows
          the folder selection instead, so this standalone chip only renders on
          surfaces without the picker. */}
      {!projectPicker && canUseWorkingDirectory && folderName && (
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

      {hasAttachmentConflict && (
        <div
          role="alert"
          className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
        >
          <p className="text-foreground">
            The selected model can&apos;t read the attached image. Switch to Auto, choose an
            image-capable model, or remove the image.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const autoModelId = getAllowedAutoModesForTier(subscriptionTier)[0];
                if (autoModelId) setComposerSelectedModelId(autoModelId);
              }}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              Use Auto
            </button>
            <button
              type="button"
              onClick={() => {
                clearAttachments();
                setShowCompatibleModels(false);
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
            >
              Remove attachments
            </button>
            <button
              type="button"
              onClick={() => setShowCompatibleModels((open) => !open)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
            >
              Choose a compatible model
            </button>
          </div>
          {showCompatibleModels && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover p-1">
              {compatibleModels.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  aria-label={`Use ${model.name}`}
                  onClick={() => {
                    setComposerSelectedModelId(model.id);
                    setShowCompatibleModels(false);
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                >
                  {model.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
            onSkillSelect={handleSkillSelect}
            skills={availableSkills}
            onClose={() => setShowSlashMenu(false)}
          />
        )}

        {/* @Mention Dropdown */}
        {showMentions && (
          <div
            ref={mentionsRef}
            className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border/60 bg-popover/95 shadow-xl backdrop-blur-xl"
          >
            <div className="p-1.5">
              <div className="mb-1.5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Skills
              </div>
              {skillsLoading ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Loading skills…</p>
              ) : skillsError ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Skills are temporarily unavailable.
                </p>
              ) : filteredSkills.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No matching skills.</p>
              ) : (
                filteredSkills.map((skill) => (
                  <button
                    key={skill.name}
                    onClick={() => handleMentionSelect(skill)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <span className="text-[10px] font-bold">
                        {skill.name.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{skill.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {skill.description}
                      </div>
                    </div>
                  </button>
                ))
              )}
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
          {/* Textarea wrapper — row 1, full width */}
          <div className={cn('relative w-full', emptyState ? 'min-h-[40px]' : 'min-h-[52px]')}>
            <textarea
              ref={textareaRef}
              data-composer-textarea
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={
                isLoading && !imageMode
                  ? 'Reply — sends when the current response finishes'
                  : imageMode
                    ? 'Describe or edit an image'
                    : placeholder
              }
              // Type-ahead: the textarea stays enabled while a turn streams so the
              // user can compose a follow-up (queued + auto-sent on completion).
              // Image mode has no streaming turn to type ahead of, so it stays gated.
              disabled={composerDisabled || (imageMode && isLoading)}
              className={cn(
                'relative z-10 max-h-[240px] w-full resize-none overflow-y-auto border-0 bg-transparent px-2 leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50',
                emptyState
                  ? 'min-h-[40px] py-1.5 text-[18px] md:text-[18px]'
                  : 'min-h-[52px] py-3 text-sm md:text-[15px]',
              )}
              rows={1}
              aria-label="Message input"
            />
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
                      {/* 0. Work mode (Chat | AGI Work) — shown in the menu ONLY
                        below sm, where the inline segmented toggle is hidden to
                        free composer-row width for the model selector. Keeps
                        work-mode fully switchable on the narrow (mobile)
                        composer instead of dropping the control. */}
                      {projectPicker && !imageMode && !isFreeTrial && (
                        <div className="sm:hidden">
                          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
                            <span className="flex-1 text-left text-sm">Mode</span>
                            <div className="flex items-center rounded-full border border-[var(--chat-glass-border)] bg-muted/40 p-0.5 text-xs font-medium">
                              {(['chat', 'agiwork'] as const).map((mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => handleWorkModeChange(mode)}
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
                        onClick={() => {
                          fileInputRef.current?.click();
                          closeMenu();
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
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
                        API. When the unified "Project or folder" picker is
                        present, folder selection lives there ("Choose a
                        different folder") — this legacy row only renders on
                        surfaces without the picker so the control never
                        appears twice. */}
                      {!projectPicker && canUseWorkingDirectory && (
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
                            ? "Web search isn't available for this model or Cloud deployment."
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
                        disabled={isLoading || disabled || isFreeTrial || !modelSupportsResearch}
                        title={
                          isFreeTrial
                            ? 'Upgrade to use Deep Research'
                            : !modelSupportsResearch
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

                      {/* 8c. Managed Office creation — server-owned DOCX/PPTX bytes,
                        persisted through the same generated-file pipeline as sandbox output. */}
                      <MenuToggleRow
                        icon={FileText}
                        label="Create Office files"
                        checked={officeCreationEnabled}
                        onToggle={() => {
                          handleOfficeCreationToggle();
                          closeMenu();
                        }}
                        disabled={isLoading || disabled || !modelSupportsOfficeCreation}
                        title={
                          !modelSupportsOfficeCreation
                            ? "Office file creation isn't available for this model."
                            : undefined
                        }
                      />

                      {/* 8d. Extended thinking — enables thinking effort. Cycling the
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

                      {/* 8e. Incognito / temporary chat toggle */}
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

            {/* Work-mode segmented toggle (Chat | AGI Work) — claude.ai
              Chat/Cowork parity, sitting immediately right of "+" (reference:
              docs/design/ui-ux-reference-2026-07). Backed: 'agiwork' reveals
              the below-composer "Project or folder" picker and the selection
              threads through send meta → createConversation → server project
              context. Hidden below sm (relocated into the + menu "Mode" row)
              so the nowrap control row never squeezes out Send. */}
            {projectPicker && !imageMode && !isFreeTrial && (
              <div className="hidden shrink-0 items-center rounded-full border border-[var(--chat-glass-border)] bg-muted/40 p-0.5 text-xs font-medium sm:flex">
                {(['chat', 'agiwork'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleWorkModeChange(mode)}
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

            {/* Voice input is part of free chat and remains capability-neutral. */}
            <div className="relative shrink-0">
              <VoiceInputButton
                onTranscript={(text) => {
                  setMessage((prev) => {
                    const separator = prev.trim() ? ' ' : '';
                    return prev + separator + text;
                  });
                  setTimeout(() => textareaRef.current?.focus(), 50);
                }}
                disabled={isLoading || composerDisabled}
              />
            </div>

            {/* Send / Stop Button */}
            <SendButton
              mode={sendButtonMode}
              hasContent={hasContent}
              disabled={composerDisabled || (sendButtonMode !== 'stop' && hasAttachmentConflict)}
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
          disabled={isLoading || composerDisabled}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            handleFileDrop(files);
            e.target.value = '';
          }}
          aria-label="Image upload"
        />
      </div>

      {/* Project scope row. Paid AGI Work can select a project or local folder;
          Free keeps ordinary project-scoped chat and never exposes the folder/
          Cowork boundary. */}
      {projectPicker && (workMode === 'agiwork' || isFreeTrial) && !imageMode && (
        <div className="relative mt-2 flex items-center gap-2" ref={projectPickerRef}>
          <div
            className={cn(
              'flex h-8 min-w-0 items-center rounded-full border transition-all',
              pickerHasSelection
                ? 'border-[var(--chat-accent-primary)]/40 bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary)]'
                : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )}
          >
            <button
              type="button"
              onClick={() => {
                setShowProjectPicker((prev) => !prev);
                setProjectQuery('');
              }}
              disabled={isLoading || composerDisabled}
              className={cn(
                'flex h-full min-w-0 items-center gap-1.5 pl-2.5 text-xs font-medium',
                pickerHasSelection ? 'pr-1' : 'pr-2.5',
                (isLoading || composerDisabled) && 'cursor-not-allowed opacity-50',
              )}
              aria-label={isFreeTrial ? 'Project' : 'Project or folder'}
              aria-expanded={showProjectPicker}
              title={pickerHasSelection ? pickerLabel : undefined}
            >
              {pickerFolderName ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="max-w-[220px] truncate">{pickerLabel}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
            </button>
            {pickerHasSelection && (
              <button
                type="button"
                onClick={handleClearPickerSelection}
                className="mr-1.5 shrink-0 rounded-full p-0.5 hover:bg-[var(--chat-accent-primary)]/20"
                aria-label="Clear project or folder selection"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {showProjectPicker && (
            <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-border/60 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
              <input
                type="text"
                value={projectQuery}
                onChange={(e) => setProjectQuery(e.target.value)}
                placeholder="Search projects..."
                aria-label="Search projects"
                autoFocus
                className="mb-1.5 w-full rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-[var(--chat-accent-primary)]/40"
              />
              <div className="max-h-56 overflow-y-auto">
                {filteredPickerProjects.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {projectPicker.projects.length === 0 ? 'No projects yet' : 'No projects found'}
                  </div>
                )}
                {filteredPickerProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => handlePickProject(project.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1 truncate text-left">{project.name}</span>
                    {projectPicker.activeProjectId === project.id && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />
                    )}
                  </button>
                ))}
              </div>

              <div className="my-1 border-t border-border/30" />

              {/* Local folder — working-directory surfaces (desktop) only.
                Render-gated by the capability matrix so web never shows a
                folder option; canPickFolder only disables when the desktop
                browser shell lacks the File System Access API. */}
              {!isFreeTrial && canUseWorkingDirectory && (
                <button
                  type="button"
                  disabled={!canPickFolder}
                  onClick={handlePickFolderFromPicker}
                  title={
                    canPickFolder ? undefined : 'Folder access is not supported in this browser'
                  }
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60',
                    !canPickFolder && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-left">Choose a different folder</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  closeProjectPicker();
                  projectPicker.onCreateProject();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
              >
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left">Create new project</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  closeProjectPicker();
                  router.push('/projects');
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
              >
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left">View all projects</span>
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
 * Removed from + menu: Focus Mode, Agent Mode, Tools group, Browse Directory.
 * Work mode returned as the BACKED (Chat | AGI Work) segmented toggle plus the
 * below-composer "Project or folder" picker (projectPicker prop): the host
 * supplies real projects, the selection threads through send meta into
 * createConversation (conversation project_id), and the server injects the
 * project's instructions/knowledge manifest — so neither control is cosmetic.
 */
export const ChatComposerNew = memo(ChatComposerNewComponent, (prev, next) => {
  return (
    prev.onSend === next.onSend &&
    prev.isLoading === next.isLoading &&
    prev.isGenerating === next.isGenerating &&
    prev.placeholder === next.placeholder &&
    prev.disabled === next.disabled &&
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
    prev.freeTrial?.limitReached === next.freeTrial?.limitReached &&
    prev.projectPicker?.projects === next.projectPicker?.projects &&
    prev.projectPicker?.activeProjectId === next.projectPicker?.activeProjectId &&
    prev.projectPicker?.onSelectProject === next.projectPicker?.onSelectProject &&
    prev.projectPicker?.onCreateProject === next.projectPicker?.onCreateProject
  );
});

ChatComposerNew.displayName = 'ChatComposerNew';
