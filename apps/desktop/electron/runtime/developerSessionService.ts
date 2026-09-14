import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { accessSync, constants as fsConstants, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  DeveloperApprovalAnswer,
  DeveloperModelOption,
  DeveloperRuntimeModels,
  DeveloperRuntimeStatus,
  LocalDeveloperSession,
  DeveloperSessionEvent,
  DeveloperSessionGroup,
  DeveloperSessionList,
  DeveloperSessionOrigin,
  DeveloperSessionTranscript,
  DeveloperTurnOutcome,
  DeveloperTurnRequest,
  WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import type {
  DeveloperMessage,
  DeveloperSessionTrustMode,
  ThreadStatus,
} from '@agiworkforce/types/protocol';
import { readWorkspaceGit } from './gitService';
import { getRoot, listRoots } from './workspaceStore';
import { rememberSessionStartedHere, wasSessionStartedHere } from './developerSessionStore';

const PROTOCOL_VERSION = 8;
const CLIENT_NAME = 'agi-desktop';
const CLIENT_TITLE = 'AGI Cloud for desktop';
const DEFAULT_BINARY = 'agi';
const REQUEST_TIMEOUT_MS = 30_000;
const VERSION_TIMEOUT_MS = 5_000;
const SHUTDOWN_GRACE_MS = 1_500;
const MAX_FRAME_BYTES = 4 * 1024 * 1024;
const STDERR_TAIL_BYTES = 8 * 1024;

const DOWNLOAD_HINT =
  'Install the AGI CLI from agiworkforce.com/download, then set its path under Settings if it is not on your PATH.';

export type DeveloperSessionEmitter = (rootId: string, event: DeveloperSessionEvent) => void;

export class DeveloperRuntimeUnavailableError extends Error {
  readonly hint: string;

  constructor(message: string, hint = DOWNLOAD_HINT) {
    super(message);
    this.name = 'DeveloperRuntimeUnavailableError';
    this.hint = hint;
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface RunningServer {
  root: WorkspaceRoot;
  child: ChildProcessWithoutNullStreams;
  pending: Map<number, PendingRequest>;
  buffer: string;
  stderrTail: string;
  nextId: number;
  ready: Promise<void>;
  closed: boolean;
}

const servers = new Map<string, RunningServer>();

export type SpawnDeveloperRuntime = (
  command: string,
  args: readonly string[],
  options: Parameters<typeof nodeSpawn>[2],
) => ChildProcessWithoutNullStreams;

export interface DeveloperSessionConfiguration {
  emit: DeveloperSessionEmitter;
  resolveBinary: () => string;
  spawn?: SpawnDeveloperRuntime;
}

let emit: DeveloperSessionEmitter = () => undefined;
let resolveBinary: () => string = () => DEFAULT_BINARY;
let spawnRuntime: SpawnDeveloperRuntime = nodeSpawn as SpawnDeveloperRuntime;
let cachedStatus: { binary: string; status: DeveloperRuntimeStatus } | null = null;

export function configureDeveloperSessions(configuration: DeveloperSessionConfiguration): void {
  emit = configuration.emit;
  resolveBinary = configuration.resolveBinary;
  spawnRuntime = configuration.spawn ?? (nodeSpawn as SpawnDeveloperRuntime);
  cachedStatus = null;
  stopAllDeveloperRuntimes();
}

/**
 * Where the shell would start the CLI, resolved the way `spawn` resolves it: a
 * configured value containing a separator is taken as written, anything else is
 * looked up on the PATH this app was launched with.
 */
function resolveBinaryPath(binary: string): string | null {
  if (binary.includes(path.sep)) {
    try {
      accessSync(binary, fsConstants.X_OK);
      return binary;
    } catch {
      return null;
    }
  }
  for (const directory of (process.env['PATH'] ?? '').split(path.delimiter)) {
    if (directory === '') continue;
    const candidate = path.join(directory, binary);
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function displayPath(absolute: string): string {
  const home = os.homedir();
  return absolute.startsWith(`${home}${path.sep}`) ? `~${absolute.slice(home.length)}` : absolute;
}

function readVersion(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnRuntime(binary, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      resolve(null);
      return;
    }
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(null);
    }, VERSION_TIMEOUT_MS);
    timer.unref?.();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
    });
    child.once('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.once('exit', () => {
      clearTimeout(timer);
      const match = /\d+\.\d+\.\d+\S*/.exec(output);
      resolve(match ? match[0] : null);
    });
  });
}

/**
 * What the shell found when it resolved the CLI, remembered for the life of the
 * app. Resolving costs a process, and the answer only changes when the
 * preference names a different binary, so the settings pane reads this rather
 * than spawning on every open.
 */
export async function readDeveloperRuntimeStatus(): Promise<DeveloperRuntimeStatus> {
  const binary = resolveBinary().trim() || DEFAULT_BINARY;
  if (cachedStatus?.binary === binary) return cachedStatus.status;
  const status = await resolveRuntimeStatus(binary);
  cachedStatus = { binary, status };
  return status;
}

async function resolveRuntimeStatus(binary: string): Promise<DeveloperRuntimeStatus> {
  const resolved = resolveBinaryPath(binary);
  if (!resolved) {
    return { available: false, name: binary, version: null, path: null, hint: DOWNLOAD_HINT };
  }
  const version = await readVersion(resolved);
  if (version === null) {
    return {
      available: false,
      name: binary,
      version: null,
      path: displayPath(resolved),
      hint: DOWNLOAD_HINT,
    };
  }
  return {
    available: true,
    name: path.basename(resolved),
    version,
    path: displayPath(resolved),
    hint: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function closeServer(server: RunningServer, error: Error): void {
  if (server.closed) return;
  server.closed = true;
  for (const pending of server.pending.values()) {
    clearTimeout(pending.timer);
    pending.reject(error);
  }
  server.pending.clear();
  if (servers.get(server.root.id) === server) servers.delete(server.root.id);
  emit(server.root.id, { type: 'runtime-stopped', message: error.message });
}

function acceptLine(server: RunningServer, line: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    closeServer(server, new Error('The AGI CLI wrote a line that is not valid protocol JSON.'));
    return;
  }
  if (!isRecord(parsed)) return;

  if (typeof parsed['id'] === 'number') {
    const pending = server.pending.get(parsed['id']);
    if (!pending) return;
    clearTimeout(pending.timer);
    server.pending.delete(parsed['id']);
    const failure = parsed['error'];
    if (isRecord(failure)) {
      pending.reject(
        new Error(readString(failure, 'message') ?? 'The AGI CLI refused that request.'),
      );
      return;
    }
    pending.resolve(parsed['result']);
    return;
  }

  const method = readString(parsed, 'method');
  if (method) handleNotification(server, method, parsed['params']);
}

function acceptChunk(server: RunningServer, chunk: string): void {
  server.buffer += chunk;
  if (Buffer.byteLength(server.buffer, 'utf8') > MAX_FRAME_BYTES && !server.buffer.includes('\n')) {
    closeServer(server, new Error('The AGI CLI wrote an oversized protocol frame.'));
    return;
  }
  let newline = server.buffer.indexOf('\n');
  while (newline >= 0) {
    const line = server.buffer.slice(0, newline).trim();
    server.buffer = server.buffer.slice(newline + 1);
    if (line !== '') acceptLine(server, line);
    if (server.closed) return;
    newline = server.buffer.indexOf('\n');
  }
}

function turnOutcome(method: string): DeveloperTurnOutcome | null {
  if (method === 'turn/completed') return 'completed';
  if (method === 'turn/failed') return 'failed';
  if (method === 'turn/interrupted') return 'interrupted';
  return null;
}

function agentEvent(server: RunningServer, params: Record<string, unknown>): void {
  const threadId = readString(params, 'sessionId');
  const turnId = readString(params, 'turnId');
  const event = params['event'];
  if (!threadId || !turnId || !isRecord(event)) return;

  const toolCallId = readString(event, 'toolCallId');
  const name = readString(event, 'name');
  if (!toolCallId || !name) return;

  if (event['type'] === 'tool-execution-start') {
    emit(server.root.id, {
      type: 'tool-started',
      threadId,
      turnId,
      toolCallId,
      name,
      summary: readString(event, 'summary') ?? name,
    });
    return;
  }
  if (event['type'] === 'tool-execution-end') {
    const output = event['output'];
    emit(server.root.id, {
      type: 'tool-finished',
      threadId,
      turnId,
      toolCallId,
      name,
      output:
        typeof output === 'string' ? output : output === undefined ? '' : JSON.stringify(output),
      isError: event['isError'] === true,
    });
  }
}

function handleNotification(server: RunningServer, method: string, rawParams: unknown): void {
  const params = isRecord(rawParams) ? rawParams : {};

  if (method === 'turn/agent_event') {
    agentEvent(server, params);
    return;
  }

  const threadId = readString(params, 'threadId');
  const turnId = readString(params, 'turnId');
  if (!threadId || !turnId) return;

  if (method === 'turn/started') {
    emit(server.root.id, { type: 'turn-started', threadId, turnId });
    return;
  }
  if (method === 'turn/output_delta') {
    const delta = params['delta'];
    if (typeof delta === 'string') {
      emit(server.root.id, { type: 'output-delta', threadId, turnId, delta });
    }
    return;
  }
  if (method === 'approval/requested') {
    const requestId = readString(params, 'requestId');
    if (!requestId) return;
    emit(server.root.id, {
      type: 'approval-requested',
      threadId,
      turnId,
      requestId,
      summary: readString(params, 'summary') ?? 'The agent needs approval to continue.',
      detail: readString(params, 'detail') ?? '',
    });
    return;
  }

  const outcome = turnOutcome(method);
  if (!outcome) return;
  emit(server.root.id, {
    type: 'turn-finished',
    threadId,
    turnId,
    outcome,
    response: readString(params, 'response') ?? '',
    error: readString(params, 'error'),
  });
}

function request(server: RunningServer, method: string, params: unknown): Promise<unknown> {
  if (server.closed) {
    return Promise.reject(
      new DeveloperRuntimeUnavailableError('The AGI CLI is no longer running.'),
    );
  }
  const id = server.nextId++;
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.pending.delete(id);
      reject(new Error(`The AGI CLI did not answer ${method} in time.`));
    }, REQUEST_TIMEOUT_MS);
    server.pending.set(id, { resolve, reject, timer });
    server.child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
      (error) => {
        if (!error) return;
        clearTimeout(timer);
        server.pending.delete(id);
        reject(error);
      },
    );
  });
}

function spawnFailure(
  binary: string,
  error: NodeJS.ErrnoException,
): DeveloperRuntimeUnavailableError {
  if (error.code === 'ENOENT') {
    return new DeveloperRuntimeUnavailableError(
      binary.includes('/')
        ? `No AGI CLI exists at ${binary}.`
        : `The AGI CLI ("${binary}") is not on this app's PATH.`,
    );
  }
  if (error.code === 'EACCES' || error.code === 'EPERM') {
    return new DeveloperRuntimeUnavailableError(
      `${binary} exists but this app is not allowed to run it.`,
      'Grant the binary execute permission, or point Settings at an executable AGI CLI.',
    );
  }
  return new DeveloperRuntimeUnavailableError(`The AGI CLI could not be started, ${error.message}`);
}

async function handshake(server: RunningServer): Promise<void> {
  const result = await request(server, 'initialize', {
    clientInfo: { name: CLIENT_NAME, title: CLIENT_TITLE, version: PROTOCOL_VERSION.toString() },
    protocolVersion: PROTOCOL_VERSION,
  });
  if (!isRecord(result) || result['protocolVersion'] !== PROTOCOL_VERSION) {
    throw new DeveloperRuntimeUnavailableError(
      `The installed AGI CLI does not speak developer-session protocol ${PROTOCOL_VERSION}.`,
      'Update the AGI CLI, or point Settings at a current binary.',
    );
  }
  const capabilities = result['capabilities'];
  if (
    !isRecord(capabilities) ||
    capabilities['threads'] !== true ||
    capabilities['turns'] !== true
  ) {
    throw new DeveloperRuntimeUnavailableError(
      'The installed AGI CLI does not serve developer sessions.',
      'Update the AGI CLI, or point Settings at a current binary.',
    );
  }
}

function ensureServer(root: WorkspaceRoot): RunningServer {
  const existing = servers.get(root.id);
  if (existing && !existing.closed) return existing;

  try {
    if (!statSync(root.path).isDirectory()) throw new Error('not a directory');
  } catch {
    throw new DeveloperRuntimeUnavailableError(
      `${root.name} is no longer on this Mac, so no coding session can run in it.`,
      'Remove the folder under Settings, or restore it and try again.',
    );
  }

  const binary = resolveBinary().trim() || DEFAULT_BINARY;
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawnRuntime(binary, ['app-server'], {
      cwd: root.path,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
  } catch (error) {
    throw spawnFailure(binary, error as NodeJS.ErrnoException);
  }

  const server: RunningServer = {
    root,
    child,
    pending: new Map(),
    buffer: '',
    stderrTail: '',
    nextId: 1,
    ready: Promise.resolve(),
    closed: false,
  };

  servers.set(root.id, server);

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => acceptChunk(server, chunk));
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    server.stderrTail = `${server.stderrTail}${chunk}`.slice(-STDERR_TAIL_BYTES);
  });
  child.once('error', (error) => {
    closeServer(server, spawnFailure(binary, error as NodeJS.ErrnoException));
  });
  child.once('exit', (code, signal) => {
    const detail = server.stderrTail.trim();
    closeServer(
      server,
      new Error(
        `The AGI CLI exited (${signal ?? String(code ?? 'unknown')})${detail === '' ? '' : `: ${detail}`}`,
      ),
    );
  });

  server.ready = handshake(server).catch((error: unknown) => {
    closeServer(server, error instanceof Error ? error : new Error(String(error)));
    throw error;
  });
  return server;
}

async function readyServer(root: WorkspaceRoot): Promise<RunningServer> {
  const server = ensureServer(root);
  await server.ready;
  return server;
}

function requireRoot(rootId: string): WorkspaceRoot {
  const root = getRoot(rootId);
  if (!root) throw new DeveloperRuntimeUnavailableError('That folder is no longer approved.');
  return root;
}

function sessionOrigin(threadId: string, storedSource: unknown): DeveloperSessionOrigin {
  if (wasSessionStartedHere(threadId)) return 'desktop';
  return storedSource === 'vscode' ? 'vscode' : 'cli';
}

function toSession(rootId: string, raw: unknown): LocalDeveloperSession | null {
  if (!isRecord(raw)) return null;
  const id = readString(raw, 'id');
  if (!id) return null;
  return {
    id,
    rootId,
    title: readString(raw, 'title') ?? 'Untitled session',
    cwd: readString(raw, 'cwd') ?? '',
    model: readString(raw, 'model'),
    provider: readString(raw, 'provider'),
    trustMode: (readString(raw, 'trustMode') ?? 'unknown') as DeveloperSessionTrustMode,
    status: (readString(raw, 'status') ?? 'idle') as ThreadStatus,
    createdAt: readString(raw, 'createdAt') ?? '',
    updatedAt: readString(raw, 'updatedAt') ?? '',
    origin: sessionOrigin(id, raw['createdBy']),
  };
}

function requireSession(rootId: string, raw: unknown): LocalDeveloperSession {
  const session = toSession(rootId, isRecord(raw) ? raw['thread'] : null);
  if (!session) throw new Error('The AGI CLI returned a session this app could not read.');
  return session;
}

async function listForRoot(root: WorkspaceRoot): Promise<DeveloperSessionGroup> {
  const git = await readWorkspaceGit(root);
  const group: DeveloperSessionGroup = {
    rootId: root.id,
    name: root.name,
    path: root.path,
    branch: git?.branch ?? null,
    sessions: [],
  };

  try {
    const server = await readyServer(root);
    const result = await request(server, 'thread/list', { cwd: root.path });
    const threads = isRecord(result) ? result['threads'] : null;
    if (Array.isArray(threads)) {
      group.sessions = threads
        .map((thread) => toSession(root.id, thread))
        .filter((session): session is LocalDeveloperSession => session !== null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
  } catch (error) {
    group.unavailable =
      error instanceof DeveloperRuntimeUnavailableError
        ? { message: error.message, hint: error.hint }
        : { message: error instanceof Error ? error.message : String(error), hint: DOWNLOAD_HINT };
  }

  return group;
}

async function requestOrNull(server: RunningServer, method: string): Promise<unknown> {
  try {
    return await request(server, method, {});
  } catch {
    return null;
  }
}

/**
 * What the CLI can run in one folder. Each of the three reads is optional: a
 * host that does not serve models, settings or an account answers with nothing
 * rather than failing the whole call, so a chooser still gets what is there.
 */
export async function readDeveloperModels(rootId: string): Promise<DeveloperRuntimeModels> {
  const root = requireRoot(rootId);
  const server = await readyServer(root);
  const [modelList, settings, account] = await Promise.all([
    requestOrNull(server, 'model/list'),
    requestOrNull(server, 'settings/read'),
    requestOrNull(server, 'account/status'),
  ]);

  const rawModels = isRecord(modelList) ? modelList['models'] : null;
  const models: DeveloperModelOption[] = Array.isArray(rawModels)
    ? rawModels.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        const id = readString(entry, 'id');
        if (!id) return [];
        return [{ id, provider: readString(entry, 'provider') ?? '', local: true }];
      })
    : [];

  return {
    models,
    defaultModelId: isRecord(settings) ? readString(settings, 'defaultModel') : null,
    managedSignedIn: isRecord(account) && account['signedIn'] === true,
  };
}

export async function listDeveloperSessions(): Promise<DeveloperSessionList> {
  const groups = await Promise.all(listRoots().map(listForRoot));
  return { groups };
}

export async function readDeveloperSession(
  rootId: string,
  threadId: string,
): Promise<DeveloperSessionTranscript> {
  const root = requireRoot(rootId);
  const server = await readyServer(root);
  const result = await request(server, 'thread/read', { threadId });
  const messages = isRecord(result) ? result['messages'] : null;
  return {
    session: requireSession(rootId, result),
    messages: Array.isArray(messages) ? (messages as DeveloperMessage[]) : [],
    truncated: isRecord(result) && result['transcriptTruncated'] === true,
  };
}

export async function resumeDeveloperSession(
  rootId: string,
  threadId: string,
): Promise<LocalDeveloperSession> {
  const root = requireRoot(rootId);
  const server = await readyServer(root);
  return requireSession(rootId, await request(server, 'thread/resume', { threadId }));
}

export async function startDeveloperSession(
  rootId: string,
  model?: string,
): Promise<LocalDeveloperSession> {
  const root = requireRoot(rootId);
  const server = await readyServer(root);
  const result = await request(server, 'thread/start', {
    cwd: root.path,
    ...(model ? { model } : {}),
  });
  const session = requireSession(rootId, result);
  rememberSessionStartedHere(session.id);
  return { ...session, origin: 'desktop' };
}

export async function startDeveloperTurn(input: DeveloperTurnRequest): Promise<{ turnId: string }> {
  const root = requireRoot(input.rootId);
  const server = await readyServer(root);
  const result = await request(server, 'turn/start', {
    threadId: input.threadId,
    input: [{ type: 'text', text: input.text, text_elements: [] }],
    cwd: root.path,
    ...(input.model ? { model: input.model } : {}),
  });
  const turn = isRecord(result) ? result['turn'] : null;
  const turnId = isRecord(turn) ? readString(turn, 'id') : null;
  if (!turnId) throw new Error('The AGI CLI started no turn.');
  return { turnId };
}

export async function interruptDeveloperTurn(
  rootId: string,
  threadId: string,
  turnId: string,
): Promise<boolean> {
  const root = requireRoot(rootId);
  const server = await readyServer(root);
  await request(server, 'turn/interrupt', { threadId, turnId });
  return true;
}

export async function answerDeveloperApproval(answer: DeveloperApprovalAnswer): Promise<boolean> {
  const root = requireRoot(answer.rootId);
  const server = await readyServer(root);
  await request(server, 'approval/respond', {
    threadId: answer.threadId,
    turnId: answer.turnId,
    requestId: answer.requestId,
    decision: answer.approved ? 'approved' : 'denied',
  });
  emit(answer.rootId, {
    type: 'approval-answered',
    threadId: answer.threadId,
    turnId: answer.turnId,
    requestId: answer.requestId,
    approved: answer.approved,
  });
  return true;
}

function terminate(server: RunningServer): void {
  const pid = server.child.pid;
  server.child.stdin.end();
  const hardKill = setTimeout(() => {
    try {
      if (pid !== undefined && process.platform !== 'win32') process.kill(-pid, 'SIGKILL');
      else server.child.kill('SIGKILL');
    } catch {
      // The tree is already gone.
    }
  }, SHUTDOWN_GRACE_MS);
  hardKill.unref?.();
  closeServer(server, new Error('The AGI CLI was stopped by this app.'));
}

export function stopDeveloperRuntime(rootId: string): void {
  const server = servers.get(rootId);
  if (server) terminate(server);
}

export function stopAllDeveloperRuntimes(): void {
  for (const server of [...servers.values()]) terminate(server);
}
