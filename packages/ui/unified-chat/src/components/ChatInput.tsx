import {
  lazy,
  Suspense,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  Check,
  ChevronDown,
  Clapperboard,
  Folder,
  FolderOpen,
  History,
  Image as ImageIcon,
  ListChecks,
  Mic,
  Plus,
  X,
} from 'lucide-react';
import { cleanupVoiceDictation, detectVoiceCommand } from '@agiworkforce/utils';
import { useMenuKeyboard, useUiTranslation } from '@agiworkforce/ui';
import { cn } from '../lib/utils';
import { useChatStore } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';
import { useSettingsStore } from '../stores/settingsStore';
import { AttachmentMenu } from './AttachmentMenu';
import { ModelSelector } from './ModelSelector';
import { SendButton } from './SendButton';
import { AgentControl } from './AgentControl';
import { ThinkingControl } from './ThinkingControl';
import { PlanModeToggle } from './ChatInputToolbar';
import { SlashCommandMenu, type CommandSuggestion } from './SlashCommandMenu';
import { SkillMentionPicker, type MentionSkill } from './SkillMentionPicker';
import { matchMentionQuery } from '../lib/mentionQuery';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { VoiceOrbCanvas } from './VoiceOrb';
import { orbStateForComposerVoiceState } from '../voice/composer-voice-visual';
import type { ComposerVoiceState, ComposerVoiceController } from '../voice/composer-voice-contract';
import { useAgentControlStore } from '../stores/agentControlStore';
import { selectMediaMode, supportedMediaKinds, useMediaModeStore } from '../stores/mediaModeStore';
import { isCodeExecutionAvailable } from '../lib/codeExecutionAvailability';
import { decideComposerPaste } from '../lib/largePaste';
import type { ComposerAttachmentPasteDecision, ComposerEditorHandle } from '../composer-editor';
import '../composer-editor/composer-editor.css';
import { loadWritingStyle, saveWritingStyle, type WritingStyle } from '../lib/writingStyle';
import type { ChatAttachmentPolicy, LocalToolScope } from '../lib/runtime';
import {
  getSlashCommand,
  registerBuiltinSlashCommands,
  type SlashCommandContext,
} from '../lib/slashCommands';
import {
  ALLOWED_ATTACHMENT_ACCEPT,
  getModelMetadataById,
  resolveModelEffort,
  validateAttachmentFile,
  type CloudWorkMode,
} from '@agiworkforce/types';

registerBuiltinSlashCommands();

export type ChatWorkMode = CloudWorkMode;

export interface ChatWorkScope {
  workMode: ChatWorkMode;
  projectId: string | null;
}

export interface ChatInputProjectPicker {
  projects: Array<{ id: string; name: string }>;
  activeProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onCreateProject?: () => void;
}

export type { ComposerVoiceState, ComposerVoiceController } from '../voice/composer-voice-contract';

export interface ChatInputSlashCommandHost {
  togglePlanMode: () => void;
  openRewindTimeline?: (checkpointId?: string) => void;
}

export interface ComposerSkillSuggestion {
  name: string;
  description: string;
  reason: string;
}

const SKILL_SUGGESTION_DEBOUNCE_MS = 300;
const SKILL_SUGGESTION_MIN_CHARS = 8;

/**
 * Lazy so the default arm carries none of the editor's weight: the textarea is
 * what every consumer renders until a host opts in, and TipTap is the largest
 * dependency in this package.
 */
const ComposerEditor = lazy(() =>
  import('../composer-editor').then((module) => ({ default: module.ComposerEditor })),
);

/** `KeyboardEvent.key` names both arms dispatch the slash menu on. */
const COMPOSER_MENU_KEYS = {
  arrowUp: 'ArrowUp',
  arrowDown: 'ArrowDown',
  enter: 'Enter',
  tab: 'Tab',
  escape: 'Escape',
} as const;

export const CHAT_COMPOSER_EDITOR_MODES = {
  textarea: 'textarea',
  editor: 'editor',
} as const;

export type ChatComposerEditorMode =
  (typeof CHAT_COMPOSER_EDITOR_MODES)[keyof typeof CHAT_COMPOSER_EDITOR_MODES];

/**
 * `composer-editor.css` sizes the editor for web's composer box. These reproduce
 * the textarea arm's own geometry, `min-h-[28px]` and the `px-4 pt-3 pb-1`
 * padding, on the content node and on the placeholder, so the two arms rest at
 * the same height and their first line starts on the same pixel.
 */
const COMPOSER_EDITOR_ARM_CLASS =
  'w-full [&_.ProseMirror]:min-h-[28px] [&_.ProseMirror]:px-4 [&_.ProseMirror]:pt-3 [&_.ProseMirror]:pb-1 [&_.composer-editor\\_\\_placeholder]:px-4 [&_.composer-editor\\_\\_placeholder]:pt-3';

export interface ChatInputProps {
  onSend: (
    content: string,
    agentMode?: string,
    effort?: string,
    attachments?: File[],
    research?: boolean,
    writingStyle?: WritingStyle,
    workScope?: ChatWorkScope,
    skillName?: string,
    localToolScope?: LocalToolScope,
  ) => void;
  onStop: () => void;
  onModelSelectorClick?: () => void;
  allowModelFallbackModels?: boolean;
  supportsAgentControl?: boolean;
  supportsReasoningEffort?: boolean;
  sendShortcut?: 'enter' | 'mod-enter';
  hostControls?: ReactNode;
  onSelectFolder?: () => void;
  onRecordSkill?: () => void;
  currentFolderLabel?: string | null;
  onClearFolder?: () => void;
  projectPicker?: ChatInputProjectPicker;
  canUseAgiWork?: boolean;
  agiWorkUnavailableReason?: string;
  isStreamingOverride?: boolean;
  hasMessages: boolean;
  className?: string;
  disabled?: boolean;
  disabledMessage?: string;
  conversationId?: string | null;
  projectId?: string | null;
  supportsCodeExecution?: boolean;
  supportsResearch?: boolean;
  supportsImageGeneration?: boolean;
  supportsVideoGeneration?: boolean;
  supportsExplicitLocalWebSearch?: boolean;
  attachmentPolicy?: ChatAttachmentPolicy;
  pendingAttachments?: { id: string; files: File[] } | null;
  attachmentContextKey?: string;
  voiceInputController?: ComposerVoiceController;
  slashCommandHost?: ChatInputSlashCommandHost;
  skills?: MentionSkill[];
  suggestSkills?: (content: string) => Promise<ComposerSkillSuggestion[]>;
  composerEditorMode?: ChatComposerEditorMode;
}

export function ChatInput({
  onSend,
  onStop,
  onModelSelectorClick,
  allowModelFallbackModels = true,
  supportsAgentControl = true,
  supportsReasoningEffort = supportsAgentControl,
  sendShortcut = 'enter',
  hostControls,
  onSelectFolder,
  onRecordSkill,
  currentFolderLabel = null,
  onClearFolder,
  projectPicker,
  canUseAgiWork = true,
  agiWorkUnavailableReason,
  isStreamingOverride,
  hasMessages,
  className,
  disabled = false,
  disabledMessage,
  conversationId,
  projectId,
  supportsCodeExecution = false,
  supportsResearch = false,
  supportsImageGeneration = false,
  supportsVideoGeneration = false,
  supportsExplicitLocalWebSearch = false,
  attachmentPolicy,
  pendingAttachments = null,
  attachmentContextKey,
  voiceInputController,
  slashCommandHost,
  skills = [],
  suggestSkills,
  composerEditorMode = CHAT_COMPOSER_EDITOR_MODES.textarea,
}: ChatInputProps) {
  const { t } = useUiTranslation('chat');
  const isEditorArm = composerEditorMode === CHAT_COMPOSER_EDITOR_MODES.editor;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerEditorRef = useRef<ComposerEditorHandle | null>(null);
  const focusComposer = useCallback(() => {
    const handle = composerEditorRef.current;
    if (handle) {
      handle.focus();
      return;
    }
    textareaRef.current?.focus();
  }, []);
  const attachmentDestinationKey = `${attachmentContextKey ?? 'default'}:${
    conversationId ?? 'no-conversation'
  }`;
  const liveAttachmentDestinationRef = useRef(attachmentDestinationKey);
  liveAttachmentDestinationRef.current = attachmentDestinationKey;
  const attachedFilesDestinationRef = useRef<string | null>(null);
  const aggregateIsStreaming = useChatStore((s) => s.isStreaming);
  const isStreaming = isStreamingOverride ?? aggregateIsStreaming;
  const draftContent = useChatStore((s) => s.draftContent);
  const setDraftContent = useChatStore((s) => s.setDraftContent);
  const clearDraftContent = useChatStore((s) => s.clearDraftContent);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const attachedFilesRef = useRef<File[]>(attachedFiles);
  attachedFilesRef.current = attachedFiles;
  const hasTextContent = draftContent.trim().length > 0;
  const [isDragOver, setIsDragOver] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [explicitWebSearchEnabled, setExplicitWebSearchEnabled] = useState(false);
  const mediaMode = useMediaModeStore(selectMediaMode);
  const toggleMediaMode = useMediaModeStore((state) => state.toggleMediaMode);
  const exitMediaMode = useMediaModeStore((state) => state.exitMediaMode);
  const mediaGenerationKinds = useMemo(
    () => supportedMediaKinds({ image: supportsImageGeneration, video: supportsVideoGeneration }),
    [supportsImageGeneration, supportsVideoGeneration],
  );
  useEffect(() => {
    if (mediaMode !== 'text' && !mediaGenerationKinds.includes(mediaMode)) exitMediaMode();
  }, [mediaMode, mediaGenerationKinds, exitMediaMode]);
  const [activeStyle, setActiveStyleState] = useState<WritingStyle | null>(loadWritingStyle);
  const setActiveStyle = useCallback((style: WritingStyle | null) => {
    setActiveStyleState(style);
    saveWritingStyle(style);
  }, []);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [selectedSkill, setSelectedSkill] = useState<MentionSkill | null>(null);
  const [suggestedSkills, setSuggestedSkills] = useState<ComposerSkillSuggestion[]>([]);
  const [dismissedSkillNames, setDismissedSkillNames] = useState<string[]>([]);

  const [workMode, setWorkMode] = useState<ChatWorkMode>('chat');
  const [scopePickerOpen, setScopePickerOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const scopePickerRef = useRef<HTMLDivElement>(null);
  const scopeTriggerRef = useRef<HTMLButtonElement>(null);
  const scopePanelRef = useRef<HTMLDivElement>(null);
  const activeProjectId = projectPicker?.activeProjectId ?? null;

  useEffect(() => {
    setWorkMode(canUseAgiWork && activeProjectId ? 'agiwork' : 'chat');
  }, [activeProjectId, canUseAgiWork, conversationId]);

  useEffect(() => {
    if (canUseAgiWork && activeProjectId) setWorkMode('agiwork');
  }, [activeProjectId, canUseAgiWork]);

  const prevFolderLabelRef = useRef(currentFolderLabel);
  useEffect(() => {
    const prev = prevFolderLabelRef.current;
    prevFolderLabelRef.current = currentFolderLabel;
    if (currentFolderLabel && currentFolderLabel !== prev && activeProjectId) {
      projectPicker?.onSelectProject(null);
    }
  }, [currentFolderLabel, activeProjectId, projectPicker]);

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
  const entitledFolderLabel = canUseAgiWork ? currentFolderLabel : null;
  const scopeHasSelection = Boolean(activePickerProject || entitledFolderLabel);
  const scopeLabel =
    activePickerProject?.name ??
    entitledFolderLabel ??
    (canUseAgiWork
      ? t('composer.projectOrFolder', 'Project or folder')
      : t('composer.project', 'Project'));
  const filteredPickerProjects = projectPicker
    ? projectPicker.projects.filter((p) =>
        p.name.toLowerCase().includes(projectQuery.trim().toLowerCase()),
      )
    : [];

  const closeScopePicker = useCallback(() => {
    setScopePickerOpen(false);
    setProjectQuery('');
    scopeTriggerRef.current?.focus();
  }, []);

  useMenuKeyboard({
    open: scopePickerOpen,
    onClose: closeScopePicker,
    panelRef: scopePanelRef,
    triggerRef: scopeTriggerRef,
    itemSelector: 'input, [role="option"]',
  });

  const handlePickProject = useCallback(
    (id: string) => {
      projectPicker?.onSelectProject(id);
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
    onSelectFolder?.();
  }, [closeScopePicker, onSelectFolder]);

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

  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const models = useModelStore((s) => s.models);
  const modelCatalogStatus = useModelStore((s) => s.modelCatalogStatus);
  const selectedModel = models.find((m) => m.id === selectedModelId);
  const modelProviderId = (selectedModel?.provider as string) ?? '';
  const noModelSelected = selectedModelId.trim() === '';
  const modelCatalogLoadingWithoutModels = modelCatalogStatus === 'loading' && models.length === 0;

  useEffect(() => {
    if (!supportsResearch) setResearchEnabled(false);
  }, [supportsResearch]);

  useEffect(() => {
    setExplicitWebSearchEnabled(false);
  }, [conversationId, supportsExplicitLocalWebSearch]);

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

  const resolveAgentControl = useAgentControlStore((s) => s.resolve);
  const showAgentControl = Boolean(
    conversationId && (supportsAgentControl || supportsReasoningEffort),
  );
  const activeAgentMode = useAgentControlStore((state) =>
    conversationId ? state.resolve(conversationId, projectId ?? null).mode : 'ask',
  );
  const activeAgentEffort = useAgentControlStore((state) =>
    conversationId ? state.resolve(conversationId, projectId ?? null).effort : null,
  );
  const setAgentEffort = useAgentControlStore((s) => s.setEffort);
  const { state: browserVoiceState, start: startBrowserVoice } = useVoiceInput({
    onTranscript: (text) => {
      const cleanedText = cleanupVoiceDictation(text);
      const isCommand = detectVoiceCommand(cleanedText);
      const current = useChatStore.getState().draftContent;
      setDraftContent(
        isCommand ? cleanedText : current ? `${current} ${cleanedText}` : cleanedText,
        conversationId,
      );
      focusComposer();
    },
  });
  const voiceState: ComposerVoiceState = voiceInputController?.state ?? browserVoiceState;
  const startVoice = voiceInputController?.onToggle ?? startBrowserVoice;
  const voiceIsBusy = [
    'transcribing',
    'processing',
    'awaiting_action',
    'executing',
    'stopping',
  ].includes(voiceState);
  const voiceIsDisabled = voiceIsBusy || voiceState === 'unsupported';
  const voiceOrbState = orbStateForComposerVoiceState(voiceState);
  const showVoiceOrb = voiceState === 'listening' || voiceIsBusy;
  const voiceReducedMotion = useReducedMotion();
  const voiceLabel =
    voiceState === 'listening'
      ? t('composer.voiceStopRecording', 'Stop recording')
      : voiceState === 'transcribing'
        ? t('composer.voiceTranscribing', 'Transcribing voice')
        : voiceState === 'processing'
          ? t('composer.voiceProcessing', 'Processing voice request')
          : voiceState === 'awaiting_action'
            ? t('composer.voiceAwaitingApproval', 'Voice action awaiting approval')
            : voiceState === 'executing'
              ? t('composer.voiceExecuting', 'Running voice action')
              : voiceState === 'stopping'
                ? t('composer.voiceStopping', 'Stopping voice action')
                : voiceState === 'unsupported'
                  ? t('composer.voiceUnsupported', 'Voice input unavailable')
                  : (voiceInputController?.idleLabel ?? t('composer.voiceIdle', 'Voice input'));

  useEffect(() => {
    focusComposer();
  }, [focusComposer]);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
    if (draftContent) textareaRef.current?.focus();
  }, [draftContent, adjustHeight]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setDraftContent(e.target.value, conversationId);
      setSlashSelectedIndex(0);
      adjustHeight();
    },
    [adjustHeight, conversationId, setDraftContent],
  );

  const mentionTrigger = matchMentionQuery(draftContent);
  const skillQuery = skills.length > 0 ? (mentionTrigger?.query ?? null) : null;

  const handleSkillSelect = useCallback(
    (skill: MentionSkill) => {
      const trigger = matchMentionQuery(draftContent);
      if (trigger) {
        setDraftContent(draftContent.slice(0, trigger.startIndex).trimEnd(), conversationId);
      }
      setSelectedSkill(skill);
      focusComposer();
    },
    [conversationId, draftContent, focusComposer, setDraftContent],
  );

  useEffect(() => {
    setSelectedSkill(null);
    setSuggestedSkills([]);
    setDismissedSkillNames([]);
  }, [attachmentDestinationKey]);

  useEffect(() => {
    if (!suggestSkills || selectedSkill || skillQuery !== null) {
      setSuggestedSkills([]);
      return;
    }
    const text = draftContent.trim();
    if (text.length < SKILL_SUGGESTION_MIN_CHARS) {
      setSuggestedSkills([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void suggestSkills(text)
        .then((matches) => {
          if (!cancelled) setSuggestedSkills(matches);
        })
        .catch(() => {
          if (!cancelled) setSuggestedSkills([]);
        });
    }, SKILL_SUGGESTION_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draftContent, selectedSkill, skillQuery, suggestSkills]);

  const visibleSkillSuggestions = useMemo(
    () => suggestedSkills.filter((suggestion) => !dismissedSkillNames.includes(suggestion.name)),
    [dismissedSkillNames, suggestedSkills],
  );

  const handleSuggestedSkillApply = useCallback(
    (suggestion: ComposerSkillSuggestion) => {
      setSelectedSkill({ id: suggestion.name, name: suggestion.name, category: 'suggested' });
      setSuggestedSkills([]);
      focusComposer();
    },
    [focusComposer],
  );

  const handleSuggestedSkillDismiss = useCallback((name: string) => {
    setDismissedSkillNames((names) => (names.includes(name) ? names : [...names, name]));
  }, []);

  const slashQueryMatch = /^\/([A-Za-z0-9_-]*)$/.exec(draftContent);
  const slashQuery = slashQueryMatch?.[1]?.toLowerCase() ?? null;
  const slashSuggestions = useMemo<CommandSuggestion[]>(() => {
    if (slashQuery === null || !slashCommandHost) return [];

    const entries = [
      {
        name: 'plan',
        enabled: true,
        icon: <ListChecks className="h-4 w-4 text-[var(--chat-text-secondary)]" />,
      },
      {
        name: 'rewind',
        enabled: Boolean(conversationId && slashCommandHost.openRewindTimeline),
        icon: <History className="h-4 w-4 text-[var(--chat-text-secondary)]" />,
      },
      {
        name: 'image',
        enabled: mediaGenerationKinds.includes('image'),
        icon: <ImageIcon className="h-4 w-4 text-[var(--chat-text-secondary)]" />,
      },
      {
        name: 'video',
        enabled: mediaGenerationKinds.includes('video'),
        icon: <Clapperboard className="h-4 w-4 text-[var(--chat-text-secondary)]" />,
      },
    ] as const;

    return entries.flatMap(({ name, enabled, icon }) => {
      const command = getSlashCommand(name);
      if (
        !enabled ||
        !command ||
        (slashQuery &&
          !command.name.startsWith(slashQuery) &&
          !command.description.toLowerCase().includes(slashQuery))
      ) {
        return [];
      }
      return [
        {
          id: command.name,
          command: `/${command.name}`,
          description: command.description,
          example: command.argsHint,
          icon,
          slashCommand: command,
        },
      ];
    });
  }, [conversationId, mediaGenerationKinds, slashCommandHost, slashQuery]);
  const slashMenuOpen = slashQuery !== null && slashSuggestions.length > 0;

  useEffect(() => {
    if (slashSelectedIndex < slashSuggestions.length) return;
    setSlashSelectedIndex(Math.max(0, slashSuggestions.length - 1));
  }, [slashSelectedIndex, slashSuggestions.length]);

  const handleSlashSelect = useCallback(
    (suggestion: CommandSuggestion) => {
      const command = suggestion.slashCommand;
      if (!command?.handler || !slashCommandHost) return;
      const context: SlashCommandContext = {
        conversationId: conversationId ?? null,
        host: { ...slashCommandHost, toggleMediaMode },
      };
      void command.handler('', context);
      clearDraftContent(conversationId);
      setSlashSelectedIndex(0);
      focusComposer();
    },
    [clearDraftContent, conversationId, focusComposer, slashCommandHost, toggleMediaMode],
  );

  const appendFiles = useCallback(
    (candidates: File[]) => {
      if (candidates.length === 0) return;
      if (liveAttachmentDestinationRef.current !== attachmentDestinationKey) return;
      const existingAttachedFiles =
        attachedFilesDestinationRef.current === attachmentDestinationKey
          ? attachedFilesRef.current
          : [];
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
        const availableCount = Math.max(0, maxFiles - existingAttachedFiles.length);
        const bounded: File[] = [];
        let totalBytes = existingAttachedFiles.reduce((sum, file) => sum + file.size, 0);
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
        attachedFilesDestinationRef.current = attachmentDestinationKey;
        const nextFiles = [...existingAttachedFiles, ...bounded];
        attachedFilesRef.current = nextFiles;
        setAttachedFiles(nextFiles);
      }
      setAttachmentError(rejections[0] ?? null);
    },
    [attachmentDestinationKey, attachmentPolicy],
  );

  const consumedAttachmentIdRef = useRef<string | null>(null);
  useEffect(() => {
    attachedFilesDestinationRef.current = null;
    attachedFilesRef.current = [];
    setAttachedFiles([]);
    setAttachmentError(null);
  }, [attachmentDestinationKey]);

  useEffect(() => {
    if (!pendingAttachments || consumedAttachmentIdRef.current === pendingAttachments.id) return;
    consumedAttachmentIdRef.current = pendingAttachments.id;
    appendFiles(pendingAttachments.files);
  }, [pendingAttachments, appendFiles]);

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (disabled || isStreaming) return;
      e.preventDefault();
      if (!isDragOver) setIsDragOver(true);
    },
    [disabled, isStreaming, isDragOver],
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
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

  const appendPasteDecisionFiles = useCallback(
    (decision: ComposerAttachmentPasteDecision) => {
      appendFiles(decision.kind === 'files' ? decision.files : [decision.file]);
    },
    [appendFiles],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (disabled || isStreaming) return;
      const decision = decideComposerPaste(e.clipboardData, {
        existingFileNames: attachedFilesRef.current.map((file) => file.name),
      });
      if (decision.kind === 'text') return;
      e.preventDefault();
      appendPasteDecisionFiles(decision);
    },
    [disabled, isStreaming, appendPasteDecisionFiles],
  );

  /**
   * The editor runs `decideComposerPaste` itself and hands back only the
   * non-text outcomes, so this arm re-applies the streaming guard the textarea's
   * own paste handler applies before the decision is made.
   */
  const handleEditorPasteDecision = useCallback(
    (decision: ComposerAttachmentPasteDecision) => {
      if (disabled || isStreaming) return;
      appendPasteDecisionFiles(decision);
    },
    [disabled, isStreaming, appendPasteDecisionFiles],
  );

  const attachedFileNames = useMemo(() => attachedFiles.map((file) => file.name), [attachedFiles]);

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
    const typedContent = draftContent.trim();
    const destinationAttachedFiles =
      attachedFilesDestinationRef.current === attachmentDestinationKey ? attachedFiles : [];
    if ((!typedContent && destinationAttachedFiles.length === 0) || isStreaming) return;

    const content =
      typedContent ||
      (destinationAttachedFiles.length === 1
        ? t('composer.analyzeAttachedFile', 'Please analyze the attached file.')
        : t('composer.analyzeAttachedFiles', 'Please analyze the attached files.'));

    let agentMode: string | undefined;
    let effort: string | undefined;
    if (conversationId) {
      const agentState = resolveAgentControl(conversationId, projectId ?? null);
      agentMode = agentState.mode;
      effort = resolveModelEffort(selectedModelId, agentState.effort);
    }

    const attachments = destinationAttachedFiles.length > 0 ? destinationAttachedFiles : undefined;
    const research = supportsResearch && researchEnabled;
    const workScope = projectPicker
      ? {
          workMode: canUseAgiWork ? workMode : 'chat',
          projectId: activeProjectId,
        }
      : undefined;
    if (supportsExplicitLocalWebSearch && explicitWebSearchEnabled) {
      onSend(
        content,
        agentMode,
        effort,
        attachments,
        research,
        activeStyle ?? undefined,
        workScope,
        selectedSkill?.name,
        'web_search',
      );
    } else if (selectedSkill) {
      onSend(
        content,
        agentMode,
        effort,
        attachments,
        research,
        activeStyle ?? undefined,
        workScope,
        selectedSkill.name,
      );
    } else if (projectPicker) {
      onSend(
        content,
        agentMode,
        effort,
        attachments,
        research,
        activeStyle ?? undefined,
        workScope,
      );
    } else if (activeStyle) {
      onSend(content, agentMode, effort, attachments, research, activeStyle);
    } else {
      onSend(content, agentMode, effort, attachments, research);
    }
    clearDraftContent(conversationId);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setAttachedFiles([]);
    attachedFilesRef.current = [];
    attachedFilesDestinationRef.current = null;
    setAttachmentError(null);
    setSelectedSkill(null);
    setSuggestedSkills([]);
    setDismissedSkillNames([]);
    setExplicitWebSearchEnabled(false);
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
    attachmentDestinationKey,
    clearDraftContent,
    researchEnabled,
    supportsResearch,
    supportsExplicitLocalWebSearch,
    explicitWebSearchEnabled,
    activeStyle,
    projectPicker,
    canUseAgiWork,
    workMode,
    activeProjectId,
    selectedSkill,
    t,
  ]);

  /**
   * Shared by both arms: the textarea calls it from its own `keydown`, and the
   * editor's submit keymap delegates the same five keys through `onSlashMenuKey`.
   * A `true` return means the menu consumed the key.
   */
  const handleSlashMenuKey = useCallback(
    (key: string) => {
      if (!slashMenuOpen) return false;
      if (key === COMPOSER_MENU_KEYS.arrowUp) {
        setSlashSelectedIndex(
          (index) => (index - 1 + slashSuggestions.length) % slashSuggestions.length,
        );
        return true;
      }
      if (key === COMPOSER_MENU_KEYS.arrowDown) {
        setSlashSelectedIndex((index) => (index + 1) % slashSuggestions.length);
        return true;
      }
      if (key === COMPOSER_MENU_KEYS.enter || key === COMPOSER_MENU_KEYS.tab) {
        const suggestion = slashSuggestions[slashSelectedIndex];
        if (suggestion) handleSlashSelect(suggestion);
        return true;
      }
      if (key === COMPOSER_MENU_KEYS.escape) {
        clearDraftContent(conversationId);
        return true;
      }
      return false;
    },
    [
      clearDraftContent,
      conversationId,
      handleSlashSelect,
      slashMenuOpen,
      slashSelectedIndex,
      slashSuggestions,
    ],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.defaultPrevented) return;
      if (handleSlashMenuKey(e.key)) {
        e.preventDefault();
        return;
      }

      const shortcutMatches =
        sendShortcut === 'mod-enter' ? (e.metaKey || e.ctrlKey) && !e.shiftKey : !e.shiftKey;
      if (e.key === 'Enter' && shortcutMatches && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, handleSlashMenuKey, sendShortcut],
  );

  const handleEditorTextChange = useCallback(
    (value: string) => {
      setDraftContent(value, conversationId);
      setSlashSelectedIndex(0);
    },
    [conversationId, setDraftContent],
  );

  /**
   * A callback ref, not an object ref: TipTap builds its view in an effect, so
   * the handle only becomes usable on a later render than the one that mounted
   * the arm. This runs at exactly that moment, which is the only point at which
   * a parked draft can be seeded and the composer focused.
   */
  const attachComposerEditor = useCallback((handle: ComposerEditorHandle | null) => {
    composerEditorRef.current = handle;
    if (!handle) return;
    const parkedDraft = useChatStore.getState().draftContent;
    if (parkedDraft) handle.setText(parkedDraft);
    handle.focus();
  }, []);

  /**
   * The editor owns its own text, so every store write that did not come from a
   * keystroke, a conversation switch, a voice transcript, a consumed skill
   * mention, the clear on send, has to be pushed back into it. Comparing the
   * text first is what keeps typing out of this path.
   */
  useEffect(() => {
    const handle = composerEditorRef.current;
    if (!handle || handle.getText() === draftContent) return;
    handle.setText(draftContent);
  }, [draftContent]);

  const [focused, setFocused] = useState(false);

  const placeholder = disabled
    ? (disabledMessage ?? t('composer.connectToChat', 'Connect to start chatting'))
    : modelCatalogLoadingWithoutModels
      ? t('composer.findingModels', 'Finding available models…')
      : noModelSelected
        ? t('composer.selectModelToStart', 'Select a model to start')
        : hasMessages
          ? t('composer.reply', 'Reply…')
          : t('placeholderEmpty', 'How can I help you today?');

  return (
    <div className={cn('relative mx-auto w-full max-w-3xl px-4 pb-2', className)}>
      <SlashCommandMenu
        show={slashMenuOpen}
        suggestions={slashSuggestions}
        selectedIndex={slashSelectedIndex}
        onSelect={handleSlashSelect}
        onHover={setSlashSelectedIndex}
      />
      {skillQuery !== null ? (
        <SkillMentionPicker
          query={skillQuery}
          skills={skills}
          onSelect={handleSkillSelect}
          onClose={() => {
            const match = /(?:^|\s)@[A-Za-z0-9_-]*$/.exec(draftContent);
            if (match) {
              setDraftContent(draftContent.slice(0, match.index).trimEnd(), conversationId);
            }
          }}
        />
      ) : null}
      {!selectedSkill && visibleSkillSuggestions.length > 0 ? (
        <div
          data-testid="composer-skill-suggestions"
          className="mb-2 flex flex-wrap items-center gap-1.5"
        >
          <span className="text-[12px] text-[var(--chat-text-secondary)]">
            {t('composer.suggestedSkills', 'Suggested skills')}
          </span>
          {visibleSkillSuggestions.map((suggestion) => (
            <span
              key={suggestion.name}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] pl-2.5 pr-1 py-0.5 text-xs text-[var(--chat-text-secondary)]"
            >
              <button
                type="button"
                title={suggestion.reason}
                onClick={() => handleSuggestedSkillApply(suggestion)}
                aria-label={`Use ${suggestion.name} skill`}
                className="rounded-full hover:text-[var(--chat-text-primary)]"
              >
                {suggestion.name}
              </button>
              <button
                type="button"
                onClick={() => handleSuggestedSkillDismiss(suggestion.name)}
                aria-label={`Dismiss ${suggestion.name} suggestion`}
                className="rounded-full p-1.5 hover:bg-[var(--chat-surface-hover)]"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div
        className={cn(
          'overflow-hidden border transition-colors',
          'bg-[var(--chat-surface-elevated)]',
          isDragOver
            ? 'border-[var(--chat-accent-primary)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--chat-accent-primary)_25%,transparent)]'
            : focused
              ? 'border-[var(--chat-border-strong,var(--chat-border))] shadow-[0_0_0_2px_var(--chat-focus-ring)]'
              : 'border-[var(--chat-border)]',
        )}
        style={{ borderRadius: 16 }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Inline attachment validation error, dismissed on next valid add. */}
        {attachmentError && (
          <div
            role="status"
            aria-live="polite"
            className="px-3 pt-2 text-[12px] text-[var(--chat-destructive-text)]"
          >
            {attachmentError}
          </div>
        )}

        {selectedSkill ? (
          <div className="px-3 pt-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--chat-accent-primary)]/10 px-2 py-1 text-xs text-[var(--chat-accent-primary-text)]">
              Skill: {selectedSkill.name}
              <button
                type="button"
                onClick={() => setSelectedSkill(null)}
                aria-label={`Remove ${selectedSkill.name} skill`}
                className="rounded p-1.5 hover:bg-[var(--chat-accent-primary)]/10"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          </div>
        ) : null}

        {/* Attached files preview, image thumbnails for image/*, text chip otherwise */}
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

        {isEditorArm ? (
          <Suspense fallback={null}>
            <ComposerEditor
              ref={attachComposerEditor}
              ariaLabel={t('composer.messageInput', 'Chat message input')}
              placeholder={placeholder}
              disabled={disabled}
              sendShortcut={sendShortcut}
              className={COMPOSER_EDITOR_ARM_CLASS}
              existingFileNames={attachedFileNames}
              onTextChange={handleEditorTextChange}
              onSubmit={handleSend}
              onFocusChange={setFocused}
              onPasteDecision={handleEditorPasteDecision}
              isSlashMenuActive={() => slashMenuOpen}
              onSlashMenuKey={handleSlashMenuKey}
            />
          </Suspense>
        ) : (
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
            aria-label={t('composer.messageInput', 'Chat message input')}
          />
        )}

        {/* Bottom toolbar.
            SINGLE non-wrapping control row (flex-nowrap), mirrors web's
            ChatComposerNew, which deliberately avoids flex-wrap so the send
            button can never drop to a second line as the column narrows.
            The min-w-0 shrink chain lets the left group (plus + AgentControl
            chips) and the model selector collapse first, while the voice + send
            buttons stay shrink-0 and pinned to the right edge. */}
        <div className="flex flex-col gap-1 px-3 pt-1.5 pb-2">
          <div className="flex flex-nowrap items-center gap-1 sm:gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {/* Left: Plus button, opens attachment menu */}
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
                  researchEnabled={researchEnabled}
                  onResearchToggle={() => setResearchEnabled((v) => !v)}
                  supportsResearch={supportsResearch}
                  explicitWebSearchEnabled={explicitWebSearchEnabled}
                  onExplicitWebSearchToggle={
                    supportsExplicitLocalWebSearch
                      ? () => setExplicitWebSearchEnabled((enabled) => !enabled)
                      : undefined
                  }
                  codeExecutionEnabled={codeExecutionEnabled}
                  codeExecutionAvailable={codeExecutionAvailable}
                  onCodeExecutionToggle={supportsCodeExecution ? toggleCodeExecution : undefined}
                  mediaMode={mediaMode}
                  mediaGenerationKinds={mediaGenerationKinds}
                  onMediaModeToggle={mediaGenerationKinds.length > 0 ? toggleMediaMode : undefined}
                  activeStyle={activeStyle}
                  onStyleChange={setActiveStyle}
                  onScreenshot={(file) => appendFiles([file])}
                >
                  <button
                    ref={plusButtonRef}
                    type="button"
                    aria-label={t('composer.addAttachment', 'Add attachment')}
                    aria-expanded={attachmentMenuOpen}
                    className={cn(
                      'relative flex h-9 w-9 items-center justify-center rounded-full',
                      'transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                      attachedFiles.length > 0 || attachmentMenuOpen
                        ? 'bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary-text)]'
                        : 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                    )}
                  >
                    <Plus size={18} />
                    {attachedFiles.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--chat-accent-primary)] text-[12px] font-bold text-[var(--chat-accent-on-primary)]">
                        {attachedFiles.length}
                      </span>
                    )}
                  </button>
                </AttachmentMenu>
              </div>

              {/* Work-mode segmented toggle (Chat | AGI Work), web parity,
                  sitting immediately right of "+". Rendered only when the host
                  feeds projectPicker. */}
              {projectPicker && canUseAgiWork && (
                <div
                  role="group"
                  aria-label={t('composer.mode', 'Composer mode')}
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
                      {mode === 'chat' ? t('composer.modeChat', 'Chat') : 'AGI Work'}
                    </button>
                  ))}
                </div>
              )}

              {hostControls}

              {/* Agent control chips stay visually attached to the plus button. */}
              {showAgentControl && conversationId && (
                <AgentControl
                  conversationId={conversationId}
                  projectId={projectId ?? null}
                  modelId={selectedModelId}
                  showMode={supportsAgentControl}
                  showEffort={supportsReasoningEffort}
                  className="min-w-0 max-w-full flex-wrap justify-start gap-1"
                />
              )}
              {/* Extended thinking. Renders only what the selected model's
                  catalog reasoning contract actually supports: an operable
                  switch, a static "always on" badge, or nothing. Gated on the
                  same capability as the effort chip, a runtime that does not
                  forward reasoning parameters must not advertise one. */}
              {supportsReasoningEffort && (
                <ThinkingControl modelId={selectedModelId} disabled={disabled} />
              )}
              {supportsAgentControl && slashCommandHost && (
                <PlanModeToggle
                  active={activeAgentMode === 'plan'}
                  onToggle={slashCommandHost.togglePlanMode}
                  className="shrink-0"
                />
              )}
              {mediaMode !== 'text' && (
                <button
                  type="button"
                  onClick={exitMediaMode}
                  aria-pressed
                  aria-label={`Leave ${mediaMode} generation mode`}
                  className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-[var(--chat-accent-primary)] px-3 text-xs font-medium text-[var(--chat-accent-on-primary)]"
                >
                  {mediaMode === 'image' ? <ImageIcon size={13} /> : <Clapperboard size={13} />}
                  {mediaMode === 'image' ? 'Image' : 'Video'}
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Right: Model selector + mic + send.
                min-w-0 (NOT shrink-0) so the model pill is the item that
                truncates first as the column narrows, mirroring web, where the
                shrinkable model area shares the nowrap row. The mic + send below
                are shrink-0, so under flex-nowrap + the container's overflow-hidden
                the send button can never be pushed off-edge or clipped. */}
            <div className="ml-auto flex min-w-0 max-w-full items-center justify-end gap-1.5">
              {/* Inline model selector popover */}
              <ModelSelector
                onSettingsClick={onModelSelectorClick}
                allowFallbackModels={allowModelFallbackModels}
                disabled={disabled || isStreaming}
                className="min-w-0 max-w-[12rem]"
                effort={activeAgentEffort === 'none' ? null : (activeAgentEffort ?? null)}
                onEffortChange={
                  conversationId
                    ? (next) => setAgentEffort(conversationId, next ?? 'none')
                    : undefined
                }
              />

              {/* Mic button, ghost, hidden when streaming */}
              {!isStreaming &&
                (voiceInputController !== undefined || voiceState !== 'unsupported') && (
                  <button
                    type="button"
                    onClick={() => void startVoice()}
                    aria-label={voiceLabel}
                    title={voiceLabel}
                    disabled={voiceIsDisabled}
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      'transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                      voiceState === 'listening'
                        ? 'text-[var(--chat-accent-primary-text)] hover:bg-[var(--chat-accent-primary)]/10'
                        : voiceIsBusy
                          ? 'cursor-wait text-[var(--chat-text-muted)]'
                          : 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                    )}
                  >
                    {showVoiceOrb ? (
                      <VoiceOrbCanvas
                        orbState={voiceOrbState}
                        focus={false}
                        growIn={false}
                        reducedMotion={voiceReducedMotion}
                        canvasSize={20}
                        sphereSize={12}
                      />
                    ) : (
                      <Mic size={16} strokeWidth={1.75} />
                    )}
                  </button>
                )}

              {/* Send / Stop, shared 3-state SendButton (mirrors web's composer).
                  The desktop chat store only models `isStreaming`, so we drive
                  the honest two reachable states (stop while streaming, otherwise
                  send). The button's `queue` state exists in the shared API for
                  web parity but is never fabricated here. */}
              <SendButton
                mode={isStreaming ? 'stop' : 'send'}
                hasContent={hasTextContent || attachedFiles.length > 0}
                disabled={disabled || noModelSelected}
                onClick={isStreaming ? onStop : handleSend}
                sendShortcutLabel={sendShortcut === 'mod-enter' ? 'Cmd/Ctrl+Enter' : 'Enter'}
                className="shrink-0"
              />
            </div>
          </div>
        </div>
      </div>

      {/* AGI Work scope row, "Project or folder ▾" chip DIRECTLY BELOW the
          composer (web ChatComposerNew / claude.ai Cowork reference layout).
          Rendered only in AGI Work mode with host-provided project data; the
          local-folder action appears only when the host feeds the folder seam
          (desktop, privacy-gated by the host). */}
      {projectPicker && (workMode === 'agiwork' || !canUseAgiWork) && (
        <div className="relative mt-2 flex flex-wrap items-center gap-2" ref={scopePickerRef}>
          <div
            className={cn(
              'flex h-8 min-w-0 items-center rounded-full border transition-all',
              scopeHasSelection
                ? 'border-[var(--chat-accent-primary)]/40 bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary-text)]'
                : 'border-[var(--chat-border)] bg-[var(--chat-surface-hover)]/40 text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)]',
            )}
          >
            <button
              ref={scopeTriggerRef}
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
              aria-label={
                canUseAgiWork
                  ? t('composer.projectOrFolder', 'Project or folder')
                  : t('composer.project', 'Project')
              }
              aria-description={!canUseAgiWork ? agiWorkUnavailableReason : undefined}
              aria-expanded={scopePickerOpen}
              title={scopeHasSelection ? scopeLabel : undefined}
            >
              {entitledFolderLabel ? (
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
                className="mr-1.5 shrink-0 rounded-full p-1.5 hover:bg-[var(--chat-accent-primary)]/20"
                aria-label={
                  canUseAgiWork
                    ? t('composer.clearProjectOrFolder', 'Clear project or folder selection')
                    : t('composer.clearProject', 'Clear project selection')
                }
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {scopePickerOpen && (
            <div
              ref={scopePanelRef}
              role="listbox"
              aria-label={t('composer.projectOrFolder', 'Project or folder')}
              className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-1.5 shadow-xl"
            >
              {!canUseAgiWork && (
                <p
                  role="status"
                  className="mb-1.5 rounded-lg bg-[var(--chat-surface-hover)]/50 px-3 py-2 text-xs leading-5 text-[var(--chat-text-secondary)]"
                >
                  {agiWorkUnavailableReason ??
                    t(
                      'composer.agiWorkUnavailable',
                      'AGI Work is unavailable. Project chat still works.',
                    )}
                </p>
              )}
              <input
                type="text"
                value={projectQuery}
                onChange={(e) => setProjectQuery(e.target.value)}
                placeholder={t('projects.searchPlaceholder', 'Search projects...')}
                aria-label={t('composer.searchProjects', 'Search projects')}
                className="mb-1.5 w-full rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-hover)]/30 px-3 py-2 text-sm text-[var(--chat-text-primary)] outline-none placeholder:text-[var(--chat-text-placeholder)]"
              />
              <div className="max-h-56 overflow-y-auto">
                {filteredPickerProjects.length === 0 && (
                  <div className="px-3 py-2 text-sm text-[var(--chat-text-secondary)]">
                    {projectPicker.projects.length === 0
                      ? t('composer.noProjectsYet', 'No projects yet')
                      : t('projects.none', 'No projects found')}
                  </div>
                )}
                {filteredPickerProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    role="option"
                    aria-selected={activeProjectId === project.id}
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

              {/* Local folder, rendered only when the host feeds the folder
                  seam (desktop-only + privacy-gated at the host). */}
              {canUseAgiWork && onSelectFolder && (
                <>
                  <div className="my-1 border-t border-[var(--chat-border)]" />
                  <button
                    type="button"
                    onClick={handlePickFolderFromScope}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)]"
                  >
                    <FolderOpen className="h-4 w-4 shrink-0 text-[var(--chat-text-secondary)]" />
                    <span className="flex-1 text-left">
                      {entitledFolderLabel
                        ? t('composer.chooseDifferentFolder', 'Choose a different folder')
                        : t('composer.chooseLocalFolder', 'Choose a local folder')}
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
