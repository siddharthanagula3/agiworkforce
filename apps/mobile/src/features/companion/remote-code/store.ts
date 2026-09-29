import { create } from 'zustand';
import {
  REMOTE_CODE_LIMITS,
  parseRemoteCodeEvent,
  parseRemoteCodeSessions,
  parseRemoteCodeSnapshot,
  parseRemoteCodeStarted,
  parseRemoteCodeTranscript,
  type RemoteCodeDiff,
  type RemoteCodeFileChange,
  type RemoteCodeIndexedMessage,
  type RemoteCodePendingApproval,
  type RemoteCodeRoot,
  type RemoteCodeSessionStatus,
  type RemoteCodeSessionSummary,
  type RemoteCodeTestRun,
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

export interface RemoteCodeThread {
  rootId: string;
  threadId: string;
  title: string;
  status: RemoteCodeSessionStatus;
  activeTurnId: string | null;
  partialResponse: string;
  messages: RemoteCodeTranscriptEntry[];
  pendingApprovals: RemoteCodePendingApproval[];
  fileChanges: RemoteCodeFileChange[];
  diffs: RemoteCodeDiff[];
  testRuns: RemoteCodeTestRun[];
  tools: RemoteCodeToolRecord[];
  transcript: RemoteCodeTranscript | null;
  queuedGuidance: string[];
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
  reset: () => void;
}

export function remoteCodeThreadKey(rootId: string, threadId: string): string {
  return JSON.stringify([rootId, threadId]);
}

export const useRemoteCodeStore = create<RemoteCodeState>((set) => ({
  sessions: [],
  unavailable: [],
  roots: [],
  sessionsSyncedAt: null,
  threads: {},
  starts: {},
  reset: () =>
    set({
      sessions: [],
      unavailable: [],
      roots: [],
      sessionsSyncedAt: null,
      threads: {},
      starts: {},
    }),
}));

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
        fileChanges: parsed.fileChanges,
        diffs: state.threads[key]?.diffs ?? [],
        testRuns: state.threads[key]?.testRuns ?? [],
        tools: parsed.tools.length > 0 ? parsed.tools : (state.threads[key]?.tools ?? []),
        transcript: state.threads[key]?.transcript ?? null,
        queuedGuidance: parsed.queuedGuidance,
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
      case 'approval-requested':
        return {
          ...thread,
          status: 'awaiting_approval',
          pendingApprovals: upsertByKey(
            thread.pendingApprovals,
            {
              turnId: event.turnId,
              requestId: event.requestId,
              summary: event.summary,
              detail: event.detail,
            },
            (approval) => approval.requestId,
            20,
          ),
        };
      case 'approval-answered': {
        const pendingApprovals = thread.pendingApprovals.filter(
          (approval) => approval.requestId !== event.requestId,
        );
        return {
          ...thread,
          pendingApprovals,
          status: pendingApprovals.length === 0 && thread.activeTurnId ? 'running' : thread.status,
        };
      }
      case 'turn-finished':
        return {
          ...thread,
          status: event.outcome === 'failed' ? 'failed' : 'idle',
          activeTurnId: null,
          partialResponse: '',
          pendingApprovals: [],
          tools: settleTools(thread.tools),
          messages: event.response
            ? [...thread.messages, { role: 'assistant' as const, text: event.response }].slice(
                -REMOTE_CODE_LIMITS.transcriptMessages,
              )
            : thread.messages,
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
      case 'guidance-delivered':
        return { ...thread, queuedGuidance: event.queuedGuidance };
      case 'runtime-stopped':
        return {
          ...thread,
          status: 'failed',
          activeTurnId: null,
          pendingApprovals: [],
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
