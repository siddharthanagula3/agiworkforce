'use client';

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Archive,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  Code2,
  GitBranch,
  ListChecks,
  FolderOpen,
  PanelLeft,
  PanelsTopLeft,
  Square,
  TerminalSquare,
  Minimize2,
  Trash2,
  X,
} from '@agiworkforce/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Spinner,
  useConfirmAction,
} from '@agiworkforce/ui';
import {
  CLOUD_CODE_DEFAULT_TURN_STEPS,
  CLOUD_CODE_TURN_STEP_BOUNDS,
  isCloudCodeTurnStepBound,
  type CloudCodeTurnStepBound,
} from '@agiworkforce/types';
import {
  DEVELOPER_AGENT_MODE_LABELS,
  DEVELOPER_CHILD_TASK_STATE_LABELS,
  DEVELOPER_TURN_LIMITS,
  developerEffortLadder,
  developerEffortLevels,
  nearestDeveloperEffort,
  type DeveloperChildTaskState,
  type DeveloperRuntimeModels,
  type LocalDeveloperSession,
  type DeveloperSessionGroup,
} from '@agiworkforce/local-runtime-contract';
import type {
  DeveloperChildTask,
  ThreadDeleteResponse,
  WorktreeCleanupFailure,
} from '@agiworkforce/types/protocol';
import {
  COMPOSER_FOLLOW_UP_INVERT_SHORTCUT,
  matchesShortcut,
  resolveFollowUpState,
} from '@agiworkforce/unified-chat';
import { isImeComposingKey } from '@agiworkforce/unified-chat/ime-composition';
import { AttachmentPreview } from '@features/chat/components/Composer/AttachmentPreview';
import { useAttachments } from '@features/chat/hooks/use-attachments';
import {
  CODE_AGENT_MODE_CYCLE_SHORTCUT,
  archiveDeveloperThread,
  deleteDeveloperThread,
  forkDeveloperThread,
  cancelDeveloperThreadSummary,
  compactDeveloperThread,
  openWorkspaceInEditor,
  useDeveloperCapabilities,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { getModelMetadata } from '@shared/config/llm';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { safePlatform } from '@shared/utils/browser-utils';
import {
  CODE_COPY,
  CODE_LIMITS,
  CODE_TURN_STEP_HINTS,
  continueLocalSessionInVsCodeHref,
  localSessionResumeCommand,
} from '../code-surface';
import {
  LOCAL_CODE_COPY,
  LOCAL_FAILURE_ACTION_LABELS,
  LOCAL_REVIEW_COMMAND,
  LOCAL_REVIEW_COPY,
  LOCAL_FILES_SHORTCUT,
  LOCAL_PANEL_COPY,
  LOCAL_REVIEW_SHORTCUT,
  LOCAL_TERMINAL_SHORTCUT,
  isLocalFilesShortcut,
  isLocalTerminalShortcut,
  isLocalReviewShortcut,
  localFolderName,
  localShortcutBadge,
  localArchiveSessionConsequence,
  localCleanupFailureRow,
  localCleanupFailuresLine,
  localDeleteSessionConsequence,
  localFailureAction,
  localModelChoices,
  localModelLabel,
  localModelSetup,
  localProviderSetups,
  localRetryPrompt,
  localSessionContext,
  localSkippedFilesLine,
  localTakeOverConsequence,
  startingModelId,
  localTranscriptItems,
  localTurnIsRunning,
  nextCycledAgentMode,
  type LocalFailureAction,
} from '../local-code';
import {
  useLocalSession,
  type LocalMessage,
  type LocalSessionState,
} from '../hooks/use-local-session';
import { useLocalReview } from '../hooks/use-local-review';
import { useLocalTests } from '../hooks/use-local-tests';
import { useLocalTurnOptions } from '../hooks/use-local-turn-options';
import { localSessionMemory } from '../local-session-memory';
import { runThreadSummary, useThreadSummarizing } from '../local-summaries';
import { UsageRing } from './CodeComposer';
import { LocalChangesPanel } from './LocalChangesPanel';
import { LocalTerminalDock } from './LocalTerminal';
import { LocalFilesPanel } from './LocalFilesPanel';
import { LocalExtensionsControl } from './LocalExtensionsControl';
import { LocalMemoryControl } from './LocalMemoryControl';
import { LocalModelChip } from './LocalModelChip';
import { LocalApprovalCard } from './LocalApprovalCard';
import { LocalQuestionCard } from './LocalQuestionCard';
import { LocalContextFileChips, LocalContextFilePicker } from './LocalContextFiles';
import { LocalListNotice } from './LocalListNotice';
import { LocalQueuedMessages } from './LocalQueuedMessages';
import { LocalReviewPane } from './LocalReviewPane';
import { LocalTurnChangesView } from './LocalTurnChangesView';
import { LocalTurnControls } from './LocalTurnControls';
import { CodeTranscriptBody } from './CodeTranscript';
import styles from '../CloudCodePage.module.css';

const HEADER_GLYPH_SIZE = 16;
const SEND_GLYPH_SIZE = 16;
const MODE_GLYPH_SIZE = 14;
const SUBMIT_KEY = 'Enter';
const IMAGE_TYPE_PREFIX = 'image/';
const MEGABYTE = 1_000_000;

const SUBAGENT_STATE_ORDER = Object.keys(
  DEVELOPER_CHILD_TASK_STATE_LABELS,
) as DeveloperChildTaskState[];

function subagentCounts(tasks: readonly DeveloperChildTask[]): string {
  return SUBAGENT_STATE_ORDER.map((state) => {
    const count = tasks.filter((task) => task.state === state).length;
    return count > 0 ? `${count} ${DEVELOPER_CHILD_TASK_STATE_LABELS[state].toLowerCase()}` : null;
  })
    .filter((part): part is string => part !== null)
    .join(' · ');
}

function LocalSubagents({ tasks }: { tasks: readonly DeveloperChildTask[] }) {
  if (tasks.length === 0) return null;
  const active = tasks.some(
    (task) =>
      task.state === 'running' || task.state === 'queued' || task.state === 'awaiting_input',
  );
  return (
    <details className={styles['notice']} data-testid="local-subagents" open={active}>
      <summary>
        Subagents ({tasks.length}) · {subagentCounts(tasks)}
      </summary>
      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id} id={`local-child-${task.id}`} data-state={task.state}>
            <span>{task.title}</span>
            <span className="text-muted-foreground">
              {' '}
              · {DEVELOPER_CHILD_TASK_STATE_LABELS[task.state]}
            </span>
            {task.state === 'paused' && (
              <p className="text-muted-foreground">
                Interrupted work is kept for review and will not restart on its own.
              </p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error(LOCAL_CODE_COPY.turnFailed));
    reader.onerror = () => reject(reader.error ?? new Error(LOCAL_CODE_COPY.turnFailed));
    reader.readAsDataURL(file);
  });
}

export interface LocalSessionPanelProps {
  session: LocalDeveloperSession;
  group: Pick<DeveloperSessionGroup, 'name' | 'branch' | 'sessions' | 'worktree'>;
  runtimeModels: DeveloperRuntimeModels | null;
  /** The models are the last ones read for this folder: the latest read failed. */
  modelsStale?: boolean;
  verbose: boolean;
  /** The task typed into the main composer, which opened this session. */
  initialPrompt?: string;
  onPromptSent?: () => void;
  /** The folder's session list changed under this panel, as when its worktree is removed. */
  onSessionsChanged?: () => void;
  /** Older worktrees the CLI could not archive while making this session's. */
  cleanupFailures?: readonly WorktreeCleanupFailure[];
  onDismissCleanupFailures?: () => void;
  /** The session was deleted, so the caller closes the panel and says what was kept. */
  onDeleted?: (outcome: ThreadDeleteResponse) => void;
  /** The session was archived, so the caller closes the panel and says how to bring it back. */
  onArchived?: () => void;
  /** A new session was branched from this one, so the caller opens it. */
  onForked?: (session: LocalDeveloperSession) => void;
  /**
   * The session's worktree was removed and the panel is closing, so the caller
   * shows the ref that holds what the worktree held where the user lands.
   */
  onWorktreeRemoved?: (snapshotRef: string) => void;
  onClose: () => void;
  onEditorDirtyChange?: (dirty: boolean) => void;
}

function LocalTurnStepsControl({
  turnSteps,
  disabled,
  onChange,
}: {
  turnSteps: CloudCodeTurnStepBound;
  disabled: boolean;
  onChange: (steps: CloudCodeTurnStepBound) => void;
}) {
  const label = `${turnSteps} ${CODE_COPY.turnStepsUnit}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={styles['controlButton']}
          aria-label={`${CODE_COPY.turnStepsMenu}: ${label}`}
          disabled={disabled}
        >
          <span>{label}</span>
          <ChevronDown size={MODE_GLYPH_SIZE} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-80">
        <DropdownMenuLabel>{CODE_COPY.turnStepsMenu}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(turnSteps)}
          onValueChange={(value) => {
            const bound = Number(value);
            if (isCloudCodeTurnStepBound(bound)) onChange(bound);
          }}
        >
          {CLOUD_CODE_TURN_STEP_BOUNDS.map((bound) => (
            <DropdownMenuRadioItem key={bound} value={String(bound)}>
              <span className={styles['menuRowLabel']}>
                <span className={styles['optionLabel']}>
                  {bound} {CODE_COPY.turnStepsUnit}
                </span>
                <span className={styles['optionHint']}>{CODE_TURN_STEP_HINTS[bound]}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A choice the agent asked for. Allow and Deny cannot carry an answer, so the
 * options are the buttons, and declining lets the agent go on without one.
 */
function QuestionPrompt({
  question,
  onAnswer,
  onSkip,
}: {
  question: { question: string; options: string[] };
  onAnswer: (option: string) => void;
  onSkip: () => void;
}) {
  return (
    <div
      className={`${styles['notice']} ${styles['questionPrompt']}`}
      role="group"
      aria-label={question.question}
    >
      <p className={styles['hintText']}>{question.question}</p>
      <div className={styles['questionOptions']}>
        {question.options.map((option) => (
          <button
            key={option}
            type="button"
            className={styles['secondaryButton']}
            onClick={() => onAnswer(option)}
          >
            {option}
          </button>
        ))}
        <button type="button" className={styles['secondaryButton']} onClick={onSkip}>
          {LOCAL_CODE_COPY.skipChoice}
        </button>
      </div>
    </div>
  );
}

function FailureAction({
  action,
  onRetry,
}: {
  action: NonNullable<LocalFailureAction>;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (action.kind === 'copy') {
    return (
      <button
        type="button"
        className={styles['secondaryButton']}
        onClick={() => {
          void navigator.clipboard.writeText(action.text).then(() => setCopied(true));
        }}
      >
        {copied ? LOCAL_FAILURE_ACTION_LABELS.copied : LOCAL_FAILURE_ACTION_LABELS.copy}
      </button>
    );
  }

  return (
    <button type="button" className={styles['secondaryButton']} onClick={onRetry}>
      {LOCAL_FAILURE_ACTION_LABELS.retry}
    </button>
  );
}

function CopyOffer({
  offer,
  className,
}: {
  offer: NonNullable<LocalFailureAction>;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (offer.kind !== 'copy') return null;

  return (
    <button
      type="button"
      className={className ?? styles['secondaryButton']}
      onClick={() => {
        void navigator.clipboard.writeText(offer.text).then(() => setCopied(true));
      }}
    >
      {copied ? LOCAL_FAILURE_ACTION_LABELS.copied : LOCAL_FAILURE_ACTION_LABELS.copy}
    </button>
  );
}

export function LocalSessionPanel({
  session,
  group,
  runtimeModels,
  modelsStale = false,
  verbose,
  initialPrompt,
  onPromptSent,
  onSessionsChanged,
  cleanupFailures = [],
  onDismissCleanupFailures,
  onDeleted,
  onArchived,
  onForked,
  onWorktreeRemoved,
  onClose,
  onEditorDirtyChange,
}: LocalSessionPanelProps) {
  const [model, setModel] = useState(session.model ?? '');
  const [loadsFinished, setLoadsFinished] = useState(0);
  const capabilities = useDeveloperCapabilities(loadsFinished);
  const remoteSsh = session.environment === 'ssh';
  const canChooseMode = !remoteSsh && capabilities.has('agent_mode');
  const canChooseEffort = capabilities.has('reasoning_effort');
  const canAttachFiles = !remoteSsh && capabilities.has('context_files');
  const canSteer = capabilities.has('steer');
  const canAnswerQuestions = capabilities.has('user_input');
  const canChooseDecision = !remoteSsh && capabilities.has('approval_decisions');
  const canRewind = !remoteSsh && capabilities.has('checkpoints');
  const canReview = canRewind && capabilities.has('review');
  const canDelete = !remoteSsh && onDeleted !== undefined && capabilities.has('thread_delete');
  const canArchive = onArchived !== undefined && capabilities.has('thread_archive');
  const canTakeOver = capabilities.has('thread_takeover');
  const canPasteImages = !remoteSsh && capabilities.has('images');
  const canFork = onForked !== undefined && !group.worktree && capabilities.has('thread_fork');
  const [forking, setForking] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);
  const [modeAnnouncement, setModeAnnouncement] = useState('');
  const canCompact = capabilities.has('thread_compact');
  const compacting = useThreadSummarizing(session.rootId, session.id);
  const cancelledSummary = useRef(false);
  const [cancellingSummary, setCancellingSummary] = useState(false);
  const [compactNotice, setCompactNotice] = useState<{ text: string; failed: boolean } | null>(
    null,
  );
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [turnSteps, setTurnSteps] = useState<CloudCodeTurnStepBound>(CLOUD_CODE_DEFAULT_TURN_STEPS);
  const boundedTurns = runtimeModels?.features?.maxTurns === true;
  const memoryAvailable = !remoteSsh && runtimeModels?.features?.memory === true;
  const options = useLocalTurnOptions(session.id, runtimeModels);
  const effortLadder = developerEffortLadder(capabilities.has('reasoning_effort_ladder'));
  const turnEffort =
    options.reasoningEffort === undefined
      ? undefined
      : nearestDeveloperEffort(options.reasoningEffort, effortLadder);
  const state = useLocalSession(session, {
    ...(model === '' || model === session.model ? {} : { model }),
    ...(canChooseMode ? { agentMode: options.agentMode } : {}),
    ...(canChooseEffort && turnEffort ? { reasoningEffort: turnEffort } : {}),
    ...(boundedTurns ? { maxTurns: turnSteps } : {}),
  });
  useEffect(() => {
    if (!state.loading) setLoadsFinished((count) => count + 1);
  }, [state.loading, session.id]);
  const followUpMode = useSettingsStore((settings) => settings.codeFollowUpQueueMode);
  const tests = useLocalTests(session.rootId);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [filesDirty, setFilesDirty] = useState(false);
  const [filesFocusKey, setFilesFocusKey] = useState(0);
  useEffect(() => {
    onEditorDirtyChange?.(editorDirty || filesDirty);
  }, [editorDirty, filesDirty, onEditorDirtyChange]);
  const closeFiles = (then?: () => void) => {
    const close = () => {
      setFilesDirty(false);
      setFilesOpen(false);
      then?.();
    };
    if (!filesDirty) {
      close();
      return;
    }
    confirm({
      title: LOCAL_CODE_COPY.discardEditsTitle,
      description: LOCAL_CODE_COPY.discardLocalEditsDescription,
      confirmLabel: LOCAL_CODE_COPY.discardFileEdits,
      onConfirm: close,
    });
  };
  const closeChanges = (then?: () => void) => {
    const close = () => {
      setEditorDirty(false);
      setChangesOpen(false);
      then?.();
    };
    if (!editorDirty) {
      close();
      return;
    }
    confirm({
      title: LOCAL_CODE_COPY.discardEditsTitle,
      description: LOCAL_CODE_COPY.discardLocalEditsDescription,
      confirmLabel: LOCAL_CODE_COPY.discardFileEdits,
      onConfirm: close,
    });
  };
  const vsCodeHref = continueLocalSessionInVsCodeHref(session);
  const resumeCommand = localSessionResumeCommand(session.id);
  const worktree = group.worktree ?? null;
  const [reviewRequested, setReviewOpen] = useState(false);
  const reviewOpen = canReview && reviewRequested;
  const toggleReview = () => {
    if (reviewOpen) {
      setReviewOpen(false);
      return;
    }
    if (changesOpen) closeChanges(() => setReviewOpen(true));
    else if (filesOpen) closeFiles(() => setReviewOpen(true));
    else setReviewOpen(true);
  };
  const toggleChanges = () => {
    if (changesOpen) {
      closeChanges();
      return;
    }
    const show = () => {
      setReviewOpen(false);
      setChangesOpen(true);
    };
    if (filesOpen) closeFiles(show);
    else show();
  };
  const openFiles = (focusSearch: boolean) => {
    const show = () => {
      setReviewOpen(false);
      setFilesOpen(true);
      if (focusSearch) setFilesFocusKey((key) => key + 1);
    };
    if (filesOpen) {
      if (focusSearch) setFilesFocusKey((key) => key + 1);
      return;
    }
    if (changesOpen) closeChanges(show);
    else show();
  };
  const toggleFiles = () => {
    if (filesOpen) closeFiles();
    else openFiles(false);
  };
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const sidePanelOpen = shortcutsOpen || changesOpen || filesOpen || reviewOpen;
  const toggleSidePanel = () => {
    if (!sidePanelOpen) {
      setShortcutsOpen(true);
      return;
    }
    const hide = () => {
      setShortcutsOpen(false);
      setReviewOpen(false);
    };
    if (changesOpen) closeChanges(hide);
    else if (filesOpen) closeFiles(hide);
    else hide();
  };
  const canUseTerminal = !remoteSsh;
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalMounted, setTerminalMounted] = useState(false);
  const [terminalRuns, setTerminalRuns] = useState(0);
  const [backgroundRuns, setBackgroundRuns] = useState(0);
  const toggleTerminal = () => {
    setTerminalMounted(true);
    setTerminalOpen((open) => !open);
  };
  const openTerminal = () => {
    setTerminalMounted(true);
    setTerminalOpen(true);
  };
  const toggleTerminalRef = useRef(toggleTerminal);
  toggleTerminalRef.current = toggleTerminal;
  useEffect(() => {
    if (!canUseTerminal) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isLocalTerminalShortcut(event, safePlatform.isMac())) return;
      event.preventDefault();
      toggleTerminalRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canUseTerminal]);
  const isMac = safePlatform.isMac();
  const terminalBadge = localShortcutBadge(LOCAL_TERMINAL_SHORTCUT, isMac);
  const panelShortcuts = [
    ...(canReview
      ? [
          {
            id: 'review',
            label: LOCAL_PANEL_COPY.review,
            icon: GitBranch,
            badge: localShortcutBadge(LOCAL_REVIEW_SHORTCUT, isMac),
            onSelect: toggleReview,
          },
        ]
      : []),
    ...(canUseTerminal
      ? [
          {
            id: 'terminal',
            label: LOCAL_PANEL_COPY.terminal,
            icon: TerminalSquare,
            badge: terminalBadge,
            onSelect: openTerminal,
          },
          {
            id: 'files',
            label: LOCAL_PANEL_COPY.files,
            icon: FolderOpen,
            badge: localShortcutBadge(LOCAL_FILES_SHORTCUT, isMac),
            onSelect: () => openFiles(false),
          },
        ]
      : []),
  ];
  const showShortcuts = shortcutsOpen && !changesOpen && !filesOpen && !reviewOpen;
  const folder = localFolderName(session.cwd, group.name);
  const toggleReviewRef = useRef(toggleReview);
  toggleReviewRef.current = toggleReview;
  const openFilesRef = useRef(openFiles);
  openFilesRef.current = openFiles;
  const review = useLocalReview(
    session,
    worktree,
    reviewOpen,
    {
      onRewound: (restore, turnId) => {
        if (restore !== 'code') restorePrompt(turnId);
        void state.reload();
      },
      onWorktreeRemoved: (snapshotRef) => {
        onSessionsChanged?.();
        onWorktreeRemoved?.(snapshotRef);
        onClose();
      },
      onSummarized: () => void state.reload(),
    },
    {
      canChooseRestore: capabilities.has('rewind_choice'),
      canSummarize: capabilities.has('thread_compact'),
    },
  );

  useEffect(() => {
    if (!canReview) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isLocalReviewShortcut(event)) return;
      event.preventDefault();
      toggleReviewRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canReview]);

  useEffect(() => {
    if (remoteSsh) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isLocalFilesShortcut(event)) return;
      event.preventDefault();
      openFilesRef.current(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [remoteSsh]);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const testsRunning = tests.status === 'running';
  const memory = localSessionMemory(session.rootId, session.id);
  const [draft, setDraft] = useState(() => memory.draft);
  const [contextFiles, setContextFiles] = useState<string[]>(() => memory.contextFiles);
  useEffect(() => {
    memory.draft = draft;
    memory.contextFiles = contextFiles;
  }, [memory, draft, contextFiles]);
  const submitting = useRef(false);
  const restorePrompt = (turnId: string) => {
    const prompt = state.messages.find(
      (message) => message.role === 'user' && message.turnId === turnId,
    );
    if (prompt) setDraft((current) => (current.trim() === '' ? prompt.text : current));
  };
  const [focused, setFocused] = useState(false);
  const images = useAttachments({
    maxFiles: DEVELOPER_TURN_LIMITS.images,
    maxFileSize: DEVELOPER_TURN_LIMITS.imageBytes,
    onError: setComposerNotice,
  });
  // One press is one send: reading pictures is awaited before the composer is
  // cleared, so the press stays claimed until the cleared composer has rendered.
  const attached = images.attachments;
  useEffect(() => {
    submitting.current = false;
  }, [draft, attached]);
  const endRef = useRef<HTMLDivElement>(null);
  const choices = localModelChoices(runtimeModels, group.sessions);
  const setups = localProviderSetups(runtimeModels);
  const preferredModel = startingModelId(runtimeModels, group.sessions);
  const activeModel = model === '' ? (preferredModel ?? '') : model;
  const activeSetup = localModelSetup(runtimeModels, model === '' ? session.model : model);
  const readyModel = preferredModel;

  const running = localTurnIsRunning(state.turn);
  const busy = running || state.sending;
  const hasDraft = draft.trim() !== '' || images.attachments.length > 0;
  const [firstApproval] = state.approvals;
  const [firstQuestion] = state.questions;
  const items = localTranscriptItems(state.messages, state.turn);
  const failureAction = state.turn.failure ? localFailureAction(state.turn.failure) : null;
  const retryPrompt = localRetryPrompt(state.turn, state.messages);
  const queueKeys = (event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (event.key === 'Escape' && running && !state.stopping) {
      void state.stop();
      return true;
    }
    if (event.key !== 'ArrowUp' || draft !== '' || state.queued.length === 0) return false;
    const recalled = state.recallQueued(draft);
    if (!recalled) return false;
    setDraft(recalled.text);
    if (canAttachFiles && recalled.contextFiles.length > 0) {
      setContextFiles((current) => [...new Set([...current, ...recalled.contextFiles])]);
    }
    return true;
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items.length, state.turn.reply]);

  const opening = useRef<{ send: LocalSessionState['send']; sent: () => void }>({
    send: state.send,
    sent: () => undefined,
  });
  opening.current = { send: state.send, sent: onPromptSent ?? (() => undefined) };

  useEffect(() => {
    const text = initialPrompt?.trim() ?? '';
    if (text === '') return;
    opening.current.sent();
    void opening.current.send(text);
  }, [session.id, initialPrompt]);

  const { leaveBypass } = options;
  useEffect(() => {
    if (state.bypassDeclines > 0) leaveBypass();
  }, [state.bypassDeclines, leaveBypass]);

  const sendOrRestore = async (message: string | LocalMessage, pictures: File[] = []) => {
    if ((await state.send(message)) !== 'declined') return;
    const text = typeof message === 'string' ? message : message.text;
    const files = typeof message === 'string' ? [] : message.contextFiles;
    setDraft((current) => (current.trim() === '' ? text : current));
    if (files.length > 0) setContextFiles((current) => [...new Set([...current, ...files])]);
    if (pictures.length > 0) images.addFiles(pictures);
    setComposerNotice(LOCAL_CODE_COPY.bypassDeclined);
  };

  const submit = async (invert: boolean) => {
    if (submitting.current || !hasDraft || state.sending || images.preparing) return;
    submitting.current = true;
    let dataUrls: string[];
    try {
      dataUrls = await Promise.all(images.attachments.map(fileDataUrl));
    } catch (cause: unknown) {
      submitting.current = false;
      setComposerNotice(toUserMessage(cause, LOCAL_CODE_COPY.turnFailed));
      return;
    }
    const message: LocalMessage = {
      text: draft.trim(),
      images: dataUrls,
      contextFiles: canAttachFiles ? contextFiles : [],
    };
    const pictures = images.attachments;
    setDraft('');
    setContextFiles([]);
    images.clearAll();
    setComposerNotice(null);
    if (!running) {
      void sendOrRestore(message, pictures);
      return;
    }
    const steering =
      resolveFollowUpState(followUpMode, invert, canSteer && message.contextFiles.length === 0) ===
      'steering';
    if (steering) void state.steer(message);
    else state.enqueue(message);
  };

  const pasteImages = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    if (!canPasteImages) {
      setComposerNotice(LOCAL_CODE_COPY.imagesNeedUpdate);
      return;
    }
    const pictures = files.filter((file) => file.type.startsWith(IMAGE_TYPE_PREFIX));
    if (pictures.length < files.length) setComposerNotice(LOCAL_CODE_COPY.imagesOnly);
    if (pictures.length === 0) return;
    if (images.attachments.length + pictures.length > DEVELOPER_TURN_LIMITS.images) {
      setComposerNotice(LOCAL_CODE_COPY.tooManyImages(DEVELOPER_TURN_LIMITS.images));
      return;
    }
    if (pictures.some((file) => file.size > DEVELOPER_TURN_LIMITS.imageBytes)) {
      setComposerNotice(
        LOCAL_CODE_COPY.imageTooLarge(`${DEVELOPER_TURN_LIMITS.imageBytes / MEGABYTE} MB`),
      );
      return;
    }
    images.addFiles(pictures);
  };

  const sendTextToAgent = (text: string) => {
    const message: LocalMessage = { text, images: [], contextFiles: [] };
    if (running) state.enqueue(message);
    else void sendOrRestore(message);
  };

  const requestReview = () => {
    if (busy) return;
    void sendOrRestore(LOCAL_REVIEW_COMMAND);
  };

  const forkFrom = async (turnId: string) => {
    setForking(true);
    setForkError(null);
    try {
      onForked?.(
        await forkDeveloperThread({
          rootId: session.rootId,
          threadId: session.id,
          throughTurnId: turnId,
        }),
      );
    } catch (cause: unknown) {
      setForkError(toUserMessage(cause, LOCAL_CODE_COPY.forkFailed));
    } finally {
      setForking(false);
    }
  };

  const steersByDefault =
    resolveFollowUpState(
      followUpMode,
      false,
      canSteer && !(canAttachFiles && contextFiles.length > 0),
    ) === 'steering';
  const followUpLabel = steersByDefault ? LOCAL_CODE_COPY.steer : LOCAL_CODE_COPY.queue;
  const placeholder = !running
    ? LOCAL_CODE_COPY.composerPlaceholder
    : steersByDefault
      ? LOCAL_CODE_COPY.steerPlaceholder
      : LOCAL_CODE_COPY.queuePlaceholder;

  return (
    <>
      <header className={styles['header']}>
        <button
          type="button"
          className={styles['headerButton']}
          aria-label={LOCAL_CODE_COPY.back}
          onClick={onClose}
        >
          <ChevronLeft size={HEADER_GLYPH_SIZE} aria-hidden="true" />
        </button>
        <span className={styles['headerGlyph']}>
          <TerminalSquare size={HEADER_GLYPH_SIZE} aria-hidden="true" />
        </span>
        <h1 className={styles['headerTitle']}>{session.title}</h1>
        <span className={styles['headerChip']}>
          <span className={styles['headerChipText']}>{localSessionContext(session, group)}</span>
        </span>
        <div className={styles['headerActions']}>
          <LocalExtensionsControl rootId={session.rootId} />
          {memoryAvailable && <LocalMemoryControl rootId={session.rootId} />}
          {!remoteSsh && (
            <button
              type="button"
              className={`${styles['headerButton']} ${filesOpen ? styles['headerButtonActive'] : ''}`}
              aria-label={LOCAL_CODE_COPY.files}
              aria-pressed={filesOpen}
              aria-keyshortcuts="Control+P Meta+P"
              title={LOCAL_CODE_COPY.filesShortcut}
              onClick={toggleFiles}
            >
              <FolderOpen size={HEADER_GLYPH_SIZE} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className={`${styles['headerButton']} ${changesOpen ? styles['headerButtonActive'] : ''}`}
            aria-label={CODE_COPY.changes}
            aria-pressed={changesOpen}
            title={CODE_COPY.changes}
            onClick={toggleChanges}
          >
            <PanelsTopLeft size={HEADER_GLYPH_SIZE} aria-hidden="true" />
          </button>
          {canReview && (
            <button
              type="button"
              className={`${styles['headerButton']} ${reviewOpen ? styles['headerButtonActive'] : ''}`}
              aria-label={reviewOpen ? LOCAL_REVIEW_COPY.close : LOCAL_REVIEW_COPY.open}
              aria-pressed={reviewOpen}
              aria-keyshortcuts="Control+Shift+G Meta+Shift+G"
              title={LOCAL_REVIEW_COPY.shortcut}
              onClick={toggleReview}
            >
              <GitBranch size={HEADER_GLYPH_SIZE} aria-hidden="true" />
            </button>
          )}
          {!remoteSsh && (
            <button
              type="button"
              className={`${styles['headerButton']} ${testsRunning ? styles['headerButtonActive'] : ''}`}
              aria-label={testsRunning ? LOCAL_CODE_COPY.stopTests : LOCAL_CODE_COPY.runTests}
              title={testsRunning ? LOCAL_CODE_COPY.stopTests : LOCAL_CODE_COPY.runTests}
              onClick={() => (testsRunning ? tests.stop() : void tests.run())}
            >
              {testsRunning ? (
                <Spinner size="sm" aria-hidden="true" />
              ) : (
                <ListChecks size={HEADER_GLYPH_SIZE} aria-hidden="true" />
              )}
            </button>
          )}
          {!remoteSsh && (
            <button
              type="button"
              className={styles['headerButton']}
              aria-label={LOCAL_CODE_COPY.openInEditor}
              title={LOCAL_CODE_COPY.openInEditor}
              onClick={() => {
                setEditorError(null);
                openWorkspaceInEditor(session.rootId).catch((cause: unknown) =>
                  setEditorError(toUserMessage(cause, LOCAL_CODE_COPY.editorFailed)),
                );
              }}
            >
              <Code2 size={HEADER_GLYPH_SIZE} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className={`${styles['headerButton']} ${handoffOpen ? styles['headerButtonActive'] : ''}`}
            aria-label={CODE_COPY.continueElsewhere}
            aria-expanded={handoffOpen}
            aria-controls="local-session-handoff"
            title={CODE_COPY.continueElsewhere}
            onClick={() => setHandoffOpen((open) => !open)}
          >
            <ArrowRight size={HEADER_GLYPH_SIZE} aria-hidden="true" />
          </button>
          {canCompact && (
            <button
              type="button"
              className={styles['headerButton']}
              aria-label={LOCAL_CODE_COPY.compactSession}
              title={
                running
                  ? LOCAL_CODE_COPY.compactSessionWhileRunning
                  : LOCAL_CODE_COPY.compactSession
              }
              disabled={busy || compacting}
              onClick={() => {
                setCompactNotice(null);
                confirm({
                  title: LOCAL_CODE_COPY.compactTitle,
                  description: LOCAL_CODE_COPY.compactBody,
                  confirmLabel: LOCAL_CODE_COPY.compactConfirm,
                  destructive: true,
                  onConfirm: () => {
                    cancelledSummary.current = false;
                    void runThreadSummary(session.rootId, session.id, () =>
                      compactDeveloperThread({
                        rootId: session.rootId,
                        threadId: session.id,
                      }),
                    )
                      .then((outcome) => {
                        setCompactNotice({
                          text: outcome.compacted
                            ? LOCAL_CODE_COPY.compacted(outcome.tokensBefore, outcome.tokensAfter)
                            : LOCAL_CODE_COPY.compactNothing,
                          failed: false,
                        });
                        if (outcome.compacted) void state.reload();
                      })
                      .catch((cause: unknown) => {
                        if (cancelledSummary.current) return;
                        setCompactNotice({
                          text: toUserMessage(cause, LOCAL_CODE_COPY.compactFailed),
                          failed: true,
                        });
                      });
                  },
                });
              }}
            >
              {compacting ? (
                <Spinner size="sm" aria-hidden="true" />
              ) : (
                <Minimize2 size={HEADER_GLYPH_SIZE} aria-hidden="true" />
              )}
            </button>
          )}
          {canArchive && (
            <button
              type="button"
              className={styles['headerButton']}
              aria-label={LOCAL_CODE_COPY.archiveSession}
              title={
                running
                  ? LOCAL_CODE_COPY.archiveSessionWhileRunning
                  : LOCAL_CODE_COPY.archiveSession
              }
              disabled={busy}
              onClick={() => {
                setDeleteError(null);
                confirm({
                  title: LOCAL_CODE_COPY.archiveSessionTitle,
                  description: localArchiveSessionConsequence(session.title, session.id),
                  confirmLabel: LOCAL_CODE_COPY.archiveSessionConfirm,
                  onConfirm: async () => {
                    try {
                      await archiveDeveloperThread(session.rootId, session.id);
                      onArchived?.();
                    } catch (cause: unknown) {
                      setDeleteError(toUserMessage(cause, LOCAL_CODE_COPY.archiveFailed));
                    }
                  },
                });
              }}
            >
              <Archive size={HEADER_GLYPH_SIZE} aria-hidden="true" />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className={styles['headerButton']}
              aria-label={LOCAL_CODE_COPY.deleteSession}
              title={
                running ? LOCAL_CODE_COPY.deleteSessionWhileRunning : LOCAL_CODE_COPY.deleteSession
              }
              disabled={busy}
              onClick={() => {
                setDeleteError(null);
                confirm({
                  title: LOCAL_CODE_COPY.deleteSessionTitle,
                  description: localDeleteSessionConsequence(session.title),
                  confirmLabel: LOCAL_CODE_COPY.deleteSessionConfirm,
                  destructive: true,
                  onConfirm: async () => {
                    try {
                      onDeleted?.(
                        await deleteDeveloperThread({
                          rootId: session.rootId,
                          threadId: session.id,
                        }),
                      );
                    } catch (cause: unknown) {
                      setDeleteError(toUserMessage(cause, LOCAL_CODE_COPY.deleteFailed));
                    }
                  },
                });
              }}
            >
              <Trash2 size={HEADER_GLYPH_SIZE} aria-hidden="true" />
            </button>
          )}
          {canUseTerminal && (
            <button
              type="button"
              className={`${styles['headerButton']} ${terminalOpen ? styles['headerButtonActive'] : ''}`}
              aria-label={LOCAL_PANEL_COPY.bottomPanel}
              aria-pressed={terminalOpen}
              aria-keyshortcuts="Control+`"
              title={`${LOCAL_PANEL_COPY.bottomPanel} (${terminalBadge})`}
              onClick={toggleTerminal}
            >
              <PanelLeft
                size={HEADER_GLYPH_SIZE}
                className={styles['glyphPanelBottom']}
                aria-hidden="true"
              />
            </button>
          )}
          {panelShortcuts.length > 0 && (
            <button
              type="button"
              className={`${styles['headerButton']} ${sidePanelOpen ? styles['headerButtonActive'] : ''}`}
              aria-label={LOCAL_PANEL_COPY.rightPanel}
              aria-pressed={sidePanelOpen}
              title={LOCAL_PANEL_COPY.rightPanel}
              onClick={toggleSidePanel}
            >
              <PanelLeft
                size={HEADER_GLYPH_SIZE}
                className={styles['glyphPanelRight']}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      </header>

      <div className={styles['body']}>
        <div className={styles['column']}>
          <div className={styles['scroll']} data-testid="local-code-scroll">
            <div className={styles['center']}>
              {state.loading && (
                <div className={styles['notice']} role="status">
                  <Spinner size="sm" aria-label={LOCAL_CODE_COPY.openingSession} />
                  <span>{LOCAL_CODE_COPY.openingSession}</span>
                </div>
              )}

              {state.truncated && (
                <p className={styles['statusLine']}>{LOCAL_CODE_COPY.transcriptTruncated}</p>
              )}

              {!state.loading && (
                <CodeTranscriptBody
                  items={items}
                  approvals={[]}
                  busy={busy}
                  busySince={running ? session.updatedAt : null}
                  verbose={verbose}
                  onDecideApproval={() => undefined}
                  onRetryTask={(goal) => void sendOrRestore(goal)}
                  onRewindTask={running || !canRewind ? undefined : review.rewindById}
                  rewindLabel={LOCAL_REVIEW_COPY.rewindHere}
                  onForkTask={
                    busy || forking || !canFork ? undefined : (turnId) => void forkFrom(turnId)
                  }
                  forkLabel={LOCAL_CODE_COPY.forkHere}
                  forkDescription={LOCAL_CODE_COPY.forkHereLabel}
                />
              )}

              {state.changes !== null && <LocalTurnChangesView changes={state.changes} />}

              {canAnswerQuestions && firstQuestion !== undefined && (
                <LocalQuestionCard
                  key={firstQuestion.requestId}
                  question={firstQuestion}
                  waiting={state.questions.length - 1}
                  onAnswer={state.answerQuestion}
                />
              )}

              {firstApproval !== undefined &&
                (firstApproval.question ? (
                  <QuestionPrompt
                    key={firstApproval.requestId}
                    question={firstApproval.question}
                    onAnswer={(option) =>
                      void state.decideApproval(firstApproval, 'approve_once', option)
                    }
                    onSkip={() => void state.decideApproval(firstApproval, 'deny')}
                  />
                ) : (
                  <LocalApprovalCard
                    key={firstApproval.requestId}
                    approval={firstApproval}
                    folder={session.cwd || group.name}
                    waiting={state.approvals.length - 1}
                    allDecisions={canChooseDecision}
                    onDecide={state.decideApproval}
                  />
                ))}

              {failureAction && (failureAction.kind !== 'retry' || retryPrompt !== null) && (
                <FailureAction
                  action={failureAction}
                  onRetry={() => {
                    if (retryPrompt !== null) void sendOrRestore(retryPrompt);
                  }}
                />
              )}

              <div ref={endRef} />
            </div>
          </div>

          <div className={styles['noticeArea']}>
            <div className={styles['center']}>
              {modelsStale && (
                <div className={styles['notice']} role="status">
                  <span className={styles['hintText']}>{LOCAL_CODE_COPY.modelsStale}</span>
                </div>
              )}

              {activeSetup !== null && (
                <div className={styles['notice']} role="status">
                  <span className={styles['hintText']}>
                    {LOCAL_CODE_COPY.modelNeedsSetup(
                      localModelLabel(model === '' ? session.model : model) ?? activeSetup.label,
                      activeSetup.label,
                    )}
                  </span>
                  {activeSetup.offer !== null && <CopyOffer offer={activeSetup.offer} />}
                  {readyModel !== undefined && (
                    <button
                      type="button"
                      className={styles['secondaryButton']}
                      onClick={() => setModel(readyModel)}
                    >
                      {LOCAL_CODE_COPY.switchToReadyModel}
                    </button>
                  )}
                </div>
              )}

              {remoteSsh && (
                <div className={styles['notice']} role="status">
                  This session runs over SSH in Ask mode. Review files and run tests through the
                  agent. The host file editor and interactive terminal are unavailable.
                </div>
              )}

              {state.error !== null && (
                <div className={styles['notice']} role="alert">
                  <span>{state.error}</span>
                </div>
              )}

              {state.heldBy !== null && (
                <div className={styles['notice']} role="alert" data-testid="local-session-held">
                  <span>
                    {canTakeOver
                      ? LOCAL_CODE_COPY.heldElsewhere(state.heldBy)
                      : LOCAL_CODE_COPY.heldElsewhereNeedsUpdate(state.heldBy)}
                  </span>
                  {canTakeOver && (
                    <span className={styles['noticeActions']}>
                      <button
                        type="button"
                        className={styles['secondaryButton']}
                        onClick={() => {
                          const holder = state.heldBy;
                          if (holder === null) return;
                          confirm({
                            title: LOCAL_CODE_COPY.takeOverTitle,
                            description: localTakeOverConsequence(holder),
                            confirmLabel: LOCAL_CODE_COPY.takeOverConfirm,
                            onConfirm: state.takeOver,
                          });
                        }}
                      >
                        {LOCAL_CODE_COPY.takeOver}
                      </button>
                    </span>
                  )}
                </div>
              )}

              {!reviewOpen && review.error !== null && (
                <div className={styles['notice']} role="alert">
                  <span>{review.error}</span>
                </div>
              )}

              {!reviewOpen && review.notice && (
                <div className={styles['notice']} role="status">
                  <span>{review.notice}</span>
                </div>
              )}

              {!reviewOpen && review.skipped.length > 0 && (
                <LocalListNotice
                  line={localSkippedFilesLine(review.skipped.length)}
                  summary={LOCAL_REVIEW_COPY.skippedFilesList}
                  items={review.skipped}
                />
              )}

              {cleanupFailures.length > 0 && (
                <LocalListNotice
                  line={localCleanupFailuresLine(cleanupFailures)}
                  summary={LOCAL_CODE_COPY.cleanupFailuresList}
                  items={cleanupFailures.map(localCleanupFailureRow)}
                  testId="local-cleanup-failures"
                  actions={
                    onDismissCleanupFailures && (
                      <button
                        type="button"
                        className={styles['secondaryButton']}
                        onClick={onDismissCleanupFailures}
                      >
                        <X size={SEND_GLYPH_SIZE} aria-hidden="true" />
                        {LOCAL_CODE_COPY.dismiss}
                      </button>
                    )
                  }
                />
              )}

              {[state.notice, composerNotice]
                .filter((line): line is string => line !== null)
                .map((line) => (
                  <div key={line} className={styles['notice']} role="status">
                    <span>{line}</span>
                  </div>
                ))}

              <LocalSubagents tasks={state.childTasks} />

              <LocalQueuedMessages
                queued={state.queued}
                paused={state.queuePaused}
                onUpdate={state.updateQueued}
                onRemove={state.removeQueued}
                onSendNow={(id) => void state.sendQueuedNow(id)}
              />

              {handoffOpen && (
                <div
                  id="local-session-handoff"
                  className={styles['notice']}
                  role="group"
                  aria-label={CODE_COPY.continueElsewhere}
                >
                  <div className={styles['testsNoticeBody']}>
                    <span>{CODE_COPY.resumeInTerminal}</span>
                    <pre>{resumeCommand}</pre>
                    <div className={styles['noticeActions']}>
                      <CopyOffer offer={{ kind: 'copy', text: resumeCommand }} />
                      {vsCodeHref !== null && (
                        <a className={styles['secondaryButton']} href={vsCodeHref}>
                          <ArrowRight size={HEADER_GLYPH_SIZE} aria-hidden="true" />
                          <span>{CODE_COPY.continueInVsCode}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {editorError !== null && (
                <div className={styles['notice']} role="alert">
                  <span>{editorError}</span>
                </div>
              )}

              {deleteError !== null && (
                <div className={styles['notice']} role="alert">
                  <span>{deleteError}</span>
                </div>
              )}

              {compacting && (
                <div className={styles['notice']} role="status">
                  <Spinner size="sm" aria-hidden="true" />
                  <span>{LOCAL_CODE_COPY.compactRunning}</span>
                  <button
                    type="button"
                    className={styles['secondaryButton']}
                    disabled={cancellingSummary}
                    onClick={() => {
                      cancelledSummary.current = true;
                      setCancellingSummary(true);
                      cancelDeveloperThreadSummary(session.rootId, session.id)
                        .then(() =>
                          setCompactNotice({
                            text: LOCAL_CODE_COPY.compactCancelled,
                            failed: false,
                          }),
                        )
                        .catch(() => {
                          cancelledSummary.current = false;
                          setCompactNotice({
                            text: LOCAL_CODE_COPY.compactCancelFailed,
                            failed: true,
                          });
                        })
                        .finally(() => setCancellingSummary(false));
                    }}
                  >
                    {LOCAL_CODE_COPY.compactCancel}
                  </button>
                </div>
              )}

              {compactNotice !== null && (
                <div className={styles['notice']} role={compactNotice.failed ? 'alert' : 'status'}>
                  <span>{compactNotice.text}</span>
                </div>
              )}

              {forkError !== null && (
                <div className={styles['notice']} role="alert">
                  <span>{forkError}</span>
                </div>
              )}

              {(testsRunning || tests.message !== null) && (
                <div
                  className={styles['notice']}
                  role={tests.status === 'failed' ? 'alert' : 'status'}
                  data-testid="local-tests-notice"
                >
                  <div className={styles['testsNoticeBody']}>
                    <span>
                      {testsRunning && tests.command !== null
                        ? LOCAL_CODE_COPY.runningTests(tests.command)
                        : tests.message}
                    </span>
                    {tests.output !== '' && (
                      <details>
                        <summary>{LOCAL_CODE_COPY.testOutput}</summary>
                        <pre className={styles['activityOutput']}>{tests.output}</pre>
                      </details>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles['composerArea']} data-testid="local-code-composer">
            <div className={styles['center']}>
              <div className={`${styles['field']} ${focused ? styles['fieldFocused'] : ''}`}>
                {images.previews.length > 0 && (
                  <AttachmentPreview previews={images.previews} onRemove={images.removeFile} />
                )}
                {canAttachFiles && (
                  <LocalContextFileChips
                    files={contextFiles}
                    onRemove={(path) =>
                      setContextFiles((current) => current.filter((file) => file !== path))
                    }
                  />
                )}
                <div className={styles['fieldRow']}>
                  <textarea
                    className={styles['input']}
                    value={draft}
                    rows={1}
                    maxLength={CODE_LIMITS.task}
                    placeholder={placeholder}
                    aria-label={placeholder}
                    onChange={(event) => setDraft(event.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onPaste={pasteImages}
                    onKeyDown={(event) => {
                      if (isImeComposingKey(event.nativeEvent)) return;
                      if (
                        canChooseMode &&
                        !state.sending &&
                        matchesShortcut(event, CODE_AGENT_MODE_CYCLE_SHORTCUT, safePlatform.isMac())
                      ) {
                        event.preventDefault();
                        const next = nextCycledAgentMode(options.agentMode);
                        options.chooseMode(next);
                        setModeAnnouncement(
                          LOCAL_CODE_COPY.agentModeNow(DEVELOPER_AGENT_MODE_LABELS[next]),
                        );
                        return;
                      }
                      if (queueKeys(event)) {
                        event.preventDefault();
                        return;
                      }
                      if (event.key !== SUBMIT_KEY) return;
                      const invert = matchesShortcut(
                        event,
                        COMPOSER_FOLLOW_UP_INVERT_SHORTCUT,
                        safePlatform.isMac(),
                      );
                      if (event.shiftKey && !invert) return;
                      event.preventDefault();
                      void submit(invert);
                    }}
                  />
                  {running && hasDraft && (
                    <button
                      type="button"
                      className={styles['sendButton']}
                      disabled={images.preparing}
                      aria-label={followUpLabel}
                      title={followUpLabel}
                      onClick={() => void submit(false)}
                    >
                      <ArrowUp size={SEND_GLYPH_SIZE} aria-hidden="true" />
                    </button>
                  )}
                  {running ? (
                    <button
                      type="button"
                      className={styles['sendButton']}
                      disabled={state.stopping}
                      aria-label={state.stopping ? LOCAL_CODE_COPY.stopping : LOCAL_CODE_COPY.stop}
                      aria-keyshortcuts="Escape"
                      title={LOCAL_CODE_COPY.stopShortcut}
                      onClick={() => void state.stop()}
                    >
                      {state.stopping ? (
                        <Spinner size="sm" aria-hidden="true" />
                      ) : (
                        <Square size={SEND_GLYPH_SIZE} aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles['sendButton']}
                      disabled={!hasDraft || busy || images.preparing}
                      aria-label={LOCAL_CODE_COPY.send}
                      onClick={() => void submit(false)}
                    >
                      {state.sending ? (
                        <Spinner size="sm" aria-hidden="true" />
                      ) : (
                        <ArrowUp size={SEND_GLYPH_SIZE} aria-hidden="true" />
                      )}
                    </button>
                  )}
                </div>

                <div className={styles['controlRow']}>
                  {canAttachFiles && (
                    <LocalContextFilePicker
                      rootId={session.rootId}
                      files={contextFiles}
                      disabled={state.sending}
                      full={contextFiles.length >= DEVELOPER_TURN_LIMITS.contextFiles}
                      onAdd={(path) =>
                        setContextFiles((current) =>
                          current.includes(path) ? current : [...current, path],
                        )
                      }
                    />
                  )}
                  {choices.length > 0 && (
                    <LocalModelChip
                      choices={choices}
                      setups={setups}
                      selected={activeModel}
                      unreachable={activeSetup !== null}
                      disabled={busy}
                      onSelect={setModel}
                    />
                  )}
                  <LocalTurnControls
                    agentMode={options.agentMode}
                    reasoningEffort={turnEffort}
                    effortLevels={developerEffortLevels(activeModel, effortLadder) ?? effortLadder}
                    showMode={canChooseMode}
                    showEffort={canChooseEffort}
                    disabled={state.sending}
                    onModeChange={options.chooseMode}
                    onEffortChange={options.chooseEffort}
                  />
                  {boundedTurns && (
                    <LocalTurnStepsControl
                      turnSteps={turnSteps}
                      disabled={state.sending}
                      onChange={setTurnSteps}
                    />
                  )}
                  <span className={styles['controlSpacer']} />
                  <UsageRing
                    contextTokens={state.contextTokens}
                    contextWindow={getModelMetadata(activeModel)?.contextWindow ?? null}
                  />
                  <span className="sr-only" role="status">
                    {modeAnnouncement}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        {!reviewOpen && review.dialog}
        {confirmDialog}
        {changesOpen && (
          <LocalChangesPanel
            rootId={session.rootId}
            title={session.title}
            refreshKey={state.messages.length + terminalRuns}
            runningCommandsKey={backgroundRuns}
            sessionBusy={busy}
            onReview={requestReview}
            onClose={() => {
              setEditorDirty(false);
              setChangesOpen(false);
            }}
            onDirtyChange={setEditorDirty}
            onSendToAgent={sendTextToAgent}
          />
        )}
        {filesOpen && (
          <LocalFilesPanel
            rootId={session.rootId}
            searchFocusKey={filesFocusKey}
            onClose={() => {
              setFilesDirty(false);
              setFilesOpen(false);
            }}
            onDirtyChange={setFilesDirty}
          />
        )}
        {reviewOpen && (
          <LocalReviewPane
            review={review}
            worktree={worktree}
            onClose={() => setReviewOpen(false)}
            onSendComments={sendTextToAgent}
          />
        )}
        {showShortcuts && (
          <aside className={styles['panelShortcuts']} aria-label={LOCAL_PANEL_COPY.shortcuts}>
            <ul className={styles['panelShortcutList']}>
              {panelShortcuts.map((shortcut) => (
                <li key={shortcut.id}>
                  <button
                    type="button"
                    className={styles['panelShortcutRow']}
                    onClick={shortcut.onSelect}
                  >
                    <shortcut.icon size={HEADER_GLYPH_SIZE} aria-hidden="true" />
                    <span className={styles['panelShortcutLabel']}>{shortcut.label}</span>
                    <kbd className={styles['panelShortcutBadge']}>{shortcut.badge}</kbd>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
      {canUseTerminal && terminalMounted && (
        <LocalTerminalDock
          rootId={session.rootId}
          folder={folder}
          open={terminalOpen}
          onClose={() => setTerminalOpen(false)}
          onCommandFinished={() => setTerminalRuns((count) => count + 1)}
          onBackgroundStarted={() => setBackgroundRuns((count) => count + 1)}
        />
      )}
    </>
  );
}
