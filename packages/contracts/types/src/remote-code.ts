export const REMOTE_CODE_PROTOCOL_VERSION = 1;

export const REMOTE_CODE_REQUEST_ACTIONS = [
  'code.sessions.list',
  'code.session.attach',
  'code.session.detach',
  'code.session.steer',
  'code.turn.interrupt',
  'code.approval.respond',
] as const;
export type RemoteCodeRequestAction = (typeof REMOTE_CODE_REQUEST_ACTIONS)[number];

export const REMOTE_CODE_HOST_ACTIONS = [
  'code.sessions',
  'code.session.snapshot',
  'code.session.event',
] as const;
export type RemoteCodeHostAction = (typeof REMOTE_CODE_HOST_ACTIONS)[number];

export const REMOTE_CODE_LIMITS = {
  idLength: 128,
  guidanceLength: 2_000,
  transcriptMessages: 12,
  messageLength: 2_000,
  partialResponseLength: 4_000,
  deltaLength: 2_000,
  fileChanges: 60,
  diffs: 20,
  diffLength: 8_000,
  testRuns: 10,
  testOutputLength: 3_000,
  queuedGuidance: 3,
  sessions: 30,
  payloadBytes: 40_000,
} as const;

export type RemoteCodeSessionStatus =
  'idle' | 'running' | 'awaiting_approval' | 'failed' | 'unknown';

export interface RemoteCodeSessionSummary {
  rootId: string;
  threadId: string;
  title: string;
  folder: string;
  branch: string | null;
  status: RemoteCodeSessionStatus;
  model: string | null;
  updatedAt: string;
}

export interface RemoteCodeFileChange {
  path: string;
  kind: 'created' | 'modified';
  tool: string;
  changedAt: string;
}

export interface RemoteCodeDiff {
  path: string;
  patch: string;
  truncated: boolean;
}

export interface RemoteCodeTestRun {
  toolCallId: string;
  command: string;
  status: 'passed' | 'failed';
  passed: number | null;
  failed: number | null;
  skipped: number | null;
  output: string;
  finishedAt: string;
}

export interface RemoteCodePendingApproval {
  turnId: string;
  requestId: string;
  summary: string;
  detail: string;
}

export interface RemoteCodeTranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
}

export interface RemoteCodeSessionsEvent {
  action: 'code.sessions';
  version: typeof REMOTE_CODE_PROTOCOL_VERSION;
  sessions: RemoteCodeSessionSummary[];
  unavailable: Array<{ folder: string; message: string }>;
  syncedAt: string;
}

export interface RemoteCodeSessionSnapshot {
  action: 'code.session.snapshot';
  version: typeof REMOTE_CODE_PROTOCOL_VERSION;
  rootId: string;
  threadId: string;
  title: string;
  status: RemoteCodeSessionStatus;
  activeTurnId: string | null;
  partialResponse: string;
  messages: RemoteCodeTranscriptEntry[];
  pendingApprovals: RemoteCodePendingApproval[];
  fileChanges: RemoteCodeFileChange[];
  queuedGuidance: string[];
  syncedAt: string;
}

export type RemoteCodeLiveEvent =
  | { type: 'turn-started'; turnId: string }
  | { type: 'output-delta'; turnId: string; delta: string }
  | { type: 'tool-started'; turnId: string; toolCallId: string; name: string; summary: string }
  | { type: 'tool-finished'; turnId: string; toolCallId: string; name: string; isError: boolean }
  | ({ type: 'approval-requested' } & RemoteCodePendingApproval)
  | { type: 'approval-answered'; requestId: string; approved: boolean }
  | {
      type: 'turn-finished';
      turnId: string;
      outcome: 'completed' | 'failed' | 'interrupted';
      response: string;
    }
  | { type: 'diff'; diff: RemoteCodeDiff }
  | { type: 'test-run'; testRun: RemoteCodeTestRun }
  | { type: 'guidance-queued'; queuedGuidance: string[] }
  | { type: 'guidance-delivered'; turnId: string; queuedGuidance: string[] }
  | { type: 'runtime-stopped'; message: string };

export interface RemoteCodeSessionEvent {
  action: 'code.session.event';
  version: typeof REMOTE_CODE_PROTOCOL_VERSION;
  rootId: string;
  threadId: string;
  event: RemoteCodeLiveEvent;
  sentAt: string;
}

interface RemoteCodeRequestBase {
  version: typeof REMOTE_CODE_PROTOCOL_VERSION;
  requestId: string;
  sentAt: string;
}

export type RemoteCodeRequest =
  | (RemoteCodeRequestBase & { action: 'code.sessions.list' })
  | (RemoteCodeRequestBase & { action: 'code.session.attach'; rootId: string; threadId: string })
  | (RemoteCodeRequestBase & { action: 'code.session.detach'; rootId: string; threadId: string })
  | (RemoteCodeRequestBase & {
      action: 'code.session.steer';
      rootId: string;
      threadId: string;
      text: string;
      interrupt: boolean;
    })
  | (RemoteCodeRequestBase & {
      action: 'code.turn.interrupt';
      rootId: string;
      threadId: string;
      turnId: string;
    })
  | (RemoteCodeRequestBase & {
      action: 'code.approval.respond';
      rootId: string;
      threadId: string;
      turnId: string;
      requestId: string;
      approvalRequestId: string;
      approved: boolean;
    });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= REMOTE_CODE_LIMITS.idLength ? trimmed : null;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));
}

export function isRemoteCodeRequestAction(action: string): action is RemoteCodeRequestAction {
  return (REMOTE_CODE_REQUEST_ACTIONS as readonly string[]).includes(action);
}

export function parseRemoteCodeRequest(action: string, payload: unknown): RemoteCodeRequest | null {
  if (!isRemoteCodeRequestAction(action) || !isRecord(payload)) return null;
  if (payload['version'] !== REMOTE_CODE_PROTOCOL_VERSION) return null;
  const requestId = boundedId(payload['requestId']);
  const sentAt = payload['sentAt'];
  if (!requestId || !isTimestamp(sentAt)) return null;
  const base = { version: REMOTE_CODE_PROTOCOL_VERSION, requestId, sentAt } as const;

  if (action === 'code.sessions.list') return { ...base, action };

  const rootId = boundedId(payload['rootId']);
  const threadId = boundedId(payload['threadId']);
  if (!rootId || !threadId) return null;

  switch (action) {
    case 'code.session.attach':
    case 'code.session.detach':
      return { ...base, action, rootId, threadId };
    case 'code.session.steer': {
      const text = typeof payload['text'] === 'string' ? payload['text'].trim() : '';
      if (text.length === 0 || text.length > REMOTE_CODE_LIMITS.guidanceLength) return null;
      return { ...base, action, rootId, threadId, text, interrupt: payload['interrupt'] === true };
    }
    case 'code.turn.interrupt': {
      const turnId = boundedId(payload['turnId']);
      return turnId ? { ...base, action, rootId, threadId, turnId } : null;
    }
    case 'code.approval.respond': {
      const turnId = boundedId(payload['turnId']);
      const approvalRequestId = boundedId(payload['approvalRequestId']);
      if (!turnId || !approvalRequestId || typeof payload['approved'] !== 'boolean') return null;
      return {
        ...base,
        action,
        rootId,
        threadId,
        turnId,
        approvalRequestId,
        approved: payload['approved'],
      };
    }
    default:
      return null;
  }
}

export function clipRemoteText(value: string, limit: number): { text: string; truncated: boolean } {
  if (value.length <= limit) return { text: value, truncated: false };
  return { text: value.slice(value.length - limit), truncated: true };
}

const DIFF_HEADER = /^(diff --git |--- (?:a\/|\/dev\/null)|\+\+\+ (?:b\/|\/dev\/null)|@@ )/m;

export function extractUnifiedDiff(output: string): string | null {
  const match = DIFF_HEADER.exec(output);
  if (!match) return null;
  const body = output.slice(match.index);
  return /^@@ /m.test(body) ? body.trimEnd() : null;
}

export function diffPaths(patch: string): string[] {
  const paths = new Set<string>();
  for (const line of patch.split('\n')) {
    const header = /^\+\+\+ b\/(.+)$/.exec(line) ?? /^diff --git a\/.+ b\/(.+)$/.exec(line);
    if (header?.[1]) paths.add(header[1].trim());
  }
  return [...paths];
}

const TEST_COMMAND =
  /\b(?:vitest|jest|pytest|mocha|playwright test|go test|cargo (?:nextest|test)|(?:pnpm|npm|yarn|bun)(?: run)? test|rspec|phpunit|dotnet test|mvn test|gradle test)\b/;

export function isTestCommand(command: string): boolean {
  return TEST_COMMAND.test(command);
}

function readCount(output: string, patterns: RegExp[]): number | null {
  let total: number | null = null;
  for (const pattern of patterns) {
    for (const match of output.matchAll(pattern)) {
      const value = Number.parseInt(match[1] ?? '', 10);
      if (Number.isFinite(value)) total = (total ?? 0) + value;
    }
    if (total !== null) return total;
  }
  return total;
}

export function parseTestSummary(
  output: string,
  isError: boolean,
): Pick<RemoteCodeTestRun, 'status' | 'passed' | 'failed' | 'skipped'> {
  const cargo = [
    ...output.matchAll(/test result: \w+\. (\d+) passed; (\d+) failed; (\d+) ignored/g),
  ];
  if (cargo.length > 0) {
    const sum = (index: number) =>
      cargo.reduce((total, match) => total + Number.parseInt(match[index] ?? '0', 10), 0);
    const failed = sum(2);
    return {
      status: failed > 0 || isError ? 'failed' : 'passed',
      passed: sum(1),
      failed,
      skipped: sum(3),
    };
  }

  const testsLine = /^\s*Tests:?\s+(.*)$/m.exec(output)?.[1] ?? null;
  const scope = testsLine ?? output;
  const passed = readCount(scope, [/(\d+) pass(?:ed|ing)?\b/g]);
  const failed = readCount(scope, [/(\d+) fail(?:ed|ing|ures?)?\b/g]);
  const skipped = readCount(scope, [/(\d+) (?:skipped|pending|todo|ignored)\b/g]);
  const status = isError || (failed ?? 0) > 0 ? 'failed' : 'passed';
  return { status, passed, failed, skipped };
}

export function fitRemoteSnapshot(snapshot: RemoteCodeSessionSnapshot): RemoteCodeSessionSnapshot {
  const fitted = {
    ...snapshot,
    messages: [...snapshot.messages],
    fileChanges: [...snapshot.fileChanges],
  };
  const size = () => JSON.stringify(fitted).length;
  while (size() > REMOTE_CODE_LIMITS.payloadBytes && fitted.messages.length > 0) {
    fitted.messages.shift();
  }
  while (size() > REMOTE_CODE_LIMITS.payloadBytes && fitted.fileChanges.length > 0) {
    fitted.fileChanges.shift();
  }
  if (size() > REMOTE_CODE_LIMITS.payloadBytes) {
    fitted.partialResponse = '';
  }
  return fitted;
}

function text(value: unknown, limit: number): string | null {
  return typeof value === 'string' && value.length <= limit ? value : null;
}

function nullableText(value: unknown, limit: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  return text(value, limit) ?? undefined;
}

function list<T>(value: unknown, max: number, parse: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const parsed = value.map(parse);
  return parsed.every((entry): entry is T => entry !== null) ? parsed : null;
}

const SESSION_STATUSES = new Set<RemoteCodeSessionStatus>([
  'idle',
  'running',
  'awaiting_approval',
  'failed',
  'unknown',
]);

function sessionStatus(value: unknown): RemoteCodeSessionStatus | null {
  return typeof value === 'string' && SESSION_STATUSES.has(value as RemoteCodeSessionStatus)
    ? (value as RemoteCodeSessionStatus)
    : null;
}

function parseFileChange(value: unknown): RemoteCodeFileChange | null {
  if (!isRecord(value)) return null;
  const path = text(value['path'], 1_024);
  const tool = text(value['tool'], REMOTE_CODE_LIMITS.idLength);
  const changedAt = text(value['changedAt'], 64);
  const kind = value['kind'];
  if (!path || tool === null || changedAt === null || (kind !== 'created' && kind !== 'modified')) {
    return null;
  }
  return { path, kind, tool, changedAt };
}

function parseDiff(value: unknown): RemoteCodeDiff | null {
  if (!isRecord(value)) return null;
  const path = text(value['path'], 1_024);
  const patch = text(value['patch'], REMOTE_CODE_LIMITS.diffLength);
  if (!path || patch === null || typeof value['truncated'] !== 'boolean') return null;
  return { path, patch, truncated: value['truncated'] };
}

function count(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function parseTestRun(value: unknown): RemoteCodeTestRun | null {
  if (!isRecord(value)) return null;
  const toolCallId = boundedId(value['toolCallId']);
  const command = text(value['command'], REMOTE_CODE_LIMITS.messageLength);
  const output = text(value['output'], REMOTE_CODE_LIMITS.testOutputLength);
  const finishedAt = text(value['finishedAt'], 64);
  const status = value['status'];
  const passed = count(value['passed']);
  const failed = count(value['failed']);
  const skipped = count(value['skipped']);
  if (
    !toolCallId ||
    command === null ||
    output === null ||
    finishedAt === null ||
    (status !== 'passed' && status !== 'failed') ||
    passed === undefined ||
    failed === undefined ||
    skipped === undefined
  ) {
    return null;
  }
  return { toolCallId, command, status, passed, failed, skipped, output, finishedAt };
}

function parseApproval(value: unknown): RemoteCodePendingApproval | null {
  if (!isRecord(value)) return null;
  const turnId = boundedId(value['turnId']);
  const requestId = boundedId(value['requestId']);
  const summary = text(value['summary'], REMOTE_CODE_LIMITS.messageLength);
  const detail = text(value['detail'], REMOTE_CODE_LIMITS.messageLength);
  if (!turnId || !requestId || summary === null || detail === null) return null;
  return { turnId, requestId, summary, detail };
}

function guidanceList(value: unknown): string[] | null {
  return list(value, REMOTE_CODE_LIMITS.queuedGuidance, (entry) =>
    text(entry, REMOTE_CODE_LIMITS.guidanceLength),
  );
}

function hostBase(payload: unknown, action: RemoteCodeHostAction): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;
  if (payload['action'] !== action || payload['version'] !== REMOTE_CODE_PROTOCOL_VERSION) {
    return null;
  }
  return payload;
}

export function parseRemoteCodeSessions(payload: unknown): RemoteCodeSessionsEvent | null {
  const base = hostBase(payload, 'code.sessions');
  if (!base) return null;
  const sessions = list(base['sessions'], REMOTE_CODE_LIMITS.sessions, (entry) => {
    if (!isRecord(entry)) return null;
    const rootId = boundedId(entry['rootId']);
    const threadId = boundedId(entry['threadId']);
    const title = text(entry['title'], 500);
    const folder = text(entry['folder'], 500);
    const branch = nullableText(entry['branch'], 500);
    const model = nullableText(entry['model'], 200);
    const updatedAt = text(entry['updatedAt'], 64);
    const status = sessionStatus(entry['status']);
    if (
      !rootId ||
      !threadId ||
      title === null ||
      folder === null ||
      branch === undefined ||
      model === undefined ||
      updatedAt === null ||
      !status
    ) {
      return null;
    }
    return { rootId, threadId, title, folder, branch, status, model, updatedAt };
  });
  const unavailable = list(base['unavailable'], 50, (entry) => {
    if (!isRecord(entry)) return null;
    const folder = text(entry['folder'], 500);
    const message = text(entry['message'], REMOTE_CODE_LIMITS.messageLength);
    return folder !== null && message !== null ? { folder, message } : null;
  });
  const syncedAt = text(base['syncedAt'], 64);
  if (!sessions || !unavailable || syncedAt === null) return null;
  return {
    action: 'code.sessions',
    version: REMOTE_CODE_PROTOCOL_VERSION,
    sessions,
    unavailable,
    syncedAt,
  };
}

export function parseRemoteCodeSnapshot(payload: unknown): RemoteCodeSessionSnapshot | null {
  const base = hostBase(payload, 'code.session.snapshot');
  if (!base) return null;
  const rootId = boundedId(base['rootId']);
  const threadId = boundedId(base['threadId']);
  const title = text(base['title'], 500);
  const status = sessionStatus(base['status']);
  const activeTurnId =
    base['activeTurnId'] === null ? null : (boundedId(base['activeTurnId']) ?? undefined);
  const partialResponse = text(base['partialResponse'], REMOTE_CODE_LIMITS.partialResponseLength);
  const messages = list<RemoteCodeTranscriptEntry>(
    base['messages'],
    REMOTE_CODE_LIMITS.transcriptMessages,
    (entry) => {
      if (!isRecord(entry)) return null;
      const role = entry['role'];
      const body = text(entry['text'], REMOTE_CODE_LIMITS.messageLength);
      return (role === 'user' || role === 'assistant') && body !== null
        ? { role, text: body }
        : null;
    },
  );
  const pendingApprovals = list(base['pendingApprovals'], 20, parseApproval);
  const fileChanges = list(base['fileChanges'], REMOTE_CODE_LIMITS.fileChanges, parseFileChange);
  const queuedGuidance = guidanceList(base['queuedGuidance']);
  const syncedAt = text(base['syncedAt'], 64);
  if (
    !rootId ||
    !threadId ||
    title === null ||
    !status ||
    activeTurnId === undefined ||
    partialResponse === null ||
    !messages ||
    !pendingApprovals ||
    !fileChanges ||
    !queuedGuidance ||
    syncedAt === null
  ) {
    return null;
  }
  return {
    action: 'code.session.snapshot',
    version: REMOTE_CODE_PROTOCOL_VERSION,
    rootId,
    threadId,
    title,
    status,
    activeTurnId,
    partialResponse,
    messages,
    pendingApprovals,
    fileChanges,
    queuedGuidance,
    syncedAt,
  };
}

function parseLiveEvent(value: unknown): RemoteCodeLiveEvent | null {
  if (!isRecord(value)) return null;
  const turnId = boundedId(value['turnId']);
  switch (value['type']) {
    case 'turn-started':
      return turnId ? { type: 'turn-started', turnId } : null;
    case 'output-delta': {
      const delta = text(value['delta'], REMOTE_CODE_LIMITS.deltaLength);
      return turnId && delta !== null ? { type: 'output-delta', turnId, delta } : null;
    }
    case 'tool-started': {
      const toolCallId = boundedId(value['toolCallId']);
      const name = text(value['name'], REMOTE_CODE_LIMITS.idLength);
      const summary = text(value['summary'], REMOTE_CODE_LIMITS.messageLength);
      return turnId && toolCallId && name !== null && summary !== null
        ? { type: 'tool-started', turnId, toolCallId, name, summary }
        : null;
    }
    case 'tool-finished': {
      const toolCallId = boundedId(value['toolCallId']);
      const name = text(value['name'], REMOTE_CODE_LIMITS.idLength);
      return turnId && toolCallId && name !== null && typeof value['isError'] === 'boolean'
        ? { type: 'tool-finished', turnId, toolCallId, name, isError: value['isError'] }
        : null;
    }
    case 'approval-requested': {
      const approval = parseApproval(value);
      return approval ? { type: 'approval-requested', ...approval } : null;
    }
    case 'approval-answered': {
      const requestId = boundedId(value['requestId']);
      return requestId && typeof value['approved'] === 'boolean'
        ? { type: 'approval-answered', requestId, approved: value['approved'] }
        : null;
    }
    case 'turn-finished': {
      const outcome = value['outcome'];
      const response = text(value['response'], REMOTE_CODE_LIMITS.messageLength);
      return turnId &&
        response !== null &&
        (outcome === 'completed' || outcome === 'failed' || outcome === 'interrupted')
        ? { type: 'turn-finished', turnId, outcome, response }
        : null;
    }
    case 'diff': {
      const diff = parseDiff(value['diff']);
      return diff ? { type: 'diff', diff } : null;
    }
    case 'test-run': {
      const testRun = parseTestRun(value['testRun']);
      return testRun ? { type: 'test-run', testRun } : null;
    }
    case 'guidance-queued': {
      const queuedGuidance = guidanceList(value['queuedGuidance']);
      return queuedGuidance ? { type: 'guidance-queued', queuedGuidance } : null;
    }
    case 'guidance-delivered': {
      const queuedGuidance = guidanceList(value['queuedGuidance']);
      return turnId && queuedGuidance
        ? { type: 'guidance-delivered', turnId, queuedGuidance }
        : null;
    }
    case 'runtime-stopped': {
      const message = text(value['message'], REMOTE_CODE_LIMITS.messageLength * 2);
      return message !== null ? { type: 'runtime-stopped', message } : null;
    }
    default:
      return null;
  }
}

export function parseRemoteCodeEvent(payload: unknown): RemoteCodeSessionEvent | null {
  const base = hostBase(payload, 'code.session.event');
  if (!base) return null;
  const rootId = boundedId(base['rootId']);
  const threadId = boundedId(base['threadId']);
  const event = parseLiveEvent(base['event']);
  const sentAt = text(base['sentAt'], 64);
  if (!rootId || !threadId || !event || sentAt === null) return null;
  return {
    action: 'code.session.event',
    version: REMOTE_CODE_PROTOCOL_VERSION,
    rootId,
    threadId,
    event,
    sentAt,
  };
}
