'use client';

import {
  Fragment,
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { useConfirmAction } from '@agiworkforce/ui';
import type {
  DeveloperWorktree,
  DeveloperWorktreeSetupScript,
  LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';
import type {
  CheckpointDiffResponse,
  CheckpointListResponse,
  CheckpointSection,
  ThreadRevertRestore,
  TurnCheckpointSummary,
} from '@agiworkforce/types/protocol';
import { compactDeveloperThread, onDeveloperSessionEvent } from '@/features/desktop-host';
import { runThreadSummary } from '../local-summaries';
import { toUserMessage } from '@/lib/user-error-message';
import {
  LOCAL_REVIEW_COPY,
  localApplyConsequence,
  localRemoveWorktreeConsequence,
  localRestoreConsequence,
  localRestored,
  localRevertConsequence,
  localRewindConsequence,
  localRewindSkippedConsequence,
} from '../local-code';
import { LocalRewindChooser, type LocalRewindTarget } from '../components/LocalRewindChooser';
import {
  applyLocalWorktree,
  deleteLocalWorktree,
  listLocalCheckpoints,
  pinLocalWorktree,
  readLocalCheckpointDiff,
  revertLocalSections,
  rewindLocalThread,
  runLocalWorktreeSetup,
  stageLocalSections,
} from '../services/local-review-client';

export type LocalSetupState = 'idle' | 'running' | 'passed' | 'failed';

export interface LocalReviewState {
  checkpoints: CheckpointListResponse | null;
  turn: TurnCheckpointSummary | null;
  diff: CheckpointDiffResponse | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  /** Large files the last rewind left as they were, because no checkpoint held them. */
  skipped: string[];
  pinned: boolean;
  setup: LocalSetupState;
  setupExitCode: number | null;
  setupLog: string[];
  dialog: ReactElement | null;
  refresh: () => void;
  selectTurn: (turnId: string) => void;
  stage: (sections: CheckpointSection[]) => void;
  revert: (sections: CheckpointSection[]) => void;
  rewind: (turn: TurnCheckpointSummary) => void;
  /** Rewind to before the turn a transcript message belongs to. */
  rewindById: (turnId: string) => void;
  apply: () => void;
  togglePin: () => void;
  removeWorktree: () => void;
  runSetup: (script: DeveloperWorktreeSetupScript) => void;
}

const MAX_SETUP_LINES = 400;

function conflictLine(paths: readonly string[]): string | null {
  return paths.length > 0 ? LOCAL_REVIEW_COPY.conflicted(paths) : null;
}

function sectionPaths(sections: readonly CheckpointSection[]): string[] {
  return [...new Set(sections.map((section) => section.path))];
}

/**
 * The review pane of one local session: what each turn changed, and the
 * actions that take those changes back, stage them, or carry a worktree's
 * changes into the folder it came from.
 *
 * Every action that discards work asks first, and it asks with the answer to
 * a preview: the files named are the files the CLI says it would change, not
 * the files the page guesses at.
 */
export function useLocalReview(
  session: LocalDeveloperSession,
  worktree: DeveloperWorktree | null,
  enabled: boolean,
  callbacks: {
    onRewound: (restore: ThreadRevertRestore, turnId: string) => void;
    /** Given the ref that now holds everything the worktree held. */
    onWorktreeRemoved: (snapshotRef: string) => void;
    onSummarized?: () => void;
  },
  options: { canChooseRestore?: boolean; canSummarize?: boolean } = {},
): LocalReviewState {
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [choosing, setChoosing] = useState<LocalRewindTarget | null>(null);
  const canChooseRestore = options.canChooseRestore === true;
  const canSummarize = options.canSummarize === true;
  const [checkpoints, setCheckpoints] = useState<CheckpointListResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<CheckpointDiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [pinned, setPinned] = useState(worktree?.pinned ?? false);
  const [setup, setSetup] = useState<LocalSetupState>('idle');
  const [setupExitCode, setSetupExitCode] = useState<number | null>(
    worktree?.setupExitCode ?? null,
  );
  const [setupLog, setSetupLog] = useState<string[]>([]);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const { rootId, id: threadId } = session;

  const refresh = useCallback(() => {
    setLoading(true);
    listLocalCheckpoints(rootId, threadId)
      .then((list) => {
        setCheckpoints(list);
        setError(null);
        setSelected((current) => {
          if (current && list.turns.some((turn) => turn.turnId === current)) return current;
          const latest = [...list.turns].reverse().find((turn) => turn.files.length > 0);
          return latest?.turnId ?? null;
        });
      })
      .catch((cause: unknown) => setError(toUserMessage(cause, LOCAL_REVIEW_COPY.readFailed)))
      .finally(() => setLoading(false));
  }, [rootId, threadId]);

  useEffect(() => {
    setCheckpoints(null);
    setSelected(null);
    setChoosing(null);
    setDiff(null);
    setNotice(null);
    setSkipped([]);
    setSetupLog([]);
    setSetup('idle');
  }, [rootId, threadId]);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  const turn = checkpoints?.turns.find((candidate) => candidate.turnId === selected) ?? null;
  const finished = turn?.finishedAt !== undefined;

  useEffect(() => {
    if (!enabled || selected === null || !finished) {
      setDiff(null);
      return;
    }
    let cancelled = false;
    readLocalCheckpointDiff(rootId, threadId, selected)
      .then((next) => {
        if (!cancelled) setDiff(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(toUserMessage(cause, LOCAL_REVIEW_COPY.readFailed));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, rootId, threadId, selected, finished, checkpoints]);

  useEffect(
    () =>
      onDeveloperSessionEvent((eventRootId, event) => {
        if (eventRootId !== rootId || event.type === 'runtime-stopped') return;
        if (event.threadId !== threadId) return;
        if (event.type === 'turn-finished' && enabled) refresh();
        if (event.type === 'worktree-setup-log') {
          setSetup('running');
          setSetupLog((lines) => [...lines, event.text].slice(-MAX_SETUP_LINES));
        }
        if (event.type === 'worktree-setup-finished') {
          setSetup(event.succeeded ? 'passed' : 'failed');
          setSetupExitCode(event.exitCode);
        }
      }),
    [rootId, threadId, enabled, refresh],
  );

  const act = useCallback(async (work: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setSkipped([]);
    try {
      setNotice(await work());
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_REVIEW_COPY.actionFailed));
    } finally {
      setBusy(false);
    }
  }, []);

  const revert = useCallback(
    (sections: CheckpointSection[]) => {
      if (!turn) return;
      const request = { rootId, threadId, turnId: turn.turnId, sections };
      void act(async () => {
        const preview = await revertLocalSections({ ...request, preview: true });
        const files = sectionPaths(sections).filter((path) => preview.applied.includes(path));
        const blocked = preview.conflicted.map((entry) => entry.path);
        if (files.length === 0) return conflictLine(blocked);
        confirm({
          title: LOCAL_REVIEW_COPY.revertTitle,
          description: localRevertConsequence(files),
          confirmLabel: LOCAL_REVIEW_COPY.revertConfirm,
          destructive: true,
          onConfirm: () =>
            act(async () => {
              const done = await revertLocalSections(request);
              refresh();
              return [
                LOCAL_REVIEW_COPY.reverted(done.applied.length),
                conflictLine(done.conflicted.map((entry) => entry.path)),
              ]
                .filter(Boolean)
                .join(' ');
            }),
        });
        return conflictLine(blocked);
      });
    },
    [act, confirm, refresh, rootId, threadId, turn],
  );

  const stage = useCallback(
    (sections: CheckpointSection[]) => {
      if (!turn) return;
      const request = { rootId, threadId, turnId: turn.turnId, sections };
      void act(async () => {
        const done = await stageLocalSections(request);
        return [
          done.applied.length > 0 ? LOCAL_REVIEW_COPY.staged(done.applied.length) : null,
          conflictLine(done.conflicted.map((entry) => entry.path)),
        ]
          .filter(Boolean)
          .join(' ');
      });
    },
    [act, rootId, threadId, turn],
  );

  const rewindTo = useCallback(
    (turnId: string, index: number | null, restore: ThreadRevertRestore) => {
      const request = {
        rootId,
        threadId,
        turnId,
        ...(restore === 'both' ? {} : { restore }),
      };
      void act(async () => {
        const preview = await rewindLocalThread({ ...request, preview: true });
        if (restore === 'code' && preview.files.length === 0) {
          return LOCAL_REVIEW_COPY.nothingToRestore;
        }
        const consequence =
          restore === 'both'
            ? preview.files.length === 0
              ? `${LOCAL_REVIEW_COPY.nothingToRewindHere} ${localRewindConsequence([], preview.messagesRemoved)}`
              : localRewindConsequence(preview.files, preview.messagesRemoved)
            : localRestoreConsequence(restore, preview.files, preview.messagesRemoved);
        confirm({
          title:
            index === null
              ? LOCAL_REVIEW_COPY.rewindHereTitle
              : LOCAL_REVIEW_COPY.rewindTitle(index),
          description: [
            consequence,
            restore === 'conversation'
              ? ''
              : localRewindSkippedConsequence(preview.skippedFiles ?? []),
          ]
            .filter(Boolean)
            .join(' '),
          confirmLabel: LOCAL_REVIEW_COPY.restoreConfirm[restore],
          destructive: true,
          onConfirm: () =>
            act(async () => {
              const done = await rewindLocalThread(request);
              setSkipped(done.skippedFiles ?? []);
              callbacksRef.current.onRewound(restore, turnId);
              refresh();
              return localRestored(restore, done.files.length);
            }),
        });
        return null;
      });
    },
    [act, confirm, refresh, rootId, threadId],
  );

  const offer = useCallback(
    (target: LocalRewindTarget) => {
      if (canChooseRestore || (canSummarize && target.conversation)) {
        setChoosing(target);
        return;
      }
      if (!target.conversation) {
        setNotice(LOCAL_REVIEW_COPY.notRewindable);
        return;
      }
      rewindTo(target.turnId, target.index, 'both');
    },
    [canChooseRestore, canSummarize, rewindTo],
  );

  const rewind = useCallback(
    (target: TurnCheckpointSummary) =>
      offer({ turnId: target.turnId, index: target.index, conversation: target.rewindable }),
    [offer],
  );

  const rewindById = useCallback(
    (turnId: string) =>
      offer({
        turnId,
        index: checkpoints?.turns.find((candidate) => candidate.turnId === turnId)?.index ?? null,
        conversation: true,
      }),
    [checkpoints, offer],
  );

  const choose = useCallback(
    (restore: ThreadRevertRestore) => {
      const target = choosing;
      setChoosing(null);
      if (target) rewindTo(target.turnId, target.index, restore);
    },
    [choosing, rewindTo],
  );

  const summarize = useCallback(() => {
    const target = choosing;
    setChoosing(null);
    if (!target) return;
    confirm({
      title: LOCAL_REVIEW_COPY.summarizeTitle,
      description: LOCAL_REVIEW_COPY.summarizeConsequence,
      confirmLabel: LOCAL_REVIEW_COPY.summarizeConfirm,
      onConfirm: () => {
        void act(async () => {
          const done = await runThreadSummary(rootId, threadId, () =>
            compactDeveloperThread({
              rootId,
              threadId,
              fromTurnId: target.turnId,
            }),
          );
          if (!done.compacted) return LOCAL_REVIEW_COPY.nothingToSummarize;
          callbacksRef.current.onSummarized?.();
          refresh();
          return LOCAL_REVIEW_COPY.summarized(done.messagesSummarized);
        });
      },
    });
  }, [act, choosing, confirm, refresh, rootId, threadId]);

  const dialog = createElement(
    Fragment,
    null,
    createElement(LocalRewindChooser, {
      target: choosing,
      canChooseRestore,
      onChoose: choose,
      ...(canSummarize ? { onSummarize: summarize } : {}),
      onClose: () => setChoosing(null),
    }),
    confirmDialog,
  );

  const apply = useCallback(() => {
    if (!worktree) return;
    void act(async () => {
      const preview = await applyLocalWorktree(rootId, true);
      if (preview.applied.length === 0) {
        return [LOCAL_REVIEW_COPY.applyNothing, conflictLine(preview.conflicted)]
          .filter(Boolean)
          .join(' ');
      }
      confirm({
        title: LOCAL_REVIEW_COPY.applyTitle,
        description: localApplyConsequence(preview.applied),
        confirmLabel: LOCAL_REVIEW_COPY.applyConfirm,
        destructive: true,
        onConfirm: () =>
          act(async () => {
            const done = await applyLocalWorktree(rootId, false);
            return LOCAL_REVIEW_COPY.applied(
              done.applied.length,
              done.skipped.length,
              done.conflicted.length,
            );
          }),
      });
      return null;
    });
  }, [act, confirm, rootId, worktree]);

  const togglePin = useCallback(() => {
    if (!worktree) return;
    void act(async () => {
      const next = await pinLocalWorktree(rootId, !pinned);
      setPinned(next);
      return next ? LOCAL_REVIEW_COPY.pinned : null;
    });
  }, [act, pinned, rootId, worktree]);

  const removeWorktree = useCallback(() => {
    if (!worktree) return;
    confirm({
      title: LOCAL_REVIEW_COPY.removeTitle,
      description: localRemoveWorktreeConsequence(worktree.label ?? worktree.id),
      confirmLabel: LOCAL_REVIEW_COPY.removeConfirm,
      destructive: true,
      onConfirm: () =>
        act(async () => {
          const removed = await deleteLocalWorktree(rootId);
          callbacksRef.current.onWorktreeRemoved(removed.snapshotRef);
          return LOCAL_REVIEW_COPY.removed(removed.snapshotRef);
        }),
    });
  }, [act, confirm, rootId, worktree]);

  const runSetup = useCallback(
    (script: DeveloperWorktreeSetupScript) => {
      if (!worktree) return;
      const start = () =>
        act(async () => {
          setSetupLog([]);
          setSetup('running');
          await runLocalWorktreeSetup(rootId, script.sha256);
          return null;
        });
      if (script.approved) {
        void start();
        return;
      }
      confirm({
        title: LOCAL_REVIEW_COPY.setupTitle,
        description: LOCAL_REVIEW_COPY.setupBody(script.path),
        confirmLabel: LOCAL_REVIEW_COPY.setupConfirm,
        onConfirm: start,
      });
    },
    [act, confirm, rootId, worktree],
  );

  return {
    checkpoints,
    turn,
    diff: diff !== null && diff.turnId === selected ? diff : null,
    loading,
    busy,
    error,
    notice,
    skipped,
    pinned,
    setup,
    setupExitCode,
    setupLog,
    dialog,
    refresh,
    selectTurn: setSelected,
    stage,
    revert,
    rewind,
    rewindById,
    apply,
    togglePin,
    removeWorktree,
    runSetup,
  };
}
