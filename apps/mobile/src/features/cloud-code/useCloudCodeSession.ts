import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  CLOUD_CODE_TURN_STILL_RUNNING_CODE,
  type StartCloudCodeAgentTurnRequest,
  CloudCodeApiError,
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

export type CloudCodeTurnOptions = Pick<StartCloudCodeAgentTurnRequest, 'maxSteps' | 'mode'>;

type SessionLoad = 'initial' | 'refresh' | 'background';

interface SessionDetail {
  session: CloudCodeSession;
  terminalEntries: CloudCodeTerminalEntry[];
  turns: CloudCodeAgentTurnRecord[];
}

export interface CloudCodeSessionView {
  status: 'loading' | 'ready' | 'missing' | 'error';
  session: CloudCodeSession | null;
  terminalEntries: CloudCodeTerminalEntry[];
  transcript: CodeTranscriptItem[];
  approvals: CloudCodeAgentApproval[];
  pendingGoal: string | null;
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
  stop: () => void;
  decide: (approval: CloudCodeAgentApproval, decision: CloudCodeApprovalDecision) => void;
  unarchive: () => void;
  dismissActionError: () => void;
}

function approvalKey(approval: Pick<CloudCodeAgentApproval, 'turnId' | 'stepIndex'>): string {
  return `${approval.turnId}:${approval.stepIndex}`;
}

function isTurnStillRunning(error: unknown): boolean {
  return error instanceof CloudCodeApiError && error.code === CLOUD_CODE_TURN_STILL_RUNNING_CODE;
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
  const [turnRequest, setTurnRequest] = useState<CloudCodeTurnRequest | null>(null);
  const [pendingGoal, setPendingGoal] = useState<string | null>(null);
  const [sendBaseline, setSendBaseline] = useState<string | null>(null);
  const [decidingKey, setDecidingKey] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [unarchiving, setUnarchiving] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState ?? 'active');
  const mounted = useRef(true);
  const readGeneration = useRef(0);

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
  const sessionBusy = detail ? cloudCodeSessionIsBusy(detail.session) : false;
  const shouldPoll = status === 'ready' && appState !== 'background' && (working || sessionBusy);

  useEffect(() => {
    if (!shouldPoll) return undefined;
    const timer = setInterval(() => void load('background'), CLOUD_CODE_SESSION_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load, shouldPoll]);

  useEffect(() => {
    if (!working) setStopping(false);
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
      if (turnRequest !== null) return false;
      setTurnRequest('send');
      setPendingGoal(goal);
      setSendBaseline(latestTurnId);
      setActionError(null);
      let sent = true;
      try {
        await cloudCodeApi.startAgentTurn(sessionId, {
          goal,
          model,
          idempotencyKey: newCloudCodeIdempotencyKey(),
          ...options,
        });
      } catch (error) {
        if (!isAbortError(error) && !isTurnStillRunning(error)) {
          sent = false;
          if (mounted.current) setActionError(describeCloudCodeError(error, CLOUD_CODE_SEND_ERROR));
        }
      }
      if (mounted.current) {
        setTurnRequest(null);
        setPendingGoal(null);
        void load('background');
      }
      return sent;
    },
    [latestTurnId, load, model, sessionId, turnRequest],
  );

  const stop = useCallback(() => {
    if (stopping) return;
    setStopping(true);
    setActionError(null);
    void cloudCodeApi
      .cancelAgentTurn(sessionId, runningTurnId ?? undefined)
      .catch((error: unknown) => {
        if (!mounted.current) return;
        setStopping(false);
        setActionError(describeCloudCodeError(error, CLOUD_CODE_STOP_ERROR));
      })
      .finally(() => {
        if (mounted.current) void load('background');
      });
  }, [load, runningTurnId, sessionId, stopping]);

  const decide = useCallback(
    (approval: CloudCodeAgentApproval, decision: CloudCodeApprovalDecision) => {
      if (turnRequest !== null) return;
      setTurnRequest(decision);
      setDecidingKey(approvalKey(approval));
      setActionError(null);
      void cloudCodeApi
        .decideApproval(sessionId, {
          turnId: approval.turnId,
          stepIndex: approval.stepIndex,
          decision,
        })
        .catch((error: unknown) => {
          if (!mounted.current || isAbortError(error)) return;
          setActionError(describeCloudCodeError(error, CLOUD_CODE_DECISION_ERROR));
        })
        .finally(() => {
          if (!mounted.current) return;
          setTurnRequest(null);
          setDecidingKey(null);
          void load('background');
        });
    },
    [load, sessionId, turnRequest],
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
    approvals: visibleApprovals,
    pendingGoal: turnRequest === 'send' && latestTurnId === sendBaseline ? pendingGoal : null,
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
    stop,
    decide,
    unarchive,
    dismissActionError,
  };
}
