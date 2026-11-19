import {
  REMOTE_CODE_LIMITS,
  REMOTE_CODE_PROTOCOL_VERSION,
  clipRemoteResult,
  clipRemoteText,
  diffPaths,
  extractUnifiedDiff,
  fitRemoteSnapshot,
  isTestCommand,
  parseDispatchTaskReplies,
  parseRemoteCodeRequest,
  parseTestSummary,
  type RemoteCodeDiff,
  type RemoteCodeFileChange,
  type RemoteCodeIndexedMessage,
  type RemoteCodeLiveEvent,
  type RemoteCodePendingApproval,
  type RemoteCodePendingQuestion,
  type RemoteCodeRequest,
  type RemoteCodeSessionSnapshot,
  type RemoteCodeSessionStatus,
  type RemoteCodeSessionSummary,
  type RemoteCodeTestRun,
  type RemoteCodeThinking,
  type RemoteCodeToolRecord,
  type DispatchTaskControlRequest,
  type DispatchTaskPendingStep,
  type DispatchTaskLifecycleStatus,
} from '@agiworkforce/types';
import {
  isCredentialPath,
  type DeveloperApprovalAnswer,
  type DeveloperApprovalQuestion,
  type DeveloperSessionEvent,
  type DeveloperSessionList,
  type DeveloperSessionTranscript,
  type DeveloperTurnRequest,
  type DeveloperUserInputAnswer,
} from '@agiworkforce/local-runtime-contract';
import type { DeveloperSessionFileChange } from '@agiworkforce/types/protocol';
import { logger, redactSecrets } from '../logger';

const START_WINDOW_MS = 10 * 60_000;
const STARTS_PER_WINDOW = 10;
const CONCURRENT_PHONE_SESSIONS = 8;
const COPY = Object.freeze({
  folderUnavailable: 'AGI Code could not open this folder on the computer. Check it there.',
  folderNotApproved: 'That folder is not approved for AGI Code on this computer.',
  startFailed: 'The session could not be started on this computer. Try again, or start it there.',
  tooManyStarts: 'Too many sessions were started from the phone just now. Wait a few minutes.',
  tooManyRunning:
    'Several sessions started from the phone are still running. Stop one, or wait for one to finish.',
  runtimeStopped: 'AGI Code stopped on this computer. Open it there to start it again.',
  taskFailed: 'The task failed on this computer. Open it there to see why.',
});

function safeText(value: string, limit: number): string {
  return clipRemoteText(redactSecrets(value), limit).text;
}

export interface DeveloperSessionActivity {
  transcript: DeveloperSessionTranscript;
  branch: string | null;
  fileChanges: DeveloperSessionFileChange[];
  activeTurn: {
    turnId: string;
    partialResponse: string;
    pendingApprovals: Array<{ requestId: string; summary: string; detail: string }>;
  } | null;
}

/** Thrown by a dependency when the phone may not reach the folder it named. */
export class RemoteCommandRefused extends Error {}

/**
 * What became of an answer the phone sent. `held` means the computer will not
 * take that allow from a phone alone and is asking the person in front of it;
 * `settled` says how that ended, and never rejects.
 */
export type RemoteApprovalOutcome =
  | { status: 'applied' }
  | {
      status: 'held';
      message: string;
      settled: Promise<{ allowed: boolean; message: string }>;
    };

export interface CodeRemoteDependencies {
  send: (action: string, payload: Record<string, unknown>) => Promise<boolean>;
  listSessions: () => Promise<DeveloperSessionList>;
  readActivity: (rootId: string, threadId: string) => Promise<DeveloperSessionActivity>;
  startTurn: (request: DeveloperTurnRequest) => Promise<{ turnId: string }>;
  interruptTurn: (rootId: string, threadId: string, turnId: string) => Promise<boolean>;
  answerApproval: (answer: DeveloperApprovalAnswer) => Promise<RemoteApprovalOutcome>;
  /** Absent on a host that cannot hand typed answers to the agent; the phone is then told to answer there. */
  answerQuestion?: (answer: DeveloperUserInputAnswer) => Promise<void>;
  readDiff: (rootId: string, paths: readonly string[]) => Promise<string | null>;
  startSession: (rootId: string, title?: string) => Promise<{ threadId: string }>;
  defaultRoot: () => { id: string; name: string } | null;
  now?: () => number;
}

interface DispatchedTask {
  requestId: string;
  rootId: string;
  threadId: string;
  turnId: string;
}

interface DispatchTaskDetail {
  taskId?: string;
  message?: string;
  result?: string;
  error?: string;
  pending?: DispatchTaskPendingStep[];
}

interface ToolInFlight {
  name: string;
  summary: string;
  turnId: string;
}

/**
 * The agent asks in two ways: a question it waits on for typed text, and an
 * approval that carries choices. The phone sees one kind of question, and this
 * records which way its answer has to travel back.
 */
type QuestionSource = 'input' | 'approval';
const RUNNING_TASK_STATES: ReadonlySet<string> = new Set(['queued', 'running']);

interface ThreadState {
  rootId: string;
  threadId: string;
  attached: boolean;
  activeTurnId: string | null;
  partialResponse: string;
  pendingApprovals: Map<string, RemoteCodePendingApproval>;
  pendingQuestions: Map<string, RemoteCodePendingQuestion>;
  questionSources: Map<string, QuestionSource>;
  thinking: RemoteCodeThinking[];
  runningTasks: number;
  tools: Map<string, ToolInFlight>;
  toolDiffs: Map<string, RemoteCodeDiff>;
  testRuns: RemoteCodeTestRun[];
  toolHistory: RemoteCodeToolRecord[];
  queuedGuidance: string[];
  eventsDuringReads: Set<DeveloperSessionEvent[]>;
}

function threadKey(rootId: string, threadId: string): string {
  return JSON.stringify([rootId, threadId]);
}

function awaitsChoice(state: ThreadState): boolean {
  for (const source of state.questionSources.values()) {
    if (source === 'approval') return true;
  }
  return false;
}

function statusFor(state: ThreadState | undefined, persisted: string): RemoteCodeSessionStatus {
  if (state && (state.pendingApprovals.size > 0 || awaitsChoice(state))) return 'awaiting_approval';
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

function pendingApprovalFrom(
  event: Extract<DeveloperSessionEvent, { type: 'approval-requested' }>,
): RemoteCodePendingApproval {
  return {
    turnId: event.turnId,
    requestId: event.requestId,
    summary: safeText(event.summary, REMOTE_CODE_LIMITS.messageLength),
    detail: safeText(event.detail, REMOTE_CODE_LIMITS.messageLength),
  };
}

function typedQuestionFrom(
  turnId: string,
  asked: { requestId: string; question: string },
  answerable: boolean,
): RemoteCodePendingQuestion {
  return {
    turnId,
    requestId: asked.requestId,
    question: safeText(asked.question, REMOTE_CODE_LIMITS.messageLength),
    ...(answerable ? { answerable: true } : {}),
  };
}

function choiceQuestionFrom(
  turnId: string,
  requestId: string,
  asked: DeveloperApprovalQuestion,
): RemoteCodePendingQuestion {
  const options = asked.options
    .slice(0, REMOTE_CODE_LIMITS.questionOptions)
    .map((option) => safeText(option, REMOTE_CODE_LIMITS.questionOptionLength));
  return {
    turnId,
    requestId,
    question: safeText(asked.question, REMOTE_CODE_LIMITS.messageLength),
    ...(options.length > 0 ? { options } : {}),
    answerable: true,
  };
}

function setQuestion(
  state: ThreadState,
  question: RemoteCodePendingQuestion,
  source: QuestionSource,
): void {
  state.pendingQuestions.set(question.requestId, question);
  state.questionSources.set(question.requestId, source);
}

function dropQuestion(state: ThreadState, requestId: string): boolean {
  state.questionSources.delete(requestId);
  return state.pendingQuestions.delete(requestId);
}

function clearQuestions(state: ThreadState): void {
  state.pendingQuestions.clear();
  state.questionSources.clear();
}

function validTurnId(value: string | undefined): string | undefined {
  return value && value.length <= REMOTE_CODE_LIMITS.idLength ? value : undefined;
}

/**
 * Applies what the events that arrived while a snapshot was being read did to
 * the turn, its approvals and its questions. The read may have been taken
 * before or after any of them, so only effects that land the same either way
 * are reapplied: output is rebuilt only from a turn whose start is among them.
 */
function reapplyEventsAfterSnapshot(
  state: ThreadState,
  events: DeveloperSessionEvent[],
  takesTypedAnswers: boolean,
): void {
  let rebuiltTurn: string | null = null;
  for (const event of events) {
    switch (event.type) {
      case 'turn-started':
        state.activeTurnId = event.turnId;
        state.partialResponse = '';
        rebuiltTurn = event.turnId;
        break;
      case 'output-delta':
        if (event.turnId === rebuiltTurn) {
          state.partialResponse = clipRemoteText(
            state.partialResponse + event.delta,
            REMOTE_CODE_LIMITS.partialResponseLength,
          ).text;
        }
        break;
      case 'approval-requested':
        if (event.question) {
          setQuestion(
            state,
            choiceQuestionFrom(event.turnId, event.requestId, event.question),
            'approval',
          );
        } else {
          state.pendingApprovals.set(event.requestId, pendingApprovalFrom(event));
        }
        break;
      case 'approval-answered':
        state.pendingApprovals.delete(event.requestId);
        dropQuestion(state, event.requestId);
        break;
      case 'user-input-requested':
        setQuestion(state, typedQuestionFrom(event.turnId, event, takesTypedAnswers), 'input');
        break;
      case 'user-input-answered':
        dropQuestion(state, event.requestId);
        break;
      case 'turn-finished':
      case 'runtime-stopped':
        state.activeTurnId = null;
        state.partialResponse = '';
        state.pendingApprovals.clear();
        clearQuestions(state);
        rebuiltTurn = null;
        break;
    }
  }
}

function boundedText(value: unknown, maxLength?: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return maxLength === undefined || trimmed.length <= maxLength ? trimmed : null;
}

export function parseDispatchTask(
  action: string,
  payload: unknown,
): DispatchTaskControlRequest | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (record['version'] !== 1) return null;
  const requestId = boundedText(record['requestId'], REMOTE_CODE_LIMITS.idLength);
  const sentAt = record['sentAt'];
  if (!requestId || typeof sentAt !== 'string' || !Number.isFinite(Date.parse(sentAt))) {
    return null;
  }
  if (action === 'dispatch.task.create') {
    const prompt = boundedText(record['prompt']);
    const title = record['title'] === undefined ? undefined : boundedText(record['title']);
    if (!prompt || title === null) return null;
    return { action, version: 1, requestId, prompt, ...(title ? { title } : {}), sentAt };
  }
  if (action === 'dispatch.task.cancel') {
    const taskId =
      record['taskId'] === undefined
        ? undefined
        : boundedText(record['taskId'], REMOTE_CODE_LIMITS.idLength);
    if (taskId === null) return null;
    return { action, version: 1, requestId, ...(taskId ? { taskId } : {}), sentAt };
  }
  if (action === 'dispatch.task.reply') {
    const taskRequestId = boundedText(record['taskRequestId'], REMOTE_CODE_LIMITS.idLength);
    const replies = parseDispatchTaskReplies(record['replies']);
    if (!taskRequestId || !replies) return null;
    return { action, version: 1, requestId, taskRequestId, replies, sentAt };
  }
  return null;
}

function settleTools(tools: RemoteCodeToolRecord[]): RemoteCodeToolRecord[] {
  return tools.map((tool) =>
    tool.state === 'running' ? { ...tool, state: 'failed' as const } : tool,
  );
}

const PATCH_SOURCE =
  /^(?:--- a\/|\+\+\+ b\/|rename from |rename to |copy from |copy to )([\s\S]+)$/u;
const PATCH_HEADER_PREFIX = 'diff --git a/';
const PATCH_HEADER_SEPARATOR = ' b/';

function patchHeaderSources(line: string): string[] {
  if (!line.startsWith(PATCH_HEADER_PREFIX)) return [];
  const separator = line.lastIndexOf(
    PATCH_HEADER_SEPARATOR,
    line.length - PATCH_HEADER_SEPARATOR.length - 1,
  );
  if (separator <= PATCH_HEADER_PREFIX.length) return [];
  const destination = line.slice(separator + PATCH_HEADER_SEPARATOR.length);
  if (!destination) return [];
  return [line.slice(PATCH_HEADER_PREFIX.length, separator).trim(), destination.trim()];
}

/**
 * Every file a patch reads from or writes to, not only the one it is filed
 * under: a rename or a copy carries the contents of the file it came from.
 */
function patchSources(patch: string): string[] {
  const paths: string[] = [];
  for (const line of patch.split('\n')) {
    paths.push(...patchHeaderSources(line));
    const source = PATCH_SOURCE.exec(line)?.[1]?.trim();
    if (source) paths.push(source);
  }
  return paths;
}

export const WITHHELD_DIFF =
  'Contents withheld: this file holds credentials, so its changes are not sent to the phone.';

/**
 * Every diff sent to the phone is built here, whichever way it arrived: read
 * from git, scraped from a tool's output, or stated by the runtime. A change
 * to a credential file is named and nothing more, the same files the agent's
 * own file reads refuse.
 */
function clipDiff(path: string, patch: string): RemoteCodeDiff {
  if (isCredentialPath(path) || patchSources(patch).some(isCredentialPath)) {
    return { path, patch: WITHHELD_DIFF, truncated: false };
  }
  const safe = redactSecrets(patch);
  const truncated = safe.length > REMOTE_CODE_LIMITS.diffLength;
  return { path, patch: safe.slice(0, REMOTE_CODE_LIMITS.diffLength), truncated };
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
  const dispatches = new Map<string, DispatchedTask>();
  const phoneStarts: number[] = [];
  const phoneThreads = new Set<string>();
  const takesTypedAnswers = deps.answerQuestion !== undefined;
  let pairing = 0;

  function isCurrent(state: ThreadState): boolean {
    return threads.get(threadKey(state.rootId, state.threadId)) === state;
  }

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
        pendingQuestions: new Map(),
        questionSources: new Map(),
        thinking: [],
        runningTasks: 0,
        tools: new Map(),
        toolDiffs: new Map(),
        testRuns: [],
        toolHistory: [],
        queuedGuidance: [],
        eventsDuringReads: new Set(),
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
    const roots = list.groups.slice(0, REMOTE_CODE_LIMITS.roots).map((group) => ({
      rootId: group.rootId,
      name: group.name,
      branch: group.branch,
      available: group.unavailable === undefined,
    }));
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
          ...(session.origin && session.origin !== 'unknown' ? { origin: session.origin } : {}),
          ...(session.location === 'cloud' ? { location: 'cloud' as const } : {}),
        })),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, REMOTE_CODE_LIMITS.sessions);
    await deps.send('code.sessions', {
      action: 'code.sessions',
      version: REMOTE_CODE_PROTOCOL_VERSION,
      sessions,
      unavailable: list.groups.flatMap((group) =>
        group.unavailable ? [{ folder: group.name, message: COPY.folderUnavailable }] : [],
      ),
      roots,
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
    const readable = modified.filter((path) => !isCredentialPath(path));
    const fromGit = readable.length > 0 ? await deps.readDiff(state.rootId, readable) : null;
    return [
      ...state.toolDiffs.values(),
      ...modified.filter(isCredentialPath).map((path) => clipDiff(path, '')),
      ...(fromGit ? splitDiffByFile(fromGit) : []),
    ].slice(-REMOTE_CODE_LIMITS.diffs);
  }

  /**
   * The runtime's answer replaces what this controller remembered, it is not
   * merged into it. Session events are not relayed while no phone is
   * connected, so a turn that ended in that time would otherwise stay
   * "running" here for good, and every later message would wait behind it.
   * Events that arrive during the read are applied again on top of it, so an
   * older read cannot bring back an approval that was answered meanwhile.
   */
  async function publishSnapshot(state: ThreadState): Promise<void> {
    const arrived: DeveloperSessionEvent[] = [];
    state.eventsDuringReads.add(arrived);
    let activity: DeveloperSessionActivity;
    try {
      activity = await deps.readActivity(state.rootId, state.threadId);
    } finally {
      state.eventsDuringReads.delete(arrived);
    }
    if (!isCurrent(state)) return;
    const running = activity.activeTurn;
    state.activeTurnId = running?.turnId ?? null;
    state.partialResponse = running?.partialResponse ?? '';
    const askedTurn = activity.transcript.activeTurn;
    const choices = new Map(
      (askedTurn?.approvals ?? []).flatMap((approval) =>
        approval.question ? [[approval.requestId, approval.question] as const] : [],
      ),
    );
    state.pendingApprovals.clear();
    if (running) {
      for (const approval of running.pendingApprovals) {
        if (choices.has(approval.requestId)) continue;
        state.pendingApprovals.set(approval.requestId, {
          turnId: running.turnId,
          requestId: approval.requestId,
          summary: approval.summary,
          detail: approval.detail,
        });
      }
    } else {
      state.tools.clear();
      state.toolDiffs.clear();
    }
    clearQuestions(state);
    if (askedTurn) {
      for (const question of askedTurn.questions) {
        setQuestion(
          state,
          typedQuestionFrom(askedTurn.turnId, question, takesTypedAnswers),
          'input',
        );
      }
      for (const [requestId, asked] of choices) {
        setQuestion(state, choiceQuestionFrom(askedTurn.turnId, requestId, asked), 'approval');
      }
    }
    state.runningTasks = Math.min(
      REMOTE_CODE_LIMITS.runningTasks,
      (activity.transcript.childTasks ?? []).filter((task) => RUNNING_TASK_STATES.has(task.state))
        .length,
    );
    reapplyEventsAfterSnapshot(state, arrived, takesTypedAnswers);
    const fileChanges: RemoteCodeFileChange[] = activity.fileChanges
      .flatMap((change) => (change.kind === 'deleted' ? [] : [{ ...change, kind: change.kind }]))
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
      partialResponse: safeText(state.partialResponse, REMOTE_CODE_LIMITS.partialResponseLength),
      messages: activity.transcript.messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .slice(-REMOTE_CODE_LIMITS.transcriptMessages)
        .map((message) => {
          const turnId = validTurnId(message.turnId);
          return {
            role: message.role as 'user' | 'assistant',
            text: safeText(message.text, REMOTE_CODE_LIMITS.messageLength),
            ...(turnId ? { turnId } : {}),
          };
        }),
      pendingApprovals: [...state.pendingApprovals.values()].slice(
        -REMOTE_CODE_LIMITS.pendingApprovals,
      ),
      pendingQuestions: [...state.pendingQuestions.values()].slice(
        -REMOTE_CODE_LIMITS.pendingQuestions,
      ),
      fileChanges,
      queuedGuidance: state.queuedGuidance,
      tools: state.toolHistory,
      thinking: state.thinking,
      runningTasks: state.runningTasks,
      syncedAt: iso(),
    };
    await deps.send(snapshot.action, { ...fitRemoteSnapshot(snapshot) });
    for (const diff of await diffsFor(state, fileChanges)) {
      await sendEvent(state, { type: 'diff', diff });
    }
    for (const testRun of state.testRuns) {
      await sendEvent(state, { type: 'test-run', testRun });
    }
    await deliverGuidance(state);
  }

  async function startSession(
    request: Extract<RemoteCodeRequest, { action: 'code.session.start' }>,
  ): Promise<void> {
    const reply = (detail: { threadId: string } | { error: string }) =>
      deps.send('code.session.started', {
        action: 'code.session.started',
        version: REMOTE_CODE_PROTOCOL_VERSION,
        requestId: request.requestId,
        rootId: request.rootId,
        threadId: 'threadId' in detail ? detail.threadId : null,
        error: 'error' in detail ? detail.error : null,
        sentAt: iso(),
      });
    const refusal = startRefusal();
    if (refusal) {
      await reply({ error: refusal });
      return;
    }
    const owner = pairing;
    const list = await deps.listSessions();
    if (owner !== pairing) return;
    const root = list.groups.find((group) => group.rootId === request.rootId);
    if (!root || root.unavailable) {
      if (root?.unavailable) logger.warn('[remote-control] folder unavailable', root.unavailable);
      await reply({ error: root ? COPY.folderUnavailable : COPY.folderNotApproved });
      return;
    }
    let threadId: string;
    try {
      const title =
        request.title ?? clipRemoteText(request.text, REMOTE_CODE_LIMITS.titleLength).text;
      threadId = (await deps.startSession(root.rootId, title)).threadId;
      if (owner !== pairing) return;
      const { turnId } = await deps.startTurn({
        rootId: root.rootId,
        threadId,
        text: request.text,
      });
      stateFor(root.rootId, threadId).activeTurnId ??= turnId;
      recordPhoneStart(root.rootId, threadId);
    } catch (error) {
      logger.warn('[remote-control] session start failed', error);
      await reply({ error: COPY.startFailed });
      return;
    }
    await reply({ threadId });
    await publishSessions();
  }

  async function publishTranscript(
    request: Extract<RemoteCodeRequest, { action: 'code.session.history' }>,
  ): Promise<void> {
    const activity = await deps.readActivity(request.rootId, request.threadId);
    const eligible = activity.transcript.messages.flatMap((message, position) => {
      const index = message.index ?? position;
      if (message.role !== 'user' && message.role !== 'assistant') return [];
      if (request.before !== null && index >= request.before) return [];
      const turnId = validTurnId(message.turnId);
      return [
        {
          role: message.role,
          text: safeText(message.text, REMOTE_CODE_LIMITS.historyMessageLength),
          index,
          ...(turnId ? { turnId } : {}),
        } satisfies RemoteCodeIndexedMessage,
      ];
    });
    const page: RemoteCodeIndexedMessage[] = [];
    let bytes = 0;
    for (let position = eligible.length - 1; position >= 0; position -= 1) {
      const message = eligible[position];
      if (!message) continue;
      const size = JSON.stringify(message).length + 1;
      if (
        page.length >= REMOTE_CODE_LIMITS.historyMessages ||
        (page.length > 0 && bytes + size > REMOTE_CODE_LIMITS.payloadBytes - 1_000)
      ) {
        break;
      }
      bytes += size;
      page.unshift(message);
    }
    await deps.send('code.session.transcript', {
      action: 'code.session.transcript',
      version: REMOTE_CODE_PROTOCOL_VERSION,
      rootId: request.rootId,
      threadId: request.threadId,
      before: request.before,
      messages: page,
      hasEarlier:
        page.length > 0 && (page.length < eligible.length || activity.transcript.truncated),
      syncedAt: iso(),
    });
  }

  function startRefusal(): string | null {
    const now = Date.now();
    while (phoneStarts.length > 0 && (phoneStarts[0] ?? now) < now - START_WINDOW_MS) {
      phoneStarts.shift();
    }
    if (phoneStarts.length >= STARTS_PER_WINDOW) return COPY.tooManyStarts;
    for (const key of phoneThreads) {
      if (!threads.get(key)?.activeTurnId) phoneThreads.delete(key);
    }
    return phoneThreads.size >= CONCURRENT_PHONE_SESSIONS ? COPY.tooManyRunning : null;
  }

  function recordPhoneStart(rootId: string, threadId: string): void {
    phoneStarts.push(Date.now());
    phoneThreads.add(threadKey(rootId, threadId));
  }

  async function deliverGuidance(state: ThreadState): Promise<void> {
    if (!isCurrent(state) || state.activeTurnId || state.queuedGuidance.length === 0) return;
    const text = state.queuedGuidance.join('\n\n');
    state.queuedGuidance = [];
    const { turnId } = await deps.startTurn({
      rootId: state.rootId,
      threadId: state.threadId,
      text,
    });
    state.activeTurnId ??= turnId;
    await sendEvent(state, {
      type: 'guidance-delivered',
      turnId,
      queuedGuidance: [],
      text: safeText(text, REMOTE_CODE_LIMITS.historyMessageLength),
    });
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

  function sendTaskStatus(
    requestId: string,
    status: DispatchTaskLifecycleStatus,
    detail: DispatchTaskDetail = {},
  ): Promise<boolean> {
    return deps.send('dispatch.task.status', {
      version: 1,
      requestId,
      status,
      ...detail,
      updatedAt: iso(),
    });
  }

  function dispatchFor(rootId: string, threadId: string): DispatchedTask | undefined {
    for (const task of dispatches.values()) {
      if (task.rootId === rootId && task.threadId === threadId) return task;
    }
    return undefined;
  }

  async function startDispatchedTask(
    request: Extract<DispatchTaskControlRequest, { action: 'dispatch.task.create' }>,
  ): Promise<void> {
    const root = deps.defaultRoot();
    if (!root) {
      await sendTaskStatus(request.requestId, 'rejected', {
        error:
          'No folder is approved on this computer. Approve one in AGI Desktop on the computer, then send the task again.',
      });
      return;
    }
    const refusal = startRefusal();
    if (refusal) {
      await sendTaskStatus(request.requestId, 'rejected', { error: refusal });
      return;
    }
    let started: DispatchedTask;
    const owner = pairing;
    try {
      const { threadId } = await deps.startSession(root.id, request.title);
      if (owner !== pairing) return;
      const { turnId } = await deps.startTurn({
        rootId: root.id,
        threadId,
        text: request.prompt,
      });
      started = { requestId: request.requestId, rootId: root.id, threadId, turnId };
    } catch (error) {
      logger.warn('[remote-control] dispatched task failed to start', error);
      await sendTaskStatus(request.requestId, 'failed', { error: COPY.startFailed });
      return;
    }
    dispatches.set(request.requestId, started);
    stateFor(started.rootId, started.threadId).activeTurnId ??= started.turnId;
    recordPhoneStart(started.rootId, started.threadId);
    await sendTaskStatus(request.requestId, 'running', {
      taskId: started.threadId,
      message: `Started in ${root.name}.`,
    });
    await publishSessions();
  }

  function pendingSteps(state: ThreadState): DispatchTaskPendingStep[] {
    return [...state.pendingApprovals.values()].map((approval) => ({
      toolCallId: approval.requestId,
      kind: 'approval' as const,
      summary: approval.summary,
    }));
  }

  async function replyToDispatchedTask(
    request: Extract<DispatchTaskControlRequest, { action: 'dispatch.task.reply' }>,
  ): Promise<void> {
    const task = dispatches.get(request.taskRequestId);
    const state = task ? threads.get(threadKey(task.rootId, task.threadId)) : undefined;
    if (!task || !state) return;
    for (const reply of request.replies) {
      const approval = state.pendingApprovals.get(reply.toolCallId);
      if (reply.kind !== 'approval' || !approval) continue;
      let outcome: RemoteApprovalOutcome;
      try {
        outcome = await deps.answerApproval({
          rootId: task.rootId,
          threadId: task.threadId,
          turnId: approval.turnId,
          requestId: approval.requestId,
          decision: reply.approved ? 'approve_once' : 'deny',
        });
      } catch (error) {
        if (!(error instanceof RemoteCommandRefused)) throw error;
        await sendTaskStatus(task.requestId, 'awaiting_input', {
          taskId: task.threadId,
          message: error.message,
          pending: pendingSteps(state),
        });
        continue;
      }
      if (outcome.status === 'held') {
        await sendTaskStatus(task.requestId, 'awaiting_input', {
          taskId: task.threadId,
          message: outcome.message,
          pending: pendingSteps(state),
        });
      }
    }
  }

  async function cancelDispatchedTask(
    request: Extract<DispatchTaskControlRequest, { action: 'dispatch.task.cancel' }>,
  ): Promise<void> {
    const task = dispatches.get(request.requestId);
    if (!task || (request.taskId !== undefined && request.taskId !== task.threadId)) {
      await sendTaskStatus(request.requestId, 'rejected', {
        error: 'No matching task is running on this computer.',
      });
      return;
    }
    await deps.interruptTurn(task.rootId, task.threadId, task.turnId);
  }

  async function reportDispatchedTurn(
    task: DispatchedTask,
    event: Extract<DeveloperSessionEvent, { type: 'turn-finished' }>,
  ): Promise<void> {
    if (event.turnId !== task.turnId) return;
    dispatches.delete(task.requestId);
    const response = clipRemoteResult(
      redactSecrets(event.response),
      REMOTE_CODE_LIMITS.partialResponseLength,
    );
    if (event.outcome === 'completed') {
      await sendTaskStatus(task.requestId, 'completed', {
        taskId: task.threadId,
        ...(response ? { result: response } : {}),
      });
      return;
    }
    if (event.outcome === 'interrupted') {
      await sendTaskStatus(task.requestId, 'cancelled', {
        taskId: task.threadId,
        message: 'The task was stopped on this computer.',
      });
      return;
    }
    if (event.failure) logger.warn('[remote-control] dispatched task failed', event.failure);
    await sendTaskStatus(task.requestId, 'failed', {
      taskId: task.threadId,
      error: COPY.taskFailed,
    });
  }

  /**
   * The phone is told what became of its answer whenever it was not simply
   * applied. An allow the computer holds for its own confirmation, or refuses,
   * would otherwise look accepted on the phone while nothing happened.
   */
  async function answerApproval(
    state: ThreadState,
    request: {
      rootId: string;
      threadId: string;
      turnId: string;
      approvalRequestId: string;
      approved: boolean;
      note?: string;
    },
  ): Promise<void> {
    const requestId = request.approvalRequestId;
    const held = (status: 'waiting' | 'allowed' | 'refused', message: string) =>
      sendEvent(state, {
        type: 'approval-held',
        requestId,
        status,
        message: clipRemoteText(message, REMOTE_CODE_LIMITS.messageLength).text,
      });
    let outcome: RemoteApprovalOutcome;
    try {
      outcome = await deps.answerApproval({
        rootId: request.rootId,
        threadId: request.threadId,
        turnId: request.turnId,
        requestId,
        decision: request.approved ? 'approve_once' : 'deny',
        ...(request.note ? { note: request.note } : {}),
      });
    } catch (error) {
      if (!(error instanceof RemoteCommandRefused)) throw error;
      await held('refused', error.message);
      return;
    }
    if (outcome.status !== 'held') return;
    await held('waiting', outcome.message);
    void outcome.settled
      .then(({ allowed, message }) => held(allowed ? 'allowed' : 'refused', message))
      .catch((error: unknown) => {
        logger.warn('[remote-control] the phone was not told how a held approval ended', error);
      });
  }

  /**
   * A choice travels back as the approval it was asked through, so the
   * computer's own rules on what a phone may allow still decide it. Typed text
   * goes to the question the agent is waiting on.
   */
  async function answerQuestion(
    state: ThreadState,
    request: Extract<RemoteCodeRequest, { action: 'code.question.respond' }>,
  ): Promise<void> {
    const question = state.pendingQuestions.get(request.questionRequestId);
    const source = state.questionSources.get(request.questionRequestId);
    if (!question || !source) return;
    if (source === 'approval') {
      await answerApproval(state, {
        rootId: request.rootId,
        threadId: request.threadId,
        turnId: question.turnId,
        approvalRequestId: question.requestId,
        approved: request.answer !== null,
        ...(request.answer ? { note: request.answer } : {}),
      });
      return;
    }
    if (!deps.answerQuestion) return;
    await deps.answerQuestion({
      rootId: request.rootId,
      threadId: request.threadId,
      turnId: question.turnId,
      requestId: question.requestId,
      answer: request.answer,
    });
  }

  async function handleRequest(request: RemoteCodeRequest): Promise<void> {
    switch (request.action) {
      case 'code.sessions.list':
        await publishSessions();
        return;
      case 'code.session.attach': {
        const state = stateFor(request.rootId, request.threadId);
        state.attached = true;
        try {
          await publishSnapshot(state);
        } catch (error) {
          if (error instanceof RemoteCommandRefused) state.attached = false;
          throw error;
        }
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
      case 'code.session.start':
        await startSession(request);
        return;
      case 'code.session.history':
        await publishTranscript(request);
        return;
      case 'code.approval.respond': {
        const state = stateFor(request.rootId, request.threadId);
        if (!state.pendingApprovals.has(request.approvalRequestId)) return;
        await answerApproval(state, request);
        return;
      }
      case 'code.question.respond':
        await answerQuestion(stateFor(request.rootId, request.threadId), request);
        return;
    }
  }

  async function handleControl(action: string, payload: unknown): Promise<boolean> {
    const dispatch = parseDispatchTask(action, payload);
    if (dispatch?.action === 'dispatch.task.create') {
      await startDispatchedTask(dispatch);
      return true;
    }
    if (dispatch?.action === 'dispatch.task.cancel') {
      await cancelDispatchedTask(dispatch);
      return true;
    }
    if (dispatch?.action === 'dispatch.task.reply') {
      await replyToDispatchedTask(dispatch);
      return true;
    }
    const request = parseRemoteCodeRequest(action, payload);
    if (!request) return false;
    await handleRequest(request);
    return true;
  }

  function recordThinking(state: ThreadState, turnId: string, delta: string): void {
    const kept = state.thinking.find((entry) => entry.turnId === turnId);
    const text = safeText((kept?.text ?? '') + delta, REMOTE_CODE_LIMITS.thinkingLength);
    state.thinking = [
      ...state.thinking.filter((entry) => entry.turnId !== turnId),
      { turnId, text },
    ].slice(-REMOTE_CODE_LIMITS.thinkingTurns);
  }

  function recordToolFinished(
    state: ThreadState,
    event: Extract<DeveloperSessionEvent, { type: 'tool-finished' }>,
  ): RemoteCodeLiveEvent[] {
    const started = state.tools.get(event.toolCallId);
    state.tools.delete(event.toolCallId);
    const output = safeText(event.output, REMOTE_CODE_LIMITS.toolOutputLength);
    const record: RemoteCodeToolRecord = {
      toolCallId: event.toolCallId,
      name: event.name,
      summary: safeText(started?.summary ?? event.name, REMOTE_CODE_LIMITS.messageLength),
      state: event.isError ? 'failed' : 'done',
      output,
      turnId: event.turnId,
    };
    state.toolHistory = [
      ...state.toolHistory.filter((tool) => tool.toolCallId !== event.toolCallId),
      record,
    ].slice(-REMOTE_CODE_LIMITS.tools);
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
        command: safeText(command, REMOTE_CODE_LIMITS.messageLength),
        ...parseTestSummary(event.output, event.isError),
        output: safeText(event.output, REMOTE_CODE_LIMITS.testOutputLength),
        finishedAt: iso(),
      };
      state.testRuns = [...state.testRuns, testRun].slice(-REMOTE_CODE_LIMITS.testRuns);
      events.push({ type: 'test-run', testRun });
    }
    return events;
  }

  async function handleSessionEvent(rootId: string, event: DeveloperSessionEvent): Promise<void> {
    if (event.type === 'runtime-stopped') {
      logger.warn('[remote-control] runtime stopped', event.message);
      for (const state of threads.values()) {
        if (state.rootId !== rootId) continue;
        for (const arrived of state.eventsDuringReads) arrived.push(event);
        state.activeTurnId = null;
        state.pendingApprovals.clear();
        clearQuestions(state);
        state.toolHistory = settleTools(state.toolHistory);
        await sendEvent(state, { type: 'runtime-stopped', message: COPY.runtimeStopped });
      }
      for (const task of [...dispatches.values()]) {
        if (task.rootId !== rootId) continue;
        dispatches.delete(task.requestId);
        await sendTaskStatus(task.requestId, 'failed', {
          taskId: task.threadId,
          error: COPY.runtimeStopped,
        });
      }
      return;
    }

    const state = stateFor(rootId, event.threadId);
    for (const arrived of state.eventsDuringReads) arrived.push(event);
    switch (event.type) {
      case 'turn-started':
        state.activeTurnId = event.turnId;
        state.partialResponse = '';
        state.toolDiffs.clear();
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
          delta: safeText(event.delta, REMOTE_CODE_LIMITS.deltaLength),
        });
        return;
      case 'reasoning-delta':
        recordThinking(state, event.turnId, event.delta);
        await sendEvent(state, {
          type: 'thinking-delta',
          turnId: event.turnId,
          delta: safeText(event.delta, REMOTE_CODE_LIMITS.deltaLength),
        });
        return;
      case 'tool-started':
        state.tools.set(event.toolCallId, {
          name: event.name,
          summary: event.summary,
          turnId: event.turnId,
        });
        state.toolHistory = [
          ...state.toolHistory.filter((tool) => tool.toolCallId !== event.toolCallId),
          {
            toolCallId: event.toolCallId,
            name: event.name,
            summary: safeText(event.summary, REMOTE_CODE_LIMITS.messageLength),
            state: 'running' as const,
            output: '',
            turnId: event.turnId,
          },
        ].slice(-REMOTE_CODE_LIMITS.tools);
        await sendEvent(state, {
          type: 'tool-started',
          turnId: event.turnId,
          toolCallId: event.toolCallId,
          name: event.name,
          summary: safeText(event.summary, REMOTE_CODE_LIMITS.messageLength),
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
          output: safeText(event.output, REMOTE_CODE_LIMITS.toolOutputLength),
        });
        for (const live of derived) await sendEvent(state, live);
        return;
      }
      case 'approval-requested': {
        if (event.question) {
          const question = choiceQuestionFrom(event.turnId, event.requestId, event.question);
          setQuestion(state, question, 'approval');
          await sendEvent(state, { type: 'user-input-requested', ...question });
          const asked = dispatchFor(rootId, event.threadId);
          if (asked) {
            await sendTaskStatus(asked.requestId, 'awaiting_input', {
              taskId: asked.threadId,
              message: `Waiting for an answer: ${question.question}`,
              pending: pendingSteps(state),
            });
          }
          return;
        }
        const approval = pendingApprovalFrom(event);
        state.pendingApprovals.set(event.requestId, approval);
        await sendEvent(state, { type: 'approval-requested', ...approval });
        const task = dispatchFor(rootId, event.threadId);
        if (task) {
          await sendTaskStatus(task.requestId, 'awaiting_input', {
            taskId: task.threadId,
            message: `Waiting for approval: ${approval.summary}`,
            pending: pendingSteps(state),
          });
        }
        return;
      }
      case 'user-input-requested': {
        const question = typedQuestionFrom(event.turnId, event, takesTypedAnswers);
        setQuestion(state, question, 'input');
        await sendEvent(state, { type: 'user-input-requested', ...question });
        return;
      }
      case 'user-input-answered':
        dropQuestion(state, event.requestId);
        await sendEvent(state, { type: 'user-input-answered', requestId: event.requestId });
        return;
      case 'turn-diff': {
        // The runtime now states what the turn changed, so the phone stops
        // depending on a diff scraped out of a tool's own text output.
        for (const diff of splitDiffByFile(event.unifiedDiff)) {
          state.toolDiffs.set(diff.path, diff);
          await sendEvent(state, { type: 'diff', diff });
        }
        return;
      }
      case 'approval-answered': {
        if (dropQuestion(state, event.requestId)) {
          await sendEvent(state, { type: 'user-input-answered', requestId: event.requestId });
        } else {
          state.pendingApprovals.delete(event.requestId);
          await sendEvent(state, {
            type: 'approval-answered',
            requestId: event.requestId,
            approved: event.approved,
          });
        }
        const task = dispatchFor(rootId, event.threadId);
        if (task && state.pendingApprovals.size === 0 && !awaitsChoice(state)) {
          await sendTaskStatus(task.requestId, 'running', { taskId: task.threadId });
        }
        return;
      }
      case 'turn-finished': {
        state.activeTurnId = null;
        state.partialResponse = '';
        state.pendingApprovals.clear();
        clearQuestions(state);
        state.tools.clear();
        state.toolHistory = settleTools(state.toolHistory);
        await sendEvent(state, {
          type: 'turn-finished',
          turnId: event.turnId,
          outcome: event.outcome,
          response: safeText(event.response, REMOTE_CODE_LIMITS.messageLength),
        });
        const task = dispatchFor(rootId, event.threadId);
        if (task) await reportDispatchedTurn(task, event);
        if (state.queuedGuidance.length > 0) {
          await deliverGuidance(state);
        } else if (state.attached) {
          await publishSnapshot(state);
        }
        return;
      }
    }
  }

  return {
    handleControl,
    handleSessionEvent,
    attachedThreadCount: () => [...threads.values()].filter((state) => state.attached).length,
    /** Whether a phone has this session open, and so can answer what the agent asks in it. */
    isAttached: (rootId: string, threadId: string) =>
      threads.get(threadKey(rootId, threadId))?.attached === true,
    /**
     * The phone went away and may come back. Nothing is sent to it meanwhile,
     * and what it queued waits for it, since the one that returns is checked
     * against the one that left.
     */
    detach: () => {
      for (const state of threads.values()) state.attached = false;
    },
    /**
     * This pairing is over, or another phone took its place. Everything kept
     * for the old one goes with it: a message it queued must never start a
     * turn for whoever attaches next.
     */
    forget: () => {
      pairing += 1;
      for (const state of threads.values()) state.queuedGuidance = [];
      threads.clear();
      dispatches.clear();
    },
  };
}

export type CodeRemoteController = ReturnType<typeof createCodeRemoteController>;
