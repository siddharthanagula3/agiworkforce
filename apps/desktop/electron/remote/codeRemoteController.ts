import {
  REMOTE_CODE_LIMITS,
  REMOTE_CODE_PROTOCOL_VERSION,
  clipRemoteText,
  diffPaths,
  extractUnifiedDiff,
  fitRemoteSnapshot,
  isTestCommand,
  parseRemoteCodeRequest,
  parseTestSummary,
  type RemoteCodeDiff,
  type RemoteCodeFileChange,
  type RemoteCodeLiveEvent,
  type RemoteCodePendingApproval,
  type RemoteCodeRequest,
  type RemoteCodeSessionSnapshot,
  type RemoteCodeSessionStatus,
  type RemoteCodeSessionSummary,
  type RemoteCodeTestRun,
} from '@agiworkforce/types';
import type {
  DeveloperApprovalAnswer,
  DeveloperSessionEvent,
  DeveloperSessionList,
  DeveloperTurnRequest,
} from '@agiworkforce/local-runtime-contract';
import type { DeveloperSessionActivity } from '../runtime/developerSessionService';

export interface CodeRemoteDependencies {
  send: (action: string, payload: Record<string, unknown>) => Promise<boolean>;
  listSessions: () => Promise<DeveloperSessionList>;
  readActivity: (rootId: string, threadId: string) => Promise<DeveloperSessionActivity>;
  startTurn: (request: DeveloperTurnRequest) => Promise<{ turnId: string }>;
  interruptTurn: (rootId: string, threadId: string, turnId: string) => Promise<boolean>;
  answerApproval: (answer: DeveloperApprovalAnswer) => Promise<boolean>;
  readDiff: (rootId: string, paths: readonly string[]) => Promise<string | null>;
  now?: () => number;
}

interface ToolInFlight {
  name: string;
  summary: string;
}

interface ThreadState {
  rootId: string;
  threadId: string;
  attached: boolean;
  activeTurnId: string | null;
  partialResponse: string;
  pendingApprovals: Map<string, RemoteCodePendingApproval>;
  tools: Map<string, ToolInFlight>;
  toolDiffs: Map<string, RemoteCodeDiff>;
  testRuns: RemoteCodeTestRun[];
  queuedGuidance: string[];
}

function threadKey(rootId: string, threadId: string): string {
  return JSON.stringify([rootId, threadId]);
}

function statusFor(state: ThreadState | undefined, persisted: string): RemoteCodeSessionStatus {
  if (state && state.pendingApprovals.size > 0) return 'awaiting_approval';
  if (state?.activeTurnId) return 'running';
  if (
    persisted === 'idle' ||
    persisted === 'running' ||
    persisted === 'awaiting_approval' ||
    persisted === 'failed'
  ) {
    return persisted;
  }
  return 'unknown';
}

function clipDiff(path: string, patch: string): RemoteCodeDiff {
  const truncated = patch.length > REMOTE_CODE_LIMITS.diffLength;
  return { path, patch: patch.slice(0, REMOTE_CODE_LIMITS.diffLength), truncated };
}

function splitDiffByFile(patch: string): RemoteCodeDiff[] {
  const sections = patch.split(/^(?=diff --git )/m).filter((section) => section.trim() !== '');
  return sections.flatMap((section) => {
    const [path] = diffPaths(section);
    return path ? [clipDiff(path, section.trimEnd())] : [];
  });
}

export function createCodeRemoteController(deps: CodeRemoteDependencies) {
  const now = deps.now ?? Date.now;
  const threads = new Map<string, ThreadState>();

  function iso(): string {
    return new Date(now()).toISOString();
  }

  function stateFor(rootId: string, threadId: string): ThreadState {
    const key = threadKey(rootId, threadId);
    let state = threads.get(key);
    if (!state) {
      state = {
        rootId,
        threadId,
        attached: false,
        activeTurnId: null,
        partialResponse: '',
        pendingApprovals: new Map(),
        tools: new Map(),
        toolDiffs: new Map(),
        testRuns: [],
        queuedGuidance: [],
      };
      threads.set(key, state);
    }
    return state;
  }

  function sendEvent(state: ThreadState, event: RemoteCodeLiveEvent): Promise<boolean> {
    if (!state.attached) return Promise.resolve(false);
    return deps.send('code.session.event', {
      action: 'code.session.event',
      version: REMOTE_CODE_PROTOCOL_VERSION,
      rootId: state.rootId,
      threadId: state.threadId,
      event,
      sentAt: iso(),
    });
  }

  async function publishSessions(): Promise<void> {
    const list = await deps.listSessions();
    const sessions: RemoteCodeSessionSummary[] = list.groups
      .flatMap((group) =>
        group.sessions.map((session) => ({
          rootId: session.rootId,
          threadId: session.id,
          title: session.title,
          folder: group.name,
          branch: group.branch,
          status: statusFor(threads.get(threadKey(session.rootId, session.id)), session.status),
          model: session.model,
          updatedAt: session.updatedAt,
        })),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, REMOTE_CODE_LIMITS.sessions);
    await deps.send('code.sessions', {
      action: 'code.sessions',
      version: REMOTE_CODE_PROTOCOL_VERSION,
      sessions,
      unavailable: list.groups.flatMap((group) =>
        group.unavailable ? [{ folder: group.name, message: group.unavailable.message }] : [],
      ),
      syncedAt: iso(),
    });
  }

  async function diffsFor(
    state: ThreadState,
    fileChanges: RemoteCodeFileChange[],
  ): Promise<RemoteCodeDiff[]> {
    const covered = new Set(state.toolDiffs.keys());
    const modified = [
      ...new Set(
        fileChanges
          .filter((change) => change.kind === 'modified' && !covered.has(change.path))
          .map((change) => change.path),
      ),
    ];
    const fromGit = modified.length > 0 ? await deps.readDiff(state.rootId, modified) : null;
    return [...state.toolDiffs.values(), ...(fromGit ? splitDiffByFile(fromGit) : [])].slice(
      -REMOTE_CODE_LIMITS.diffs,
    );
  }

  async function publishSnapshot(state: ThreadState): Promise<void> {
    const activity = await deps.readActivity(state.rootId, state.threadId);
    if (activity.activeTurn) {
      state.activeTurnId = activity.activeTurn.turnId;
      state.partialResponse = activity.activeTurn.partialResponse;
      for (const approval of activity.activeTurn.pendingApprovals) {
        state.pendingApprovals.set(approval.requestId, {
          turnId: activity.activeTurn.turnId,
          requestId: approval.requestId,
          summary: approval.summary,
          detail: approval.detail,
        });
      }
    }
    const fileChanges: RemoteCodeFileChange[] = activity.fileChanges
      .slice(-REMOTE_CODE_LIMITS.fileChanges)
      .map((change) => ({
        path: change.path,
        kind: change.kind,
        tool: change.tool,
        changedAt: change.changedAt,
      }));
    const snapshot: RemoteCodeSessionSnapshot = {
      action: 'code.session.snapshot',
      version: REMOTE_CODE_PROTOCOL_VERSION,
      rootId: state.rootId,
      threadId: state.threadId,
      title: activity.transcript.session.title,
      status: statusFor(state, activity.transcript.session.status),
      activeTurnId: state.activeTurnId,
      partialResponse: clipRemoteText(
        state.partialResponse,
        REMOTE_CODE_LIMITS.partialResponseLength,
      ).text,
      messages: activity.transcript.messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .slice(-REMOTE_CODE_LIMITS.transcriptMessages)
        .map((message) => ({
          role: message.role as 'user' | 'assistant',
          text: clipRemoteText(message.text, REMOTE_CODE_LIMITS.messageLength).text,
        })),
      pendingApprovals: [...state.pendingApprovals.values()],
      fileChanges,
      queuedGuidance: state.queuedGuidance,
      syncedAt: iso(),
    };
    await deps.send(snapshot.action, { ...fitRemoteSnapshot(snapshot) });
    for (const diff of await diffsFor(state, fileChanges)) {
      await sendEvent(state, { type: 'diff', diff });
    }
    for (const testRun of state.testRuns) {
      await sendEvent(state, { type: 'test-run', testRun });
    }
  }

  async function deliverGuidance(state: ThreadState): Promise<void> {
    if (state.activeTurnId || state.queuedGuidance.length === 0) return;
    const text = state.queuedGuidance.join('\n\n');
    state.queuedGuidance = [];
    const { turnId } = await deps.startTurn({
      rootId: state.rootId,
      threadId: state.threadId,
      text,
    });
    state.activeTurnId ??= turnId;
    await sendEvent(state, { type: 'guidance-delivered', turnId, queuedGuidance: [] });
  }

  async function steer(
    request: Extract<RemoteCodeRequest, { action: 'code.session.steer' }>,
  ): Promise<void> {
    const state = stateFor(request.rootId, request.threadId);
    if (state.queuedGuidance.length >= REMOTE_CODE_LIMITS.queuedGuidance) {
      state.queuedGuidance.shift();
    }
    state.queuedGuidance.push(request.text);
    if (!state.activeTurnId) {
      await deliverGuidance(state);
      return;
    }
    await sendEvent(state, { type: 'guidance-queued', queuedGuidance: state.queuedGuidance });
    if (request.interrupt) {
      await deps.interruptTurn(state.rootId, state.threadId, state.activeTurnId);
    }
  }

  async function handleRequest(request: RemoteCodeRequest): Promise<void> {
    switch (request.action) {
      case 'code.sessions.list':
        await publishSessions();
        return;
      case 'code.session.attach': {
        const state = stateFor(request.rootId, request.threadId);
        state.attached = true;
        await publishSnapshot(state);
        return;
      }
      case 'code.session.detach':
        stateFor(request.rootId, request.threadId).attached = false;
        return;
      case 'code.session.steer':
        await steer(request);
        return;
      case 'code.turn.interrupt':
        await deps.interruptTurn(request.rootId, request.threadId, request.turnId);
        return;
      case 'code.approval.respond': {
        const state = stateFor(request.rootId, request.threadId);
        if (!state.pendingApprovals.has(request.approvalRequestId)) return;
        await deps.answerApproval({
          rootId: request.rootId,
          threadId: request.threadId,
          turnId: request.turnId,
          requestId: request.approvalRequestId,
          approved: request.approved,
        });
        return;
      }
    }
  }

  async function handleControl(action: string, payload: unknown): Promise<boolean> {
    const request = parseRemoteCodeRequest(action, payload);
    if (!request) return false;
    await handleRequest(request);
    return true;
  }

  function recordToolFinished(
    state: ThreadState,
    event: Extract<DeveloperSessionEvent, { type: 'tool-finished' }>,
  ): RemoteCodeLiveEvent[] {
    const started = state.tools.get(event.toolCallId);
    state.tools.delete(event.toolCallId);
    const events: RemoteCodeLiveEvent[] = [];
    const patch = extractUnifiedDiff(event.output);
    if (patch) {
      const sections = splitDiffByFile(patch);
      const [path] = diffPaths(patch);
      const diffs = sections.length > 0 ? sections : path ? [clipDiff(path, patch)] : [];
      for (const diff of diffs) {
        state.toolDiffs.set(diff.path, diff);
        events.push({ type: 'diff', diff });
      }
    }
    const command = started?.summary ?? '';
    if (isTestCommand(command)) {
      const testRun: RemoteCodeTestRun = {
        toolCallId: event.toolCallId,
        command: clipRemoteText(command, REMOTE_CODE_LIMITS.messageLength).text,
        ...parseTestSummary(event.output, event.isError),
        output: clipRemoteText(event.output, REMOTE_CODE_LIMITS.testOutputLength).text,
        finishedAt: iso(),
      };
      state.testRuns = [...state.testRuns, testRun].slice(-REMOTE_CODE_LIMITS.testRuns);
      events.push({ type: 'test-run', testRun });
    }
    return events;
  }

  async function handleSessionEvent(rootId: string, event: DeveloperSessionEvent): Promise<void> {
    if (event.type === 'runtime-stopped') {
      for (const state of threads.values()) {
        if (state.rootId !== rootId) continue;
        state.activeTurnId = null;
        state.pendingApprovals.clear();
        await sendEvent(state, { type: 'runtime-stopped', message: event.message });
      }
      return;
    }

    const state = stateFor(rootId, event.threadId);
    switch (event.type) {
      case 'turn-started':
        state.activeTurnId = event.turnId;
        state.partialResponse = '';
        await sendEvent(state, { type: 'turn-started', turnId: event.turnId });
        return;
      case 'output-delta':
        state.partialResponse = clipRemoteText(
          state.partialResponse + event.delta,
          REMOTE_CODE_LIMITS.partialResponseLength,
        ).text;
        await sendEvent(state, {
          type: 'output-delta',
          turnId: event.turnId,
          delta: clipRemoteText(event.delta, REMOTE_CODE_LIMITS.deltaLength).text,
        });
        return;
      case 'tool-started':
        state.tools.set(event.toolCallId, { name: event.name, summary: event.summary });
        await sendEvent(state, {
          type: 'tool-started',
          turnId: event.turnId,
          toolCallId: event.toolCallId,
          name: event.name,
          summary: clipRemoteText(event.summary, REMOTE_CODE_LIMITS.messageLength).text,
        });
        return;
      case 'tool-finished': {
        const derived = recordToolFinished(state, event);
        await sendEvent(state, {
          type: 'tool-finished',
          turnId: event.turnId,
          toolCallId: event.toolCallId,
          name: event.name,
          isError: event.isError,
        });
        for (const live of derived) await sendEvent(state, live);
        return;
      }
      case 'approval-requested': {
        const approval: RemoteCodePendingApproval = {
          turnId: event.turnId,
          requestId: event.requestId,
          summary: clipRemoteText(event.summary, REMOTE_CODE_LIMITS.messageLength).text,
          detail: clipRemoteText(event.detail, REMOTE_CODE_LIMITS.messageLength).text,
        };
        state.pendingApprovals.set(event.requestId, approval);
        await sendEvent(state, { type: 'approval-requested', ...approval });
        return;
      }
      case 'approval-answered':
        state.pendingApprovals.delete(event.requestId);
        await sendEvent(state, {
          type: 'approval-answered',
          requestId: event.requestId,
          approved: event.approved,
        });
        return;
      case 'turn-finished':
        state.activeTurnId = null;
        state.partialResponse = '';
        state.pendingApprovals.clear();
        state.tools.clear();
        await sendEvent(state, {
          type: 'turn-finished',
          turnId: event.turnId,
          outcome: event.outcome,
          response: clipRemoteText(event.response, REMOTE_CODE_LIMITS.messageLength).text,
        });
        if (state.queuedGuidance.length > 0) {
          await deliverGuidance(state);
        } else if (state.attached) {
          await publishSnapshot(state);
        }
        return;
    }
  }

  return {
    handleControl,
    handleSessionEvent,
    attachedThreadCount: () => [...threads.values()].filter((state) => state.attached).length,
    reset: () => {
      for (const state of threads.values()) state.attached = false;
    },
  };
}

export type CodeRemoteController = ReturnType<typeof createCodeRemoteController>;
