'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DesktopRuntimeError,
  approvedRootId,
  type DeveloperMcpServerAwaitingApproval,
  type DeveloperRuntimeModels,
  type LocalDeveloperSession,
  type DeveloperSessionGroup,
  type WorkspaceRootKind,
} from '@agiworkforce/local-runtime-contract';
import type { WorktreeCleanupFailure } from '@agiworkforce/types/protocol';
import {
  allowDeveloperSessions,
  isDesktopHost,
  listDeveloperModels,
  listDeveloperSessions,
  onDeveloperSessionEvent,
  onWorkspaceChanged,
  pickWorkspaceRoot,
  reviewDeveloperMcpServer,
  startDeveloperSession,
  useDesktopHost,
  useDeveloperCapabilities,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import {
  LOCAL_CODE_COPY,
  localFolderGroups,
  localMcpServerKey,
  localPlacementRequest,
  nextSessionMarker,
  sharedUnavailableLine,
  startingModelId,
  type LocalPlacement,
  type LocalSessionMarker,
} from '../local-code';

export interface LocalSessionsState {
  supported: boolean;
  /** The shell can start a session in a new worktree; an older one only in the folder. */
  worktrees: boolean;
  groups: DeveloperSessionGroup[];
  loading: boolean;
  /**
   * The first complete answer is in: the list was read (or failed) from the
   * shell, or there is no shell. Until then an empty `groups` means "not read
   * yet", not "no such session"; on a cold load the first render is the
   * server's, with no host and `loading` already false.
   */
  settled: boolean;
  adding: boolean;
  error: string | null;
  unavailable: string | null;
  refresh: () => void;
  addFolder: (kind?: WorkspaceRootKind) => Promise<void>;
  /** The folder whose permission prompt is up, by root id. */
  allowing: string | null;
  /** Why a folder still lists no sessions after the user was asked, by root id. */
  allowRefusals: Record<string, string>;
  /** Ask to let the agent run in a folder whose sessions were withheld, then reload. */
  allowSessions: (rootId: string) => Promise<void>;
  /** The server whose review dialog is up, by `localMcpServerKey`. */
  reviewingMcp: string | null;
  /** Why a server is still waiting after a review, by `localMcpServerKey`. */
  mcpRefusals: Record<string, string>;
  /** Open the shell's dialog for a project MCP server that waits for approval, then reload. */
  reviewMcpServer: (rootId: string, server: DeveloperMcpServerAwaitingApproval) => Promise<void>;
  startSession: (
    rootId: string,
    model?: string,
    placement?: LocalPlacement,
  ) => Promise<LocalDeveloperSession | null>;
  modelsFor: (rootId: string) => DeveloperRuntimeModels | null;
  /** The folder's models are the last ones read: the latest read of them failed. */
  modelsStale: (rootId: string) => boolean;
  /** What each session's turn is doing now, by thread id, as the runtime reported it. */
  activity: Record<string, LocalSessionMarker | null>;
  /** Older worktrees the CLI could not archive when it made a session's, by thread id. */
  cleanupFailures: Record<string, WorktreeCleanupFailure[]>;
  dismissCleanupFailures: (threadId: string) => void;
}

/**
 * The coding sessions the AGI CLI has recorded for every folder this Mac has
 * opened to AGI. Absent in a browser, where there is no host to ask.
 */
export function useLocalSessions(): LocalSessionsState {
  const host = useDesktopHost();
  const supported = host !== null;
  const [models, setModels] = useState<Record<string, DeveloperRuntimeModels>>({});
  const [staleModelRoots, setStaleModelRoots] = useState<ReadonlySet<string>>(new Set());
  const worktrees = useDeveloperCapabilities(models).has('worktrees');
  const [groups, setGroups] = useState<DeveloperSessionGroup[]>([]);
  const [loading, setLoading] = useState(supported);
  const [settled, setSettled] = useState(false);
  const [adding, setAdding] = useState(false);
  const [allowing, setAllowing] = useState<string | null>(null);
  const [allowRefusals, setAllowRefusals] = useState<Record<string, string>>({});
  const [reviewingMcp, setReviewingMcp] = useState<string | null>(null);
  const [mcpRefusals, setMcpRefusals] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activity, setActivity] = useState<Record<string, LocalSessionMarker | null>>({});
  const [cleanupFailures, setCleanupFailures] = useState<Record<string, WorktreeCleanupFailure[]>>(
    {},
  );
  const groupsRef = useRef<DeveloperSessionGroup[]>([]);

  groupsRef.current = groups;

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!supported) {
      setLoading(false);
      if (!isDesktopHost()) setSettled(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listDeveloperSessions()
      .then((list) => {
        if (cancelled) return;
        setGroups(list.groups);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(toUserMessage(cause, LOCAL_CODE_COPY.readFailed));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [supported, reloadKey]);

  useEffect(() => {
    if (!supported) return;
    return onWorkspaceChanged(refresh);
  }, [supported, refresh]);

  useEffect(() => {
    if (!supported) return;
    return onDeveloperSessionEvent((rootId, event) => {
      if (event.type === 'runtime-stopped') {
        setActivity((current) => {
          const next = { ...current };
          for (const group of groupsRef.current) {
            if (group.rootId !== rootId) continue;
            for (const session of group.sessions) {
              const marker = current[session.id];
              if (marker === 'running' || marker === 'needs-approval' || marker === 'needs-input') {
                next[session.id] = 'failed';
              }
            }
          }
          return next;
        });
        return;
      }
      setActivity((current) => {
        const marker = nextSessionMarker(current[event.threadId] ?? null, event);
        return marker === undefined ? current : { ...current, [event.threadId]: marker };
      });
      if (event.type === 'turn-finished') refresh();
    });
  }, [supported, refresh]);

  useEffect(() => {
    const pending = localFolderGroups(groups).filter(
      (group) => group.unavailable === undefined && group.sessionsWithheld !== true,
    );
    if (pending.length === 0) return;
    let cancelled = false;

    const read = (refresh: boolean) => {
      void Promise.all(
        pending.map(async (group) => {
          try {
            return {
              rootId: group.rootId,
              read: await listDeveloperModels(group.rootId, refresh ? { refresh: true } : {}),
            };
          } catch {
            return { rootId: group.rootId, read: null };
          }
        }),
      ).then((entries) => {
        if (cancelled) return;
        // A folder whose read failed keeps the models last read for it, marked
        // stale, rather than losing its chooser to one failed refresh.
        const listed = new Set(groups.map((group) => group.rootId));
        setModels((current) => {
          const next: Record<string, DeveloperRuntimeModels> = {};
          for (const [rootId, known] of Object.entries(current)) {
            if (listed.has(rootId)) next[rootId] = known;
          }
          for (const entry of entries) {
            if (entry.read !== null) next[entry.rootId] = entry.read;
          }
          return next;
        });
        setStaleModelRoots(
          new Set(entries.filter((entry) => entry.read === null).map((entry) => entry.rootId)),
        );
      });
    };

    read(false);
    const onFocus = () => read(true);
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [groups]);

  const addFolder = useCallback(
    async (kind: WorkspaceRootKind = 'folder') => {
      setAdding(true);
      setError(null);
      try {
        await pickWorkspaceRoot(kind);
        refresh();
      } catch (cause: unknown) {
        setError(toUserMessage(cause, LOCAL_CODE_COPY.startFailed));
      } finally {
        setAdding(false);
      }
    },
    [refresh],
  );

  const allowSessions = useCallback(
    async (rootId: string) => {
      setAllowing(rootId);
      try {
        await allowDeveloperSessions(rootId);
        setAllowRefusals(({ [rootId]: _granted, ...rest }) => rest);
        refresh();
      } catch (cause: unknown) {
        if (cause instanceof DesktopRuntimeError && cause.code === 'cancelled') return;
        const refused = cause instanceof DesktopRuntimeError && cause.code === 'permission-denied';
        setAllowRefusals((current) => ({
          ...current,
          [rootId]: refused
            ? LOCAL_CODE_COPY.sessionsRefused
            : toUserMessage(cause, LOCAL_CODE_COPY.allowSessionsFailed),
        }));
      } finally {
        setAllowing(null);
      }
    },
    [refresh],
  );

  const reviewMcpServer = useCallback(
    async (rootId: string, server: DeveloperMcpServerAwaitingApproval) => {
      const key = localMcpServerKey(rootId, server);
      setReviewingMcp(key);
      try {
        const review = await reviewDeveloperMcpServer(rootId, server);
        setMcpRefusals(({ [key]: _reviewed, ...rest }) =>
          review.outcome === 'refused'
            ? { ...rest, [key]: review.message ?? LOCAL_CODE_COPY.mcpReviewFailed }
            : rest,
        );
        if (review.outcome !== 'declined') refresh();
      } catch (cause: unknown) {
        setMcpRefusals((current) => ({
          ...current,
          [key]: toUserMessage(cause, LOCAL_CODE_COPY.mcpReviewFailed),
        }));
      } finally {
        setReviewingMcp(null);
      }
    },
    [refresh],
  );

  const startSession = useCallback(
    async (rootId: string, model?: string, placement: LocalPlacement = 'local') => {
      setError(null);
      const group = groups.find((candidate) => candidate.rootId === rootId);
      const chosen = model ?? startingModelId(models[rootId] ?? null, group?.sessions ?? []);
      try {
        const session =
          placement === 'local' || !worktrees
            ? await startDeveloperSession(rootId, chosen)
            : await startDeveloperSession(rootId, chosen, localPlacementRequest(placement));
        const failures = session.cleanupFailures ?? [];
        if (failures.length > 0) {
          setCleanupFailures((current) => ({ ...current, [session.id]: failures }));
        }
        refresh();
        return session;
      } catch (cause: unknown) {
        setError(toUserMessage(cause, LOCAL_CODE_COPY.startFailed));
        return null;
      }
    },
    [refresh, groups, models, worktrees],
  );

  const dismissCleanupFailures = useCallback((threadId: string) => {
    setCleanupFailures((current) => {
      if (!(threadId in current)) return current;
      const { [threadId]: _dismissed, ...rest } = current;
      return rest;
    });
  }, []);

  const modelsFor = useCallback(
    (rootId: string) => models[approvedRootId(rootId)] ?? null,
    [models],
  );

  const modelsStale = useCallback(
    (rootId: string) => {
      const approved = approvedRootId(rootId);
      return staleModelRoots.has(approved) && models[approved] !== undefined;
    },
    [models, staleModelRoots],
  );

  return {
    supported,
    worktrees,
    groups,
    modelsFor,
    modelsStale,
    loading,
    settled,
    adding,
    error,
    unavailable: sharedUnavailableLine(groups),
    activity,
    cleanupFailures,
    dismissCleanupFailures,
    refresh,
    addFolder,
    allowing,
    allowRefusals,
    allowSessions,
    reviewingMcp,
    mcpRefusals,
    reviewMcpServer,
    startSession,
  };
}
