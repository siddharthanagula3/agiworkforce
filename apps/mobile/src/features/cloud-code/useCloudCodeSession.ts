import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  beginCloudCodeRequest,
  isCloudCodeTurnStillRunning,
  takeRefusedCloudCodeSend,
  useCloudCodeRequests,
} from './cloudCodeRequests';
import {
  type StartCloudCodeAgentTurnRequest,
  buildCodeTranscript,
  toCodeTurnRecord,
  type CloudCodeAgentApproval,
  type CloudCodeApprovalDecision,
  type CodeTranscriptItem,
} from '@agiworkforce/cloud-contracts';
import {
  cloudCodeSessionIsBusy,
  type CloudCodeAgentTurnRecord,
  type CloudCodeSession,
  type CloudCodeTerminalEntry,
} from '@agiworkforce/types';
import {
  CLOUD_CODE_DECISION_ERROR,
  CLOUD_CODE_OPEN_ERROR,
  CLOUD_CODE_SEND_ERROR,
  CLOUD_CODE_STOP_ERROR,
  CLOUD_CODE_UNARCHIVE_ERROR,
  cloudCodeApi,
  describeCloudCodeError,
  isMissingCloudCodeSession,
  newCloudCodeIdempotencyKey,
} from './service';

const CLOUD_CODE_SESSION_POLL_INTERVAL_MS = 4_000;
const EMPTY_TERMINAL_ENTRIES: CloudCodeTerminalEntry[] = [];

export type CloudCodeTurnRequest = 'send' | CloudCodeApprovalDecision;

export type CloudCodeTurnOptions = Pick<StartCloudCodeAgentTurnRequest, 'mode'>;

type SessionLoad = 'initial' | 'refresh' | 'background';

interface SessionDetail {
  session: CloudCodeSession;
  terminalEntries: CloudCodeTerminalEntry[];
  turns: CloudCodeAgentTurnRecord[];
  turnsTruncated?: boolean;
}

export interface CloudCodeSessionView {
  status: 'loading' | 'ready' | 'missing' | 'error';
  session: CloudCodeSession | null;
  terminalEntries: CloudCodeTerminalEntry[];
  transcript: CodeTranscriptItem[];
  turnsTruncated: boolean;
  approvals: CloudCodeAgentApproval[];
  pendingGoal: string | null;
  hasRefusedSend: boolean;
  turnRequest: CloudCodeTurnRequest | null;
  working: boolean;
  stopping: boolean;
  unarchiving: boolean;
  loadError: string | null;
  actionError: string | null;
  refreshing: boolean;
}

export interface CloudCodeSessionActions {
  refresh: () => void;
  reload: () => void;
  retry: () => void;
  send: (goal: string, options?: CloudCodeTurnOptions) => Promise<boolean>;
  recoverRefusedSend: () => string | null;
  stop: () => void;
  decide: (approval: CloudCodeAgentApproval, decision: CloudCodeApprovalDecision) => void;
  unarchive: () => void;
  dismissActionError: () => void;
}

function approvalKey(approval: Pick<CloudCodeAgentApproval, 'turnId' | 'stepIndex'>): string {
  return `${approval.turnId}:${approval.stepIndex}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function useCloudCodeSession(
  sessionId: string,
  model: string,
): CloudCodeSessionView & CloudCodeSessionActions {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [approvals, setApprovals] = useState<CloudCodeAgentApproval[]>([]);
  const [status, setStatus] = useState<CloudCodeSessionView['status']>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const stoppingRequest = useRef<symbol | null>(null);
  const [unarchiving, setUnarchiving] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState ?? 'active');
  const mounted = useRef(true);
  const readGeneration = useRef(0);
  const requests = useCloudCodeRequests();
  const pending = requests.pending.get(sessionId);
  const ownRequest = useRef<typeof pending>(undefined);
  const previousRequest = useRef(pending);
  const turnRequest = pending?.kind ?? null;
  const decidingKey = pending && pending.kind !== 'send' ? pending.approvalKey : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (mode: SessionLoad) => {
      readGeneration.current += 1;
      const current = readGeneration.current;
      if (mode === 'refresh') setRefreshing(true);
      try {
        const [body, pending] = await Promise.all([
          cloudCodeApi.get(sessionId),
          cloudCodeApi.listApprovals(sessionId),
        ]);
        if (!mounted.current || current !== readGeneration.current) return;
        setDetail(body);
        setApprovals(pending);
        setLoadError(null);
        setStatus('ready');
      } catch (error) {
        if (!mounted.current || current !== readGeneration.current) return;
        if (isMissingCloudCodeSession(error)) {
          setStatus('missing');
          return;
        }
        setLoadError(describeCloudCodeError(error, CLOUD_CODE_OPEN_ERROR));
        setStatus((previous) => (previous === 'ready' ? previous : 'error'));
      } finally {
        if (mounted.current && mode === 'refresh') setRefreshing(false);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  useEffect(() => {
    const previous = previousRequest.current;
    previousRequest.current = pending;
    if (previous && !pending && previous !== ownRequest.current) void load('background');
  }, [load, pending]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      setAppState(next);
      if (next === 'active') void load('background');
    });
    return () => subscription.remove();
  }, [load]);

  const turns = detail?.turns;
  const latestTurn = turns && turns.length > 0 ? turns[turns.length - 1] : undefined;
  const latestTurnId = latestTurn?.turnId ?? null;
  const runningTurnId = latestTurn && latestTurn.stopReason === null ? latestTurn.turnId : null;
  const working = turnRequest !== null || runningTurnId !== null;
  const stopping =
    stopRequested || (runningTurnId !== null && Boolean(latestTurn?.cancelRequestedAt));
  const sessionBusy = detail ? cloudCodeSessionIsBusy(detail.session) : false;
  const shouldPoll = status === 'ready' && appState === 'active' && (working || sessionBusy);

  useEffect(() => {
    if (!shouldPoll) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pollAfterInterval = (): void => {
      timer = setTimeout(() => {
        void load('background').finally(() => {
          if (!stopped) pollAfterInterval();
        });
      }, CLOUD_CODE_SESSION_POLL_INTERVAL_MS);
    };
    pollAfterInterval();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [load, shouldPoll]);

  useEffect(() => {
    if (!working) {
      stoppingRequest.current = null;
      setStopRequested(false);
    }
  }, [working]);

  const transcript = useMemo(
    () =>
      detail ? buildCodeTranscript(detail.terminalEntries, detail.turns.map(toCodeTurnRecord)) : [],
    [detail],
  );

  const visibleApprovals = useMemo(
    () => approvals.filter((approval) => approvalKey(approval) !== decidingKey),
    [approvals, decidingKey],
  );

  const send = useCallback(
    async (goal: string, options: CloudCodeTurnOptions = {}): Promise<boolean> => {
      if (runningTurnId !== null) return false;
      const operation = beginCloudCodeRequest(sessionId, {
        kind: 'send',
        goal,
        baseline: latestTurnId,
      });
      if (!operation) return false;
      ownRequest.current = operation.request;
      setActionError(null);
      let sent = true;
      let refusedWhileAway: { goal: string; message: string } | undefined;
      try {
        await cloudCodeApi.startAgentTurn(
          sessionId,
          { goal, model, idempotencyKey: newCloudCodeIdempotencyKey(), ...options },
          operation.signal,
        );
      } catch (error) {
        if (
          !operation.signal.aborted &&
          !isAbortError(error) &&
          !isCloudCodeTurnStillRunning(error)
        ) {
          sent = false;
          const message = describeCloudCodeError(error, CLOUD_CODE_SEND_ERROR);
          if (mounted.current) setActionError(message);
          else refusedWhileAway = { goal, message };
        }
      } finally {
        operation.finish(refusedWhileAway);
        if (mounted.current && !operation.signal.aborted) void load('background');
      }
      return sent;
    },
    [latestTurnId, load, model, runningTurnId, sessionId],
  );

  const recoverRefusedSend = useCallback(() => {
    const refused = takeRefusedCloudCodeSend(sessionId);
    if (!refused) return null;
    setActionError(refused.message);
    return refused.goal;
  }, [sessionId]);

  const stop = useCallback(() => {
    if (!working || stopping || stoppingRequest.current !== null) return;
    const request = Symbol();
    stoppingRequest.current = request;
    setStopRequested(true);
    setActionError(null);
    void cloudCodeApi
      .cancelAgentTurn(sessionId, runningTurnId ?? undefined)
      .catch((error: unknown) => {
        if (!mounted.current || stoppingRequest.current !== request) return;
        stoppingRequest.current = null;
        setStopRequested(false);
        setActionError(describeCloudCodeError(error, CLOUD_CODE_STOP_ERROR));
      })
      .finally(() => {
        if (mounted.current) void load('background');
      });
  }, [load, runningTurnId, sessionId, stopping, working]);

  const decide = useCallback(
    (approval: CloudCodeAgentApproval, decision: CloudCodeApprovalDecision) => {
      const operation = beginCloudCodeRequest(sessionId, {
        kind: decision,
        approvalKey: approvalKey(approval),
      });
      if (!operation) return;
      ownRequest.current = operation.request;
      setActionError(null);
      void cloudCodeApi
        .decideApproval(
          sessionId,
          { turnId: approval.turnId, stepIndex: approval.stepIndex, decision },
          operation.signal,
        )
        .catch((error: unknown) => {
          if (!mounted.current || operation.signal.aborted || isAbortError(error)) return;
          setActionError(describeCloudCodeError(error, CLOUD_CODE_DECISION_ERROR));
        })
        .finally(() => {
          operation.finish();
          if (mounted.current && !operation.signal.aborted) void load('background');
        });
    },
    [load, sessionId],
  );

  const unarchive = useCallback(() => {
    if (unarchiving) return;
    setUnarchiving(true);
    setActionError(null);
    void cloudCodeApi
      .setArchived(sessionId, false)
      .then((session) => {
        if (mounted.current) setDetail((current) => (current ? { ...current, session } : current));
      })
      .catch((error: unknown) => {
        if (mounted.current) {
          setActionError(describeCloudCodeError(error, CLOUD_CODE_UNARCHIVE_ERROR));
        }
      })
      .finally(() => {
        if (mounted.current) setUnarchiving(false);
      });
  }, [sessionId, unarchiving]);

  const refresh = useCallback(() => void load('refresh'), [load]);
  const reload = useCallback(() => void load('background'), [load]);

  const retry = useCallback(() => {
    setStatus('loading');
    void load('initial');
  }, [load]);

  const dismissActionError = useCallback(() => setActionError(null), []);

  return {
    status,
    session: detail?.session ?? null,
    terminalEntries: detail?.terminalEntries ?? EMPTY_TERMINAL_ENTRIES,
    transcript,
    turnsTruncated: detail?.turnsTruncated === true,
    approvals: visibleApprovals,
    pendingGoal:
      pending?.kind === 'send' && latestTurnId === pending.baseline ? pending.goal : null,
    hasRefusedSend: requests.refused.has(sessionId),
    turnRequest,
    working,
    stopping,
    unarchiving,
    loadError,
    actionError,
    refreshing,
    refresh,
    reload,
    retry,
    send,
    recoverRefusedSend,
    stop,
    decide,
    unarchive,
    dismissActionError,
  };
}
