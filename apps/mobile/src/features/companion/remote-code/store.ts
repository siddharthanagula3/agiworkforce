import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import {
  REMOTE_CODE_LIMITS,
  parseRemoteCodeEvent,
  parseRemoteCodeSessions,
  parseRemoteCodeSnapshot,
  parseRemoteCodeStarted,
  parseRemoteCodeTranscript,
  type RemoteCodeApprovalHold,
  type RemoteCodeDiff,
  type RemoteCodeFileChange,
  type RemoteCodeIndexedMessage,
  type RemoteCodeGuidanceRejectionReason,
  type RemoteCodePendingApproval,
  type RemoteCodePendingQuestion,
  type RemoteCodeRoot,
  type RemoteCodeSessionStatus,
  type RemoteCodeSessionSummary,
  type RemoteCodeTestRun,
  type RemoteCodeThinking,
  type RemoteCodeToolRecord,
  type RemoteCodeTranscriptEntry,
} from '@agiworkforce/types';

export interface RemoteCodeTranscript {
  messages: RemoteCodeIndexedMessage[];
  hasEarlier: boolean;
}

export interface RemoteCodeSessionStart {
  rootId: string;
  threadId: string | null;
  error: string | null;
}

export interface RejectedCodeGuidance {
  requestId?: string;
  text: string;
  reason: RemoteCodeGuidanceRejectionReason;
}

interface RemoteCodeDraft {
  text: string;
  attempt: { requestId: string; timer: ReturnType<typeof setTimeout> } | null;
  unconfirmedRequestId: string | null;
  editedDuringSend: boolean;
  sendFailure: 'not-sent' | 'unconfirmed' | null;
}

const GUIDANCE_RESULT_TIMEOUT_MS = 30_000;

export const EMPTY_REMOTE_CODE_DRAFT: Readonly<RemoteCodeDraft> = {
  text: '',
  attempt: null,
  unconfirmedRequestId: null,
  editedDuringSend: false,
  sendFailure: null,
};

export interface RemoteCodeThread {
  rootId: string;
  threadId: string;
  title: string;
  status: RemoteCodeSessionStatus;
  activeTurnId: string | null;
  partialResponse: string;
  messages: RemoteCodeTranscriptEntry[];
  pendingApprovals: RemoteCodePendingApproval[];
  approvalHolds: Record<string, RemoteCodeApprovalHoldNotice>;
  pendingQuestions: RemoteCodePendingQuestion[];
  fileChanges: RemoteCodeFileChange[];
  diffs: RemoteCodeDiff[];
  testRuns: RemoteCodeTestRun[];
  tools: RemoteCodeToolRecord[];
  thinking: RemoteCodeThinking[];
  runningTasks: number;
  transcript: RemoteCodeTranscript | null;
  queuedGuidance: string[];
  rejectedGuidance: RejectedCodeGuidance[];
  dismissedGuidanceIds: string[];
  hostMessage: string | null;
  syncedAt: string;
}

interface RemoteCodeState {
  sessions: RemoteCodeSessionSummary[];
  unavailable: Array<{ folder: string; message: string }>;
  roots: RemoteCodeRoot[];
  sessionsSyncedAt: string | null;
  threads: Record<string, RemoteCodeThread>;
  starts: Record<string, RemoteCodeSessionStart>;
  drafts: Record<string, RemoteCodeDraft>;
  reset: () => void;
}

export interface RemoteCodeApprovalHoldNotice {
  status: RemoteCodeApprovalHold;
  message: string;
}

function holdsFor(
  holds: Record<string, RemoteCodeApprovalHoldNotice>,
  waiting: ReadonlyArray<{ requestId: string }>,
): Record<string, RemoteCodeApprovalHoldNotice> {
  return Object.fromEntries(
    waiting.flatMap((entry) => {
      const hold = holds[entry.requestId];
      return hold ? [[entry.requestId, hold]] : [];
    }),
  );
}

function appendThinking(
  thinking: RemoteCodeThinking[],
  turnId: string,
  delta: string,
): RemoteCodeThinking[] {
  const kept = thinking.find((entry) => entry.turnId === turnId);
  const text = ((kept?.text ?? '') + delta).slice(-REMOTE_CODE_LIMITS.thinkingLength);
  return [...thinking.filter((entry) => entry.turnId !== turnId), { turnId, text }].slice(
    -REMOTE_CODE_LIMITS.thinkingTurns,
  );
}

export function remoteCodeThreadKey(rootId: string, threadId: string): string {
  return JSON.stringify([rootId, threadId]);
}

export const useRemoteCodeStore = create<RemoteCodeState>((set, get) => ({
  sessions: [],
  unavailable: [],
  roots: [],
  sessionsSyncedAt: null,
  threads: {},
  starts: {},
  drafts: {},
  reset: () => {
    for (const draft of Object.values(get().drafts)) {
      if (draft.attempt) clearTimeout(draft.attempt.timer);
    }
    set({
      sessions: [],
      unavailable: [],
      roots: [],
      sessionsSyncedAt: null,
      threads: {},
      starts: {},
      drafts: {},
    });
  },
}));

function saveCodeDraft(key: string, draft: RemoteCodeDraft): void {
  useRemoteCodeStore.setState((state) => {
    const drafts = { ...state.drafts };
    if (draft.text.length > 0 || draft.attempt || draft.unconfirmedRequestId || draft.sendFailure)
      drafts[key] = draft;
    else delete drafts[key];
    return { drafts };
  });
}

export function updateCodeDraft(key: string, text: string): void {
  const draft = useRemoteCodeStore.getState().drafts[key] ?? EMPTY_REMOTE_CODE_DRAFT;
  if (draft.text === text) return;
  saveCodeDraft(key, {
    ...draft,
    text,
    editedDuringSend: draft.attempt !== null || draft.unconfirmedRequestId !== null,
    sendFailure: null,
  });
}

export function beginCodeDraftSend(
  key: string,
  requestId: string,
): { requestId: string; text: string } | null {
  const draft = useRemoteCodeStore.getState().drafts[key];
  if (!draft || draft.attempt) return null;
  const text = draft.text.trim();
  if (!text || text.length > REMOTE_CODE_LIMITS.guidanceLength) return null;
  const timer = setTimeout(
    () => finishCodeDraftSend(key, requestId, 'unconfirmed'),
    GUIDANCE_RESULT_TIMEOUT_MS,
  );
  saveCodeDraft(key, {
    ...draft,
    attempt: { requestId, timer },
    unconfirmedRequestId: null,
    editedDuringSend: false,
    sendFailure: null,
  });
  return { requestId, text };
}

export function finishCodeDraftSend(
  key: string,
  requestId: string,
  outcome: 'settled' | 'not-sent' | 'unconfirmed',
): void {
  const draft = useRemoteCodeStore.getState().drafts[key];
  if (!draft) return;
  if (draft.attempt?.requestId === requestId) clearTimeout(draft.attempt.timer);
  else if (outcome !== 'settled' || draft.unconfirmedRequestId !== requestId) return;
  saveCodeDraft(key, {
    ...EMPTY_REMOTE_CODE_DRAFT,
    text: outcome === 'settled' && !draft.editedDuringSend ? '' : draft.text,
    unconfirmedRequestId: outcome === 'unconfirmed' ? requestId : null,
    editedDuringSend: outcome === 'unconfirmed' && draft.editedDuringSend,
    sendFailure: outcome === 'settled' ? null : outcome,
  });
}

function confirmCodeDraft(key: string, confirmedIds: readonly string[] | undefined): void {
  const draft = useRemoteCodeStore.getState().drafts[key];
  const requestId = draft?.attempt?.requestId ?? draft?.unconfirmedRequestId;
  if (requestId && confirmedIds?.includes(requestId)) {
    finishCodeDraftSend(key, requestId, 'settled');
  }
}

export const REMOTE_FOLLOW_UP_BEHAVIORS = ['queue', 'steer'] as const;

export type RemoteFollowUpBehavior = (typeof REMOTE_FOLLOW_UP_BEHAVIORS)[number];

interface RemoteCodePreferences {
  followUpBehavior: RemoteFollowUpBehavior;
  setFollowUpBehavior: (behavior: RemoteFollowUpBehavior) => void;
}

function isFollowUpBehavior(value: unknown): value is RemoteFollowUpBehavior {
  return REMOTE_FOLLOW_UP_BEHAVIORS.some((behavior) => behavior === value);
}

export const useRemoteCodePreferences = create<RemoteCodePreferences>()(
  persist(
    (set) => ({
      followUpBehavior: 'queue',
      setFollowUpBehavior: (followUpBehavior) => set({ followUpBehavior }),
    }),
    {
      name: 'remote-code-preferences',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      partialize: (state) => ({ followUpBehavior: state.followUpBehavior }),
      merge: (persisted, current) => {
        const stored = (persisted as { followUpBehavior?: unknown } | undefined)?.followUpBehavior;
        return isFollowUpBehavior(stored) ? { ...current, followUpBehavior: stored } : current;
      },
    },
  ),
);

rehydrateWhenMmkvReady(useRemoteCodePreferences, 'remote-code-preferences');

export function beginCodeSessionStart(requestId: string, rootId: string): void {
  useRemoteCodeStore.setState((state) => ({
    starts: { ...state.starts, [requestId]: { rootId, threadId: null, error: null } },
  }));
}

export function forgetCodeSessionStart(requestId: string): void {
  useRemoteCodeStore.setState((state) => {
    const starts = { ...state.starts };
    delete starts[requestId];
    return { starts };
  });
}

function settleTools(tools: RemoteCodeToolRecord[]): RemoteCodeToolRecord[] {
  return tools.map((tool) =>
    tool.state === 'running' ? { ...tool, state: 'failed' as const } : tool,
  );
}

function mergeTranscript(
  current: RemoteCodeTranscript | null,
  page: { before: number | null; messages: RemoteCodeIndexedMessage[]; hasEarlier: boolean },
): RemoteCodeTranscript {
  if (page.before !== null) {
    const kept = current?.messages.filter((message) => message.index >= (page.before ?? 0)) ?? [];
    return { messages: [...page.messages, ...kept], hasEarlier: page.hasEarlier };
  }
  const oldest = page.messages[0]?.index;
  const earlier =
    oldest === undefined
      ? []
      : (current?.messages.filter((message) => message.index < oldest) ?? []);
  return {
    messages: [...earlier, ...page.messages],
    hasEarlier: earlier.length > 0 ? (current?.hasEarlier ?? false) : page.hasEarlier,
  };
}

function updateThread(
  rootId: string,
  threadId: string,
  update: (thread: RemoteCodeThread) => RemoteCodeThread,
): void {
  const key = remoteCodeThreadKey(rootId, threadId);
  useRemoteCodeStore.setState((state) => {
    const thread = state.threads[key];
    return thread ? { threads: { ...state.threads, [key]: update(thread) } } : state;
  });
}

export function removeRejectedCodeGuidance(
  rootId: string,
  threadId: string,
  message: RejectedCodeGuidance,
): void {
  updateThread(rootId, threadId, (thread) => ({
    ...thread,
    rejectedGuidance: thread.rejectedGuidance.filter((item) => item !== message),
    dismissedGuidanceIds: message.requestId
      ? [...thread.dismissedGuidanceIds, message.requestId].slice(
          -REMOTE_CODE_LIMITS.historyMessages,
        )
      : thread.dismissedGuidanceIds,
  }));
}

function mergeRejectedGuidance(
  thread: RemoteCodeThread | undefined,
  incoming: readonly RejectedCodeGuidance[],
): RejectedCodeGuidance[] {
  const current = thread?.rejectedGuidance ?? [];
  const seen = new Set([
    ...(thread?.dismissedGuidanceIds ?? []),
    ...current.flatMap(({ requestId }) => (requestId ? [requestId] : [])),
  ]);
  const unseen = incoming.filter(({ requestId }) => {
    if (!requestId) return true;
    if (seen.has(requestId)) return false;
    seen.add(requestId);
    return true;
  });
  return [...current, ...unseen].slice(-REMOTE_CODE_LIMITS.transcriptMessages);
}

function appendMessage(
  thread: RemoteCodeThread,
  message: RemoteCodeTranscriptEntry,
): RemoteCodeTranscriptEntry[] {
  return [...thread.messages, message].slice(-REMOTE_CODE_LIMITS.transcriptMessages);
}

function upsertByKey<T>(items: T[], item: T, key: (entry: T) => string, max: number): T[] {
  const id = key(item);
  return [...items.filter((entry) => key(entry) !== id), item].slice(-max);
}

export function ingestRemoteCodeSessions(payload: unknown): boolean {
  const parsed = parseRemoteCodeSessions(payload);
  if (!parsed) return false;
  useRemoteCodeStore.setState({
    sessions: parsed.sessions,
    unavailable: parsed.unavailable,
    roots: parsed.roots,
    sessionsSyncedAt: parsed.syncedAt,
  });
  return true;
}

export function ingestRemoteCodeSnapshot(payload: unknown): boolean {
  const parsed = parseRemoteCodeSnapshot(payload);
  if (!parsed) return false;
  const key = remoteCodeThreadKey(parsed.rootId, parsed.threadId);
  confirmCodeDraft(key, parsed.confirmedGuidanceIds);
  confirmCodeDraft(
    key,
    parsed.rejectedGuidance?.map(({ requestId }) => requestId),
  );
  useRemoteCodeStore.setState((state) => ({
    threads: {
      ...state.threads,
      [key]: {
        rootId: parsed.rootId,
        threadId: parsed.threadId,
        title: parsed.title,
        status: parsed.status,
        activeTurnId: parsed.activeTurnId,
        partialResponse: parsed.partialResponse,
        messages: parsed.messages,
        pendingApprovals: parsed.pendingApprovals,
        approvalHolds: holdsFor(state.threads[key]?.approvalHolds ?? {}, [
          ...parsed.pendingApprovals,
          ...parsed.pendingQuestions,
        ]),
        pendingQuestions: parsed.pendingQuestions,
        fileChanges: parsed.fileChanges,
        diffs: state.threads[key]?.diffs ?? [],
        testRuns: state.threads[key]?.testRuns ?? [],
        tools: parsed.tools.length > 0 ? parsed.tools : (state.threads[key]?.tools ?? []),
        thinking:
          parsed.thinking && parsed.thinking.length > 0
            ? parsed.thinking
            : (state.threads[key]?.thinking ?? []),
        runningTasks: parsed.runningTasks ?? 0,
        transcript: state.threads[key]?.transcript ?? null,
        queuedGuidance: parsed.queuedGuidance,
        rejectedGuidance: mergeRejectedGuidance(state.threads[key], parsed.rejectedGuidance ?? []),
        dismissedGuidanceIds: state.threads[key]?.dismissedGuidanceIds ?? [],
        hostMessage: null,
        syncedAt: parsed.syncedAt,
      },
    },
  }));
  return true;
}

export function ingestRemoteCodeEvent(payload: unknown): boolean {
  const parsed = parseRemoteCodeEvent(payload);
  if (!parsed) return false;
  const { event } = parsed;
  if (
    event.type === 'guidance-queued' ||
    event.type === 'guidance-delivered' ||
    event.type === 'guidance-rejected'
  ) {
    confirmCodeDraft(remoteCodeThreadKey(parsed.rootId, parsed.threadId), event.requestIds);
  }
  updateThread(parsed.rootId, parsed.threadId, (thread) => {
    switch (event.type) {
      case 'turn-started':
        return {
          ...thread,
          status: 'running',
          activeTurnId: event.turnId,
          partialResponse: '',
          hostMessage: null,
        };
      case 'output-delta':
        return {
          ...thread,
          partialResponse: (thread.partialResponse + event.delta).slice(
            -REMOTE_CODE_LIMITS.partialResponseLength,
          ),
        };
      case 'thinking-delta':
        return { ...thread, thinking: appendThinking(thread.thinking, event.turnId, event.delta) };
      case 'tool-started':
        return {
          ...thread,
          tools: upsertByKey(
            thread.tools,
            {
              toolCallId: event.toolCallId,
              name: event.name,
              summary: event.summary,
              state: 'running',
              output: '',
              turnId: event.turnId,
            },
            (tool) => tool.toolCallId,
            REMOTE_CODE_LIMITS.tools,
          ),
        };
      case 'tool-finished':
        return {
          ...thread,
          tools: thread.tools.map((tool) =>
            tool.toolCallId === event.toolCallId
              ? {
                  ...tool,
                  state: event.isError ? 'failed' : 'done',
                  output: event.output ?? tool.output,
                }
              : tool,
          ),
        };
      case 'approval-requested': {
        const { type, ...approval } = event;
        return {
          ...thread,
          status: 'awaiting_approval',
          pendingApprovals: upsertByKey(
            thread.pendingApprovals,
            approval,
            (approval) => approval.requestId,
            REMOTE_CODE_LIMITS.pendingApprovals,
          ),
        };
      }
      case 'approval-answered': {
        const pendingApprovals = thread.pendingApprovals.filter(
          (approval) => approval.requestId !== event.requestId,
        );
        return {
          ...thread,
          pendingApprovals,
          approvalHolds: holdsFor(thread.approvalHolds, [
            ...pendingApprovals,
            ...thread.pendingQuestions,
          ]),
          status: pendingApprovals.length === 0 && thread.activeTurnId ? 'running' : thread.status,
        };
      }
      case 'approval-held':
        return [...thread.pendingApprovals, ...thread.pendingQuestions].some(
          (waiting) => waiting.requestId === event.requestId,
        )
          ? {
              ...thread,
              approvalHolds: {
                ...thread.approvalHolds,
                [event.requestId]: { status: event.status, message: event.message },
              },
            }
          : thread;
      case 'user-input-requested':
        return {
          ...thread,
          pendingQuestions: upsertByKey(
            thread.pendingQuestions,
            {
              turnId: event.turnId,
              requestId: event.requestId,
              question: event.question,
              ...(event.options ? { options: event.options } : {}),
              ...(event.answerable ? { answerable: true } : {}),
            },
            (question) => question.requestId,
            REMOTE_CODE_LIMITS.pendingQuestions,
          ),
        };
      case 'user-input-answered': {
        const pendingQuestions = thread.pendingQuestions.filter(
          (question) => question.requestId !== event.requestId,
        );
        return {
          ...thread,
          pendingQuestions,
          approvalHolds: holdsFor(thread.approvalHolds, [
            ...thread.pendingApprovals,
            ...pendingQuestions,
          ]),
        };
      }
      case 'turn-finished':
        return {
          ...thread,
          status: event.outcome === 'failed' ? 'failed' : 'idle',
          activeTurnId: null,
          partialResponse: '',
          pendingApprovals: [],
          approvalHolds: {},
          pendingQuestions: [],
          tools: settleTools(thread.tools),
          ...(event.response
            ? {
                messages: appendMessage(thread, {
                  role: 'assistant',
                  text: event.response,
                  turnId: event.turnId,
                }),
              }
            : {}),
        };
      case 'diff':
        return {
          ...thread,
          diffs: upsertByKey(
            thread.diffs,
            event.diff,
            (diff) => diff.path,
            REMOTE_CODE_LIMITS.diffs,
          ),
        };
      case 'test-run':
        return {
          ...thread,
          testRuns: upsertByKey(
            thread.testRuns,
            event.testRun,
            (run) => run.toolCallId,
            REMOTE_CODE_LIMITS.testRuns,
          ),
        };
      case 'guidance-queued':
        return { ...thread, queuedGuidance: event.queuedGuidance };
      case 'guidance-rejected':
        return {
          ...thread,
          queuedGuidance: event.queuedGuidance,
          rejectedGuidance: mergeRejectedGuidance(
            thread,
            event.rejectedGuidance.map((text, index) => {
              const id = event.requestIds?.[index];
              return { text, reason: event.reason, ...(id ? { requestId: id } : {}) };
            }),
          ),
        };
      case 'guidance-delivered':
        return {
          ...thread,
          queuedGuidance: event.queuedGuidance,
          ...(event.text
            ? {
                messages: appendMessage(thread, {
                  role: 'user',
                  text: event.text,
                  turnId: event.turnId,
                }),
              }
            : {}),
        };
      case 'runtime-stopped':
        return {
          ...thread,
          status: 'failed',
          activeTurnId: null,
          pendingApprovals: [],
          approvalHolds: {},
          pendingQuestions: [],
          tools: settleTools(thread.tools),
          hostMessage: event.message,
        };
    }
  });
  return true;
}

export function ingestRemoteCodeStarted(payload: unknown): boolean {
  const parsed = parseRemoteCodeStarted(payload);
  if (!parsed) return false;
  useRemoteCodeStore.setState((state) =>
    state.starts[parsed.requestId]
      ? {
          starts: {
            ...state.starts,
            [parsed.requestId]: {
              rootId: parsed.rootId,
              threadId: parsed.threadId,
              error: parsed.error,
            },
          },
        }
      : state,
  );
  return true;
}

export function ingestRemoteCodeTranscript(payload: unknown): boolean {
  const parsed = parseRemoteCodeTranscript(payload);
  if (!parsed) return false;
  updateThread(parsed.rootId, parsed.threadId, (thread) => ({
    ...thread,
    transcript: mergeTranscript(thread.transcript, parsed),
  }));
  return true;
}

export function ingestRemoteCodeControl(action: string, payload: unknown): boolean {
  if (action === 'code.sessions') return ingestRemoteCodeSessions(payload);
  if (action === 'code.session.started') return ingestRemoteCodeStarted(payload);
  if (action === 'code.session.transcript') return ingestRemoteCodeTranscript(payload);
  if (action === 'code.session.snapshot') return ingestRemoteCodeSnapshot(payload);
  if (action === 'code.session.event') return ingestRemoteCodeEvent(payload);
  return false;
}
