import {
  hasSshEnvironment,
  requireSshRoot,
  listSshRoots,
  sshLaunch,
  verifySshWorkspace,
} from './sshEnvironments';
import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { accessSync, constants as fsConstants, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { messageKindForAgentEvent, PRODUCT_NAMES } from '@agiworkforce/types';
import type {
  DeveloperActiveTurn,
  DeveloperAgentMode,
  DeveloperApprovalAnswer,
  DeveloperApprovalRequest,
  DeveloperCheckpointSectionsRequest,
  DeveloperFileChange,
  DeveloperTurnFailure,
  DeveloperHostModel,
  DeveloperModelOption,
  DeveloperMcpApprovalScope,
  DeveloperMcpServerAwaitingApproval,
  DeveloperModelUnreachable,
  DeveloperRuntimeFeatures,
  DeveloperRuntimeModels,
  DeveloperRuntimeCapability,
  DeveloperRuntimeStatus,
  DeveloperRuntimeUnavailable,
  LocalDeveloperSession,
  DeveloperSessionEvent,
  DeveloperSessionGroup,
  DeveloperSessionList,
  DeveloperSessionStartRequest,
  DeveloperSessionTranscript,
  DeveloperThreadDeleteRequest,
  DeveloperThreadForkRequest,
  DeveloperThreadCompactRequest,
  DeveloperThreadRevertRequest,
  DeveloperTurnOutcome,
  DeveloperTurnRequest,
  DeveloperTurnSteer,
  DeveloperUserInputAnswer,
  DeveloperUserInputRequest,
  DeveloperWorktree,
  DeveloperWorktreeSetupScript,
  StartedDeveloperSession,
  WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import type {
  AgentEventApprovalRiskLevel,
  CheckpointDiffResponse,
  CheckpointListResponse,
  CheckpointSectionsResponse,
  DeveloperMessage,
  DeveloperChildTask,
  DeveloperSessionFileChange,
  MemoryAddResponse,
  MemoryScope,
  PluginSummary,
  SkillListResponse,
  SkillSummary,
  DeveloperSessionSource,
  DeveloperSessionTrustMode,
  McpApprovalNetwork,
  McpApprovalSandbox,
  ThreadCompactResponse,
  ThreadDeleteResponse,
  ThreadRevertResponse,
  ThreadStatus,
  TurnFailureAction,
  TurnFailureCode,
  WorktreeApplyResponse,
  WorktreeCleanupFailure,
  WorktreeStartPoint,
} from '@agiworkforce/types/protocol';
import {
  DEVELOPER_COMMAND_NEEDS_UPDATE,
  DEVELOPER_SESSION_MAX_FRAME_BYTES as MAX_FRAME_BYTES,
  DEVELOPER_UNNAMED_TURN_AGENT_MODE,
  MCP_APPROVAL_STALE_ERROR_CODE,
  THREAD_WRITER_CONFLICT_ERROR_CODE,
  remoteTurnAgentMode,
  DEVELOPER_FILE_CHANGES,
  DEVELOPER_REASONING_EFFORTS,
  DEVELOPER_RUNTIME_CAPABILITIES,
  developerApprovalAllows,
  developerEffortLadder,
  nearestDeveloperEffort,
  developerReviewDecision,
  normalizeDeveloperAgentMode,
  parseWorktreeRootId,
  worktreeRootId,
  TERMINAL_MAX_COLUMNS,
  TERMINAL_MAX_ROWS,
  TERMINAL_MIN_SIZE,
  TERMINAL_WRITE_LIMIT,
} from '@agiworkforce/local-runtime-contract';
import type { DeveloperSessionActivity } from '@agiworkforce/utils/remote-control';
import {
  DEVELOPER_SESSION_PROTOCOL_VERSION as PROTOCOL_VERSION,
  MINIMUM_SUPPORTED_RUNTIME_VERSION,
  isSupportedRuntimeVersion,
} from '@agiworkforce/types';
import { app } from 'electron';
import { CLOUD_APP_ORIGIN } from '../config';
import { rememberShellSignedCliIn, shellSignedCliIn } from './cliAccountStore';
import { reconcileDeveloperAccount, type DeveloperAccountBridge } from './developerAccountSync';
import { recordDesktopEvent } from './desktopTelemetryService';
import {
  approvalCommand,
  approvalKindName,
  approvalReservations,
  type PendingApprovalReview,
} from './approvalReview';
import type { McpApprovalAsked, McpApprovalLaunchShown } from './mcpApprovalReview';
import { withoutGuardLifting } from './runtimeEnvironment';
import { readGitState, readWorkspaceGit } from './gitService';
import {
  WorktreeRootRefused,
  admitWorktreeRoot,
  forgetWorktreeRoot,
  getRoot,
  listRoots,
} from './workspaceStore';

const CLIENT_NAME = 'agi-desktop';
const CLIENT_TITLE = PRODUCT_NAMES.desktop;
const DEFAULT_BINARY = 'agi';
const REQUEST_TIMEOUT_MS = 30_000;
/**
 * Making a worktree from uncommitted work, applying one, and rewinding all
 * snapshot the whole folder through git, which on a large checkout takes far
 * longer than an ordinary request. The CLI bounds the same work at five minutes.
 */
const SNAPSHOT_TIMEOUT_MS = 300_000;
const VERSION_TIMEOUT_MS = 5_000;
const LOGOUT_TIMEOUT_MS = 15_000;
const SHUTDOWN_GRACE_MS = 1_500;
const STDERR_TAIL_BYTES = 8 * 1024;
const RISK_LEVELS: readonly AgentEventApprovalRiskLevel[] = ['low', 'medium', 'high'];

const BUNDLED_BINARY = path.join('agi-cli', 'agi');
const INSTALLED_BINARY = path.join('.agi', 'bin', 'agi');

const DOWNLOAD_HINT =
  'Install the AGI CLI with curl -fsSL https://agiworkforce.com/install.sh | bash, or set its path under Settings.';
const UNTRUSTED_FOLDER = /Current project is not trusted/;
const UNTRUSTED_FOLDER_HINT =
  'The AGI CLI chosen under Settings keeps its own folder trust. Run agi init once in this folder, or clear the CLI path under Settings to use the CLI that comes with this app.';
const RETRY_HINT =
  'Try again. If it keeps failing, choose Help > Copy Diagnostics and send that to support.';

export type DeveloperSessionEmitter = (rootId: string, event: DeveloperSessionEvent) => void;

export class DeveloperRuntimeUnavailableError extends Error {
  readonly hint: string;

  constructor(message: string, hint = DOWNLOAD_HINT) {
    super(message);
    this.name = 'DeveloperRuntimeUnavailableError';
    this.hint = hint;
  }
}

/** The user has not allowed the agent to run in this folder, so no CLI was started there. */
export class DeveloperAgentNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeveloperAgentNotAllowedError';
  }
}

/**
 * Another program holds the session's writer lease, so the CLI refused to
 * change it. Kept apart from other refusals because it is the one the user
 * can lift, by taking the session over.
 */
export class DeveloperThreadHeldError extends Error {
  constructor(holder: string | null) {
    super(
      holder ? `${holder} is writing this session.` : 'Another program is writing this session.',
    );
    this.name = 'DeveloperThreadHeldError';
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface RunningServer {
  stopReason?: string;
  root: WorkspaceRoot;
  child: ChildProcessWithoutNullStreams;
  pending: Map<number, PendingRequest>;
  buffer: string;
  stderrTail: string;
  nextId: number;
  ready: Promise<void>;
  closed: boolean;
  features: DeveloperRuntimeFeatures;
  /** Set once the process is known to be gone, so nothing signals a pid that may be reused. */
  exited: boolean;
  exitObserved: Promise<void>;
  confirmExit: () => void;
  /** What this process said at initialize that it serves, and nothing a later one said. */
  advertised: AdvertisedCapabilities | null;
  /** The worktree location it was started with; null when it was given none to honor. */
  worktreesRoot: string | null;
  /** Turns it is running, waiting on an approval or an answer included. */
  activeTurns: Set<string>;
  terminals: Set<string>;
  /** Setup scripts it is running or was just asked to run, by worktree. */
  setups: Map<string, number>;
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
  /**
   * Whether the person at this computer has allowed the agent to run in a
   * folder. The CLI loads that folder's hooks, commands and MCP servers as it
   * starts, so it is never started where they have not.
   */
  mayRunIn: (root: WorkspaceRoot) => boolean;
  workspaceConsentAtMs?: (root: WorkspaceRoot) => number | null;
  accountBridge?: DeveloperAccountBridge;
  spawn?: SpawnDeveloperRuntime;
  /** Whether a page is there to answer the agent's questions. */
  answersUserInput?: () => boolean;
  /** The folder the user chose for new worktrees; empty keeps the CLI's default. */
  worktreesRoot?: () => string;
  /** What a terminal the user opened printed, or that it ended. */
  onTerminalEvent?: (event: DeveloperTerminalEvent) => void;
}

export interface DeveloperTerminalEvent {
  rootId: string;
  terminalId: string;
  data?: string;
  exitCode?: number | null;
}

let emit: DeveloperSessionEmitter = () => undefined;
let resolveBinary: () => string = () => DEFAULT_BINARY;
let mayRunIn: (root: WorkspaceRoot) => boolean = () => false;
let spawnRuntime: SpawnDeveloperRuntime = nodeSpawn as SpawnDeveloperRuntime;
let workspaceConsentAtMs: (root: WorkspaceRoot) => number | null = () => null;
let accountBridge: DeveloperAccountBridge | null = null;
let answersUserInput: () => boolean = () => true;
let worktreesRoot: () => string = () => '';
let terminalEmit: (event: DeveloperTerminalEvent) => void = () => undefined;
const terminalRoots = new Map<string, string>();
let accountSyncError: string | null = null;
let accountSyncChain: Promise<void> = Promise.resolve();
let cachedStatus: { binary: string; status: DeveloperRuntimeStatus } | null = null;
interface AdvertisedCapabilities {
  binary: string;
  approvals: boolean;
  worktrees: boolean;
  checkpoints: boolean;
  threadDelete: boolean;
  forkThroughTurn: boolean;
  revertRestore: boolean;
  threadCompact: boolean;
  bypassPerTurn: boolean;
  writerLease: boolean;
  mcpApproval: boolean;
  reasoningEffortLadder: boolean;
  threadRename: boolean;
  threadUnarchive: boolean;
  threadPin: boolean;
  mcpLogs: boolean;
  terminals: boolean;
  mcp: boolean;
  mcpSetEnabled: boolean;
}

/**
 * The last handshake, for the status line only. What a request may ask of a
 * CLI is read from the server that will answer it: a path the user changed
 * leaves folders running the old program beside ones running the new.
 */
let lastAdvertised: AdvertisedCapabilities | null = null;

export function configureDeveloperSessions(configuration: DeveloperSessionConfiguration): void {
  emit = configuration.emit;
  resolveBinary = configuration.resolveBinary;
  mayRunIn = configuration.mayRunIn;
  workspaceConsentAtMs = configuration.workspaceConsentAtMs ?? (() => null);
  spawnRuntime = configuration.spawn ?? (nodeSpawn as SpawnDeveloperRuntime);
  accountBridge = configuration.accountBridge ?? null;
  answersUserInput = configuration.answersUserInput ?? (() => true);
  worktreesRoot = configuration.worktreesRoot ?? (() => '');
  terminalEmit = configuration.onTerminalEvent ?? (() => undefined);
  accountSyncError = null;
  accountSyncChain = Promise.resolve();
  cachedStatus = null;
  lastAdvertised = null;
  stopAllDeveloperRuntimes();
}

export function worktreesRootArgs(location: string): string[] {
  return location !== '' && path.isAbsolute(location) ? ['--worktrees-root', location] : [];
}

function isExecutableFile(candidate: string): boolean {
  try {
    accessSync(candidate, fsConstants.X_OK);
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * The CLI the packaged app carries in Contents/Resources, signed and notarized
 * with the bundle. A development run has no such resource, and Electron's own
 * resources directory must never be mistaken for one.
 */
function bundledBinary(): string | null {
  if (!app?.isPackaged) return null;
  const candidate = path.join(process.resourcesPath, BUNDLED_BINARY);
  return isExecutableFile(candidate) ? candidate : null;
}

type RuntimeSource = NonNullable<DeveloperRuntimeStatus['source']>;

/**
 * The binary every spawn uses: the path the user confirmed under Settings,
 * then the bundled CLI, then the one the install script puts in the home
 * folder, then `agi` on the PATH. An empty preference means the user chose
 * nothing, so the bundle answers.
 */
export function selectRuntimeBinary(): { binary: string; source: RuntimeSource } {
  const confirmed = resolveBinary().trim();
  if (confirmed !== '') return { binary: confirmed, source: 'custom' };
  const bundled = bundledBinary();
  if (bundled !== null) return { binary: bundled, source: 'bundled' };
  const installed = path.join(os.homedir(), INSTALLED_BINARY);
  if (isExecutableFile(installed)) return { binary: installed, source: 'path' };
  return { binary: DEFAULT_BINARY, source: 'path' };
}

/**
 * The CLI as an absolute path, which is the only thing a spawn is given. A
 * bare name leaves the lookup to the system, and with the working directory
 * set to a project folder some systems look there first: a program named
 * `agi` in a repository would then be started in place of the CLI.
 */
function runtimeBinary(): string {
  const { binary } = selectRuntimeBinary();
  const resolved = resolveBinaryPath(binary);
  if (resolved === null || !path.isAbsolute(resolved)) {
    throw spawnFailure(binary, Object.assign(new Error('not found'), { code: 'ENOENT' }));
  }
  return resolved;
}

/**
 * Where the shell would start the CLI, resolved the way `spawn` resolves it: a
 * configured value containing a separator is taken as written, anything else is
 * looked up on the PATH this app was launched with.
 */
export function resolveBinaryPath(binary: string): string | null {
  if (binary.includes(path.sep)) {
    try {
      accessSync(binary, fsConstants.X_OK);
      return binary;
    } catch {
      return null;
    }
  }
  for (const directory of (process.env['PATH'] ?? '').split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
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
  const { binary, source } = selectRuntimeBinary();
  if (cachedStatus?.binary !== binary) {
    cachedStatus = { binary, status: await resolveRuntimeStatus(binary, source) };
  }
  return {
    ...cachedStatus.status,
    accountSyncError,
    capabilities: servedCapabilities(binary),
  };
}

/**
 * How each feature the page gates on follows from what the CLI answered at
 * initialize. The handshake refuses a CLI that does not serve threads and
 * turns at this shell's protocol version, and that version is what carries the
 * per-turn options, steering, questions and archiving, so those hold for any
 * CLI that got this far. Keyed by capability so a new one cannot be offered
 * without saying what it rests on.
 */
const CAPABILITY_FROM_HANDSHAKE: Record<
  DeveloperRuntimeCapability,
  (cli: AdvertisedCapabilities) => boolean
> = {
  worktrees: (cli) => cli.worktrees,
  checkpoints: (cli) => cli.checkpoints,
  review: (cli) => cli.checkpoints,
  agent_mode: () => true,
  reasoning_effort: () => true,
  context_files: () => true,
  steer: () => true,
  user_input: () => true,
  images: () => true,
  approval_decisions: (cli) => cli.approvals,
  thread_delete: (cli) => cli.threadDelete,
  thread_fork: (cli) => cli.forkThroughTurn,
  thread_compact: (cli) => cli.threadCompact,
  rewind_choice: (cli) => cli.revertRestore,
  thread_archive: () => true,
  thread_takeover: (cli) => cli.writerLease,
  reasoning_effort_ladder: (cli) => cli.reasoningEffortLadder,
  thread_rename: (cli) => cli.threadRename,
  thread_unarchive: (cli) => cli.threadUnarchive,
  thread_pin: (cli) => cli.threadPin,
  mcp_servers: (cli) => cli.mcp,
  mcp_logs: (cli) => cli.mcpLogs,
  terminals: (cli) => cli.terminals,
};

/**
 * What the CLI this shell runs said at initialize that it serves. Until one
 * has answered there is nothing to go on, so nothing is offered.
 */
function servedCapabilities(binary: string): DeveloperRuntimeCapability[] {
  const cli = lastAdvertised?.binary === binary ? lastAdvertised : null;
  if (cli === null) return [];
  return DEVELOPER_RUNTIME_CAPABILITIES.filter((capability) =>
    CAPABILITY_FROM_HANDSHAKE[capability](cli),
  );
}

async function resolveRuntimeStatus(
  binary: string,
  source: RuntimeSource,
): Promise<DeveloperRuntimeStatus> {
  const resolved = resolveBinaryPath(binary);
  if (!resolved) {
    return {
      available: false,
      name: binary,
      version: null,
      path: null,
      hint: DOWNLOAD_HINT,
      source,
      accountSyncError: null,
    };
  }
  const version = await readVersion(resolved);
  if (version === null) {
    return {
      available: false,
      name: binary,
      version: null,
      path: displayPath(resolved),
      hint: DOWNLOAD_HINT,
      source,
      accountSyncError: null,
    };
  }
  return {
    available: true,
    name: path.basename(resolved),
    version,
    path: displayPath(resolved),
    hint: null,
    source,
    accountSyncError: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readCursor(source: Record<string, unknown>, key: string): number | undefined {
  const value = readNumber(source, key);
  return value !== null && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function isDeveloperFileChange(value: string | null): value is DeveloperFileChange {
  return value !== null && (DEVELOPER_FILE_CHANGES as readonly string[]).includes(value);
}

/**
 * The approval as this shell can render it. The CLI names the request's kind
 * with Rust's debug form, so the command is read back only from the one shape
 * whose quoting JSON also reads; anything else carries no command, and no
 * surface can offer a rule for a command it could not name.
 */
function readProposedPrefix(params: Record<string, unknown>): string[] | null {
  const prefix = params['proposedExecpolicyAmendment'];
  return Array.isArray(prefix) &&
    prefix.length > 0 &&
    prefix.every((token) => typeof token === 'string' && token !== '')
    ? (prefix as string[])
    : null;
}

function toApprovalRequest(params: Record<string, unknown>): DeveloperApprovalRequest | null {
  const requestId = readString(params, 'requestId');
  if (!requestId) return null;
  const rawKind = readString(params, 'kind') ?? '';
  const risk = readString(params, 'riskLevel');
  const reversible = params['reversible'];
  const proposedCommandPrefix = readProposedPrefix(params);
  return {
    requestId,
    kind: approvalKindName(rawKind),
    summary: readString(params, 'summary') ?? 'The agent needs approval to continue.',
    detail: readString(params, 'detail') ?? '',
    command: approvalCommand(rawKind),
    riskLevel: RISK_LEVELS.find((level) => level === risk) ?? null,
    reversible: typeof reversible === 'boolean' ? reversible : null,
    ...(proposedCommandPrefix ? { proposedCommandPrefix } : {}),
    ...readQuestion(params['question']),
  };
}

/** A multiple-choice question the agent asked, carried to the page intact. */
function readQuestion(value: unknown): { question?: { question: string; options: string[] } } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const question = typeof record['question'] === 'string' ? record['question'] : null;
  const options = Array.isArray(record['options'])
    ? record['options'].filter((option): option is string => typeof option === 'string')
    : [];
  return question ? { question: { question, options } } : {};
}

/**
 * Ends the CLI's process tree: its input is closed so it can shut down in its
 * own time, and whatever is left of the group is killed after the grace. The
 * app-server is spawned detached, so nothing else would ever end it.
 */
function stopProcess(server: RunningServer): void {
  if (server.exited) return;
  server.child.stdin.end();
  stopping.add(server);
  const hardKill = setTimeout(() => {
    if (stopping.has(server)) killProcess(server);
  }, SHUTDOWN_GRACE_MS);
  hardKill.unref?.();
}

/** The processes asked to shut down that have not been seen to exit yet. */
const stopping = new Set<RunningServer>();

function killProcess(server: RunningServer): void {
  stopping.delete(server);
  if (server.exited) return;
  const pid = server.child.pid;
  try {
    if (pid !== undefined && process.platform !== 'win32') process.kill(-pid, 'SIGKILL');
    else server.child.kill('SIGKILL');
  } catch {
    // The tree is already gone.
  }
}

/**
 * Every way a server stops being used ends its process too: a failed
 * handshake, a frame that is not protocol, a stop this app asked for. Dropping
 * only the registry entry left the CLI running, and each retry started
 * another beside it.
 */
function closeServer(server: RunningServer, error: Error, announce = true): void {
  if (server.closed) return;
  server.closed = true;
  server.stopReason = error.message;
  stopProcess(server);
  for (const pending of server.pending.values()) {
    clearTimeout(pending.timer);
    pending.reject(error);
  }
  server.pending.clear();
  server.buffer = '';
  if (announce && servers.get(server.root.id) === server) {
    emit(server.root.id, { type: 'runtime-stopped', message: error.message });
  }
}

/**
 * Whether the server is doing anything a restart would cut short: a turn, an
 * approval or question it waits on, a terminal, a setup script, or a request
 * still unanswered.
 */
function serverBusy(server: RunningServer): boolean {
  return (
    server.activeTurns.size > 0 ||
    server.terminals.size > 0 ||
    server.setups.size > 0 ||
    server.pending.size > 0
  );
}

/**
 * Ends a server started with a worktree location the user has since changed,
 * once nothing on it would be interrupted. The next request starts its
 * replacement with the new location. Nothing was running, so no session hears
 * that its runtime stopped.
 */
function restartIfStale(server: RunningServer): void {
  if (server.closed || server.worktreesRoot === null) return;
  if (server.worktreesRoot === worktreesRoot() || serverBusy(server)) return;
  closeServer(server, new Error('The AGI CLI restarted to use the new worktree location.'), false);
}

function countSetup(server: RunningServer, worktreeId: string, change: 1 | -1): void {
  const count = (server.setups.get(worktreeId) ?? 0) + change;
  if (count > 0) server.setups.set(worktreeId, count);
  else server.setups.delete(worktreeId);
}

/**
 * Applies a change that may leave the server idle, then looks again once the
 * caller has had its turn to send a follow-up request on the same server.
 */
function settle(server: RunningServer, change: () => unknown): void {
  change();
  if (server.worktreesRoot === null || server.worktreesRoot === worktreesRoot()) return;
  setTimeout(() => restartIfStale(server), 0);
}

/**
 * The saved worktree location changed: every CLI started with the old one is
 * restarted, now when idle, otherwise as soon as its last session settles.
 */
export function applyWorktreesRootChange(): void {
  for (const server of [...servers.values()]) restartIfStale(server);
}

function ownsRuntime(server: RunningServer): boolean {
  return !server.closed && servers.get(server.root.id) === server;
}

function confirmProcessExit(server: RunningServer): void {
  server.exited = true;
  stopping.delete(server);
  if (servers.get(server.root.id) === server) servers.delete(server.root.id);
  server.confirmExit();
}

async function waitForProcessExit(server: RunningServer): Promise<void> {
  if (server.exited) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      server.exitObserved,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new DeveloperRuntimeUnavailableError(
              `${server.stopReason ?? 'The AGI CLI was stopped.'} Its process has not confirmed exit. Try again after it exits.`,
            ),
          );
        }, REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** The CLI's refusal of a grant as it left the wire, before `data` has been read. */
class StaleMcpApproval extends Error {
  readonly current: unknown;

  constructor(message: string, current: unknown) {
    super(message);
    this.name = 'StaleMcpApproval';
    this.current = current;
  }
}

function writerHolder(data: unknown): string | null {
  const writer = isRecord(data) ? data['writer'] : null;
  return isRecord(writer) ? readString(writer, 'holderLabel') : null;
}

function acceptLine(server: RunningServer, line: string): void {
  if (!ownsRuntime(server)) return;
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
    settle(server, () => server.pending.delete(parsed['id'] as number));
    const failure = parsed['error'];
    if (isRecord(failure)) {
      const message = readString(failure, 'message') ?? 'The AGI CLI refused that request.';
      pending.reject(
        failure['code'] === THREAD_WRITER_CONFLICT_ERROR_CODE
          ? new DeveloperThreadHeldError(writerHolder(failure['data']))
          : failure['code'] === MCP_APPROVAL_STALE_ERROR_CODE
            ? new StaleMcpApproval(message, failure['data'])
            : new Error(message),
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
  if (!ownsRuntime(server)) return;
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
  const kind = messageKindForAgentEvent(readString(event, 'type') ?? '');
  const sequence = readCursor(params, 'sequence');
  const publish = (event: DeveloperSessionEvent) =>
    emit(server.root.id, { ...event, ...(sequence === undefined ? {} : { sequence }) });

  if (event['type'] === 'approval-resolved') {
    const requestId = readString(event, 'approvalId');
    const decisions = {
      approved: 'approve_once',
      'approved-for-session': 'approve_for_session',
      denied: 'deny',
      cancelled: 'deny_and_stop',
    } as const;
    const decision = readString(event, 'decision');
    if (!requestId || !decision || !Object.hasOwn(decisions, decision)) return;
    const panelDecision = decisions[decision as keyof typeof decisions];
    publish({
      type: 'approval-answered',
      threadId,
      turnId,
      requestId,
      decision: panelDecision,
      approved: decision === 'approved' || decision === 'approved-for-session',
    });
    return;
  }
  if (kind !== 'tool_call' && kind !== 'tool_result') return;

  if (event['type'] === 'turn-diff') {
    publish({
      type: 'turn-diff',
      threadId,
      turnId,
      unifiedDiff: readString(event, 'unifiedDiff') ?? '',
      paths: Array.isArray(event['paths'])
        ? event['paths'].filter((path): path is string => typeof path === 'string')
        : [],
    });
    return;
  }

  const toolCallId = readString(event, 'toolCallId');
  if (!toolCallId) return;

  if (event['type'] === 'command-started') {
    const command = readString(event, 'command');
    if (!command) return;
    publish({
      type: 'command-started',
      threadId,
      turnId,
      toolCallId,
      command,
      cwd: readString(event, 'cwd') ?? null,
    });
    return;
  }
  if (event['type'] === 'file-changed') {
    const path = readString(event, 'path');
    const change = readString(event, 'change');
    if (!path || !isDeveloperFileChange(change)) return;
    publish({ type: 'file-changed', threadId, turnId, toolCallId, path, change });
    return;
  }

  const name = readString(event, 'name');
  if (!name) return;

  if (event['type'] === 'tool-execution-queued') {
    publish({
      type: 'tool-queued',
      threadId,
      turnId,
      toolCallId,
      name,
      position: readNumber(event, 'position') ?? 0,
      queueDepth: readNumber(event, 'queueDepth') ?? 1,
    });
    return;
  }
  if (event['type'] === 'tool-execution-start') {
    publish({
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
    publish({
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

function worktreeSetupEvent(
  server: RunningServer,
  method: string,
  params: Record<string, unknown>,
): void {
  const worktreeId = readString(params, 'worktreeId');
  const threadId = readString(params, 'threadId');
  if (worktreeId && method === 'worktree/managed/setup/finished')
    settle(server, () => countSetup(server, worktreeId, -1));
  if (!worktreeId || !threadId) return;
  const rootId = worktreeRootId(server.root.id, worktreeId);
  if (method === 'worktree/managed/setup/log') {
    const stream = readString(params, 'stream');
    const text = params['text'];
    if ((stream !== 'stdout' && stream !== 'stderr') || typeof text !== 'string') return;
    emit(rootId, { type: 'worktree-setup-log', threadId, worktreeId, stream, text });
    return;
  }
  emit(rootId, {
    type: 'worktree-setup-finished',
    threadId,
    worktreeId,
    exitCode: readNumber(params, 'exitCode'),
    succeeded: params['succeeded'] === true,
  });
}

function handleNotification(server: RunningServer, method: string, rawParams: unknown): void {
  if (!ownsRuntime(server)) return;
  const params = isRecord(rawParams) ? rawParams : {};

  if (method === 'turn/agent_event') {
    agentEvent(server, params);
    return;
  }
  if (method === 'worktree/managed/setup/log' || method === 'worktree/managed/setup/finished') {
    worktreeSetupEvent(server, method, params);
    return;
  }
  if (method === 'terminal/output' || method === 'terminal/exited') {
    const terminalId = readString(params, 'terminalId');
    if (!terminalId || terminalRoots.get(terminalId) !== server.root.id) return;
    if (method === 'terminal/output') {
      const data = params['data'];
      if (typeof data === 'string') terminalEmit({ rootId: server.root.id, terminalId, data });
      return;
    }
    terminalRoots.delete(terminalId);
    settle(server, () => server.terminals.delete(terminalId));
    const code = params['code'];
    terminalEmit({
      rootId: server.root.id,
      terminalId,
      exitCode: typeof code === 'number' ? code : null,
    });
    return;
  }

  const threadId = readString(params, 'threadId');
  const turnId = readString(params, 'turnId');
  if (!threadId || !turnId) return;

  if (method === 'turn/started') {
    server.activeTurns.add(turnId);
    emit(server.root.id, { type: 'turn-started', threadId, turnId });
    return;
  }
  if (method === 'turn/output_delta') {
    const delta = params['delta'];
    if (typeof delta === 'string') {
      const index = readCursor(params, 'index');
      emit(server.root.id, {
        type: 'output-delta',
        threadId,
        turnId,
        delta,
        ...(index === undefined ? {} : { index }),
      });
    }
    return;
  }
  if (method === 'approval/requested') {
    const approval = toApprovalRequest(params);
    if (!approval) return;
    server.activeTurns.add(turnId);
    emit(server.root.id, { type: 'approval-requested', threadId, turnId, ...approval });
    return;
  }
  if (method === 'userInput/requested') {
    const requestId = readString(params, 'requestId');
    const question = readString(params, 'question');
    if (!requestId || !question) return;
    server.activeTurns.add(turnId);
    if (!answersUserInput()) {
      void requestOrNull(server, 'userInput/respond', {
        threadId,
        turnId,
        requestId,
        answer: null,
      });
      return;
    }
    emit(server.root.id, { type: 'user-input-requested', threadId, turnId, requestId, question });
    return;
  }
  if (method === 'turn/steered') {
    emit(server.root.id, { type: 'turn-steered', threadId, turnId });
    return;
  }

  const outcome = turnOutcome(method);
  if (!outcome) return;
  settle(server, () => server.activeTurns.delete(turnId));
  const unsentSteers = readNumber(params, 'unsentSteers') ?? 0;
  const contextTokens = readCursor(params, 'contextTokens');
  emit(server.root.id, {
    type: 'turn-finished',
    threadId,
    turnId,
    outcome,
    response: readString(params, 'response') ?? '',
    failure: readFailure(params),
    inputTokens: readNumber(params, 'inputTokens') ?? 0,
    outputTokens: readNumber(params, 'outputTokens') ?? 0,
    ...(unsentSteers > 0 ? { unsentSteers } : {}),
    ...(contextTokens === undefined ? {} : { contextTokens }),
  });
}

/**
 * The structured failure, or one built from the legacy string.
 *
 * A CLI that predates the failure object still sends `error`, and dropping that
 * would leave a turn failing in silence. It classifies as `unknown`, which is
 * exactly what the surface knows about it.
 */
function readFailure(params: Record<string, unknown>): DeveloperTurnFailure | null {
  const raw = params['failure'];
  if (isRecord(raw)) {
    const message = readString(raw, 'message');
    if (message) {
      return {
        code: (readString(raw, 'code') ?? 'unknown') as TurnFailureCode,
        message,
        provider: readString(raw, 'provider'),
        action: (readString(raw, 'action') ?? 'none') as TurnFailureAction,
        retryable: raw['retryable'] === true,
      };
    }
  }
  const legacy = readString(params, 'error');
  if (!legacy) return null;
  return { code: 'unknown', message: legacy, provider: null, action: 'none', retryable: false };
}

function request(
  server: RunningServer,
  method: string,
  params: unknown,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  if (!ownsRuntime(server)) {
    return Promise.reject(
      new DeveloperRuntimeUnavailableError(
        server.stopReason ?? 'The AGI CLI is no longer running.',
      ),
    );
  }
  const id = server.nextId++;
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      settle(server, () => server.pending.delete(id));
      reject(new Error(`The AGI CLI did not answer ${method} in time.`));
    }, timeoutMs);
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

/**
 * The app-server signs in to the origin this shell is showing, not to the
 * production default the CLI would pick on its own. `AGI_AUTH_BASE` carries
 * the `/api` prefix the device-grant endpoints sit behind; the account and
 * tier reads take the bare origin.
 */
function cloudEnvironment(): Record<string, string> {
  return {
    AGIWORKFORCE_API_BASE: CLOUD_APP_ORIGIN,
    AGI_AUTH_BASE: `${CLOUD_APP_ORIGIN}/api`,
  };
}

function runtimeEnvironment(): NodeJS.ProcessEnv {
  return { ...withoutGuardLifting(process.env), ...cloudEnvironment() };
}

/**
 * Reachability is cached per app-server, so the one that reconciled is not the
 * only one whose answer the account just changed.
 */
async function refreshOtherModels(source: RunningServer): Promise<void> {
  for (const other of servers.values()) {
    if (other === source || other.closed) continue;
    await requestOrNull(other, 'model/list', { refresh: true });
  }
}

/**
 * Sign this machine's CLI out without an app-server to carry the request.
 *
 * The protocol's `account/logout` needs a running app-server, and an
 * app-server needs an approved folder, so a shell that has neither would leave
 * a credential behind for an account the user has signed out of. The CLI's own
 * `logout --account-only` needs neither, and forgets only the account grant: the
 * provider keys the user saved in the terminal stay.
 */
async function runCliLogout(): Promise<void> {
  const { binary } = selectRuntimeBinary();
  const program = runtimeBinary();
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnRuntime(program, ['logout', '--account-only'], {
        env: runtimeEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      reject(spawnFailure(binary, error as NodeJS.ErrnoException));
      return;
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('The AGI CLI did not finish signing this computer out in time.'));
    }, LOGOUT_TIMEOUT_MS);
    timer.unref?.();
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(spawnFailure(binary, error as NodeJS.ErrnoException));
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else
        reject(
          new Error(`The AGI CLI could not sign this computer out (exit ${code ?? 'unknown'}).`),
        );
    });
  });
}

async function signOutMachine(): Promise<void> {
  const bridge = accountBridge;
  if (!bridge || !shellSignedCliIn()) return;
  const identity = await bridge.readShellIdentity();
  if (identity === null || identity.signedIn) return;
  try {
    await runCliLogout();
    rememberShellSignedCliIn(false);
    accountSyncError = null;
  } catch (error) {
    accountSyncError = error instanceof Error ? error.message : String(error);
  }
}

async function assertSshAccount(server: RunningServer): Promise<void> {
  const identity = await accountBridge?.readShellIdentity();
  if (!identity?.signedIn || !identity.email)
    throw new Error('Sign in to Desktop before using an SSH coding environment.');
  const status = await request(server, 'account/status', {});
  const email = isRecord(status) ? readString(status, 'email') : null;
  if (
    !isRecord(status) ||
    status['signedIn'] !== true ||
    !email ||
    email.trim().toLowerCase() !== identity.email.trim().toLowerCase()
  )
    throw new Error(
      'The remote CLI must already be signed in to the same account. Local sign-in credentials are never forwarded over SSH.',
    );
}

function queueAccountSync(server: RunningServer): Promise<void> {
  const bridge = accountBridge;
  if (!bridge) return accountSyncChain;
  accountSyncChain = accountSyncChain.then(async () => {
    if (server.closed) return;
    if (hasSshEnvironment(server.root.id)) {
      try {
        await assertSshAccount(server);
      } catch (error) {
        closeServer(server, error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }
    try {
      const outcome = await reconcileDeveloperAccount(
        (method, params, timeoutMs) => request(server, method, params, timeoutMs),
        bridge,
        shellSignedCliIn(),
        rememberShellSignedCliIn,
      );
      accountSyncError = null;
      recordDesktopEvent({ domain: 'sync', outcome: 'ok' });
      if (outcome === 'signed-in' || outcome === 'signed-out') await refreshOtherModels(server);
    } catch (error) {
      // An app-server that stopped mid-sequence says nothing about the account.
      if (server.closed) return;
      recordDesktopEvent({ domain: 'sync', outcome: 'failed', cause: 'unknown' });
      accountSyncError = error instanceof Error ? error.message : String(error);
    }
  });
  return accountSyncChain;
}

export function syncDeveloperAccounts(): Promise<void> {
  const running = [...servers.values()].filter((server) => !server.closed);
  if (running.length === 0) {
    accountSyncChain = accountSyncChain.then(signOutMachine);
    return accountSyncChain;
  }
  for (const server of running) queueAccountSync(server);
  return accountSyncChain;
}

async function handshake(server: RunningServer, binary: string): Promise<void> {
  const result = await request(server, 'initialize', {
    clientInfo: { name: CLIENT_NAME, title: CLIENT_TITLE, version: PROTOCOL_VERSION.toString() },
    protocolVersion: PROTOCOL_VERSION,
    userInput: true,
  });
  if (!ownsRuntime(server)) {
    throw new DeveloperRuntimeUnavailableError(
      server.stopReason ?? 'The AGI CLI is no longer running.',
    );
  }
  if (!isRecord(result) || result['protocolVersion'] !== PROTOCOL_VERSION) {
    throw new DeveloperRuntimeUnavailableError(
      `The installed AGI CLI does not speak developer-session protocol ${PROTOCOL_VERSION}.`,
      'Update the AGI CLI, or point Settings at a current binary.',
    );
  }
  const serverInfo = result['serverInfo'];
  const runtimeVersion = isRecord(serverInfo) ? serverInfo['version'] : undefined;
  if (typeof runtimeVersion !== 'string' || !isSupportedRuntimeVersion(runtimeVersion)) {
    throw new DeveloperRuntimeUnavailableError(
      `The installed AGI CLI reports version ${JSON.stringify(runtimeVersion ?? null)}; this app needs ${MINIMUM_SUPPORTED_RUNTIME_VERSION} or newer.`,
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
  server.features = {
    maxTurns: capabilities['maxTurns'] === true,
    memory: capabilities['memory'] === true,
  };
  server.advertised = {
    binary,
    approvals: capabilities['approvals'] === true,
    writerLease: capabilities['writerLease'] === true,
    worktrees: capabilities['managedWorktrees'] === true,
    checkpoints: capabilities['checkpoints'] === true,
    threadDelete: capabilities['threadDelete'] === true,
    forkThroughTurn: capabilities['forkThroughTurn'] === true,
    threadCompact: capabilities['threadCompact'] === true,
    bypassPerTurn: capabilities['bypassPerTurn'] === true,
    revertRestore: capabilities['revertRestore'] === true,
    mcpApproval: capabilities['mcpApproval'] === true,
    reasoningEffortLadder: capabilities['reasoningEffortLadder'] === true,
    threadRename: capabilities['threadRename'] === true,
    threadUnarchive: capabilities['threadUnarchive'] === true,
    threadPin: capabilities['threadPin'] === true,
    mcpLogs: capabilities['mcpLogs'] === true,
    terminals: capabilities['terminals'] === true,
    mcp: capabilities['mcp'] === true,
    mcpSetEnabled: capabilities['mcpSetEnabled'] === true,
  };
  lastAdvertised = server.advertised;
}

const serverLaunches = new Map<string, { promise: Promise<RunningServer>; cancelled: boolean }>();
async function ensureServer(root: WorkspaceRoot): Promise<RunningServer> {
  const existing = servers.get(root.id);
  if (existing && !existing.closed) return existing;
  const pending = serverLaunches.get(root.id);
  if (pending) return pending.promise;
  let resolve!: (server: RunningServer) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<RunningServer>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  const entry = {
    promise: promise.finally(() => {
      if (serverLaunches.get(root.id) === entry) serverLaunches.delete(root.id);
    }),
    cancelled: false,
  };
  serverLaunches.set(root.id, entry);
  void launchServer(root, () => !entry.cancelled).then(resolve, reject);
  return entry.promise;
}
async function launchServer(root: WorkspaceRoot, allowed: () => boolean): Promise<RunningServer> {
  const existing = servers.get(root.id);
  if (existing && !existing.closed) return existing;
  if (existing) await waitForProcessExit(existing);
  if (!allowed()) throw new Error('The runtime launch was cancelled.');

  if (!hasSshEnvironment(root.id) && !mayRunIn(root)) {
    throw new DeveloperAgentNotAllowedError(
      `Coding sessions are not allowed in ${root.name} right now. Start a session in that folder to allow them.`,
    );
  }

  try {
    if (!hasSshEnvironment(root.id) && !statSync(root.path).isDirectory())
      throw new Error('not a directory');
  } catch {
    throw new DeveloperRuntimeUnavailableError(
      `${root.name} is no longer on this Mac, so no coding session can run in it.`,
      'Remove the folder under Settings, or restore it and try again.',
    );
  }

  const { binary, source } = selectRuntimeBinary();
  const remote = hasSshEnvironment(root.id) ? await sshLaunch(root.id) : null;
  if (!allowed() || (remote && !hasSshEnvironment(root.id)))
    throw new Error('The runtime launch was cancelled.');
  const program = remote?.program ?? runtimeBinary();
  // The signed bundle pairs this host with a CLI that accepts process-scoped
  // consent. External CLIs retain their existing trust setup and argument ABI.
  const consentAt = !remote && source === 'bundled' ? workspaceConsentAtMs(root) : null;
  if (
    !remote &&
    source === 'bundled' &&
    (consentAt === null || !Number.isSafeInteger(consentAt) || consentAt < 0)
  )
    throw new DeveloperAgentNotAllowedError(
      'Allow commands in this folder again to provide its current consent.',
    );
  const location = !remote && source === 'bundled' ? worktreesRoot() : null;
  const localArgs =
    location !== null
      ? [
          'app-server',
          '--workspace-consent',
          root.path,
          '--workspace-consent-at-ms',
          String(consentAt),
          ...worktreesRootArgs(location),
        ]
      : ['app-server'];
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawnRuntime(program, remote?.args ?? localArgs, {
      cwd: remote ? os.homedir() : root.path,
      env: remote?.env ?? runtimeEnvironment(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
  } catch (error) {
    throw spawnFailure(binary, error as NodeJS.ErrnoException);
  }

  let confirmExit!: () => void;
  const exitObserved = new Promise<void>((resolve) => {
    confirmExit = resolve;
  });
  const server: RunningServer = {
    root,
    child,
    pending: new Map(),
    buffer: '',
    stderrTail: '',
    nextId: 1,
    ready: Promise.resolve(),
    closed: false,
    features: { maxTurns: false, memory: false },
    exited: false,
    exitObserved,
    confirmExit,
    advertised: null,
    worktreesRoot: location,
    activeTurns: new Set(),
    terminals: new Set(),
    setups: new Map(),
  };

  servers.set(root.id, server);

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => acceptChunk(server, chunk));
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    server.stderrTail = `${server.stderrTail}${chunk}`.slice(-STDERR_TAIL_BYTES);
  });
  child.once('error', (error) => {
    if (child.pid === undefined) server.exited = true;
    closeServer(server, spawnFailure(binary, error as NodeJS.ErrnoException));
    if (child.pid === undefined) confirmProcessExit(server);
  });
  child.once('exit', (code, signal) => {
    server.exited = true;
    const detail = server.stderrTail.trim();
    closeServer(
      server,
      new Error(
        `The AGI CLI exited (${signal ?? String(code ?? 'unknown')})${detail === '' ? '' : `: ${detail}`}`,
      ),
    );
    confirmProcessExit(server);
  });

  server.ready = handshake(server, binary).catch((error: unknown) => {
    closeServer(server, error instanceof Error ? error : new Error(String(error)));
    throw error;
  });
  void server.ready.then(
    () => queueAccountSync(server),
    () => undefined,
  );
  return server;
}

async function readyServer(root: WorkspaceRoot): Promise<RunningServer> {
  const server = await ensureServer(root);
  await server.ready;
  if (!ownsRuntime(server)) {
    throw new DeveloperRuntimeUnavailableError(
      server.stopReason ?? 'The AGI CLI is no longer running.',
    );
  }
  if (hasSshEnvironment(root.id)) {
    await assertSshAccount(server);
    verifySshWorkspace(root.id, await request(server, 'workspace/identity', {}));
  }
  return server;
}

/**
 * Refuse a method the running CLI said at initialize that it does not serve,
 * before sending it, so an older CLI answers with what to do rather than an
 * unknown-method error. Updating the app only replaces the bundled CLI, so a
 * CLI the user chose, or one found on the PATH, is named instead.
 */
function requireAdvertised(
  server: RunningServer,
  feature:
    | 'worktrees'
    | 'checkpoints'
    | 'threadDelete'
    | 'forkThroughTurn'
    | 'revertRestore'
    | 'threadCompact'
    | 'writerLease'
    | 'mcpApproval'
    | 'threadRename'
    | 'threadUnarchive'
    | 'threadPin'
    | 'mcpLogs'
    | 'terminals'
    | 'mcp'
    | 'mcpSetEnabled',
): void {
  if (!server.advertised?.[feature]) {
    const { binary, source } = selectRuntimeBinary();
    const message =
      source === 'bundled'
        ? DEVELOPER_COMMAND_NEEDS_UPDATE
        : `Update the AGI CLI at ${displayPath(resolveBinaryPath(binary) ?? binary)}, then try again.`;
    throw new DeveloperRuntimeUnavailableError(
      message,
      'Update the AGI CLI, or point Settings at a current binary.',
    );
  }
}

function requireRoot(rootId: string): WorkspaceRoot {
  const root = hasSshEnvironment(rootId) ? requireSshRoot(rootId) : getRoot(rootId);
  if (!root) throw new DeveloperRuntimeUnavailableError('That folder is no longer approved.');
  return root;
}

function readStartPoint(raw: unknown): WorktreeStartPoint | null {
  if (!isRecord(raw)) return null;
  const kind = readString(raw, 'kind');
  if (kind === 'working_tree') return { kind: 'working_tree' };
  const name = readString(raw, 'name');
  return kind === 'ref' && name ? { kind: 'ref', name } : null;
}

function toSetupScript(raw: unknown): DeveloperWorktreeSetupScript | null {
  if (!isRecord(raw)) return null;
  const scriptPath = readString(raw, 'path');
  const sha256 = readString(raw, 'sha256');
  if (!scriptPath || !sha256) return null;
  return { path: scriptPath, sha256, approved: raw['approved'] === true };
}

function toWorktree(
  rootId: string,
  raw: unknown,
  setupScript: DeveloperWorktreeSetupScript | null,
): DeveloperWorktree | null {
  if (!isRecord(raw)) return null;
  const id = readString(raw, 'id');
  const worktreePath = readString(raw, 'path');
  const start = readStartPoint(raw['start']);
  if (!id || !worktreePath || !start) return null;
  return {
    id,
    rootId,
    path: worktreePath,
    label: readString(raw, 'label'),
    start,
    baseCommit: readString(raw, 'baseCommit') ?? '',
    createdAt: readString(raw, 'createdAt') ?? '',
    threadId: readString(raw, 'threadId'),
    pinned: raw['pinned'] === true,
    active: raw['active'] === true,
    missing: raw['missing'] === true,
    setupScript,
    setupExitCode: readNumber(raw, 'setupExitCode'),
    setupRanAt: readString(raw, 'setupRanAt'),
  };
}

function worktreeName(parent: WorkspaceRoot, worktree: DeveloperWorktree): string {
  return `${parent.name} · ${worktree.label ?? `worktree ${worktree.id}`}`;
}

/**
 * Admit a worktree the folder's CLI named, so the folder's grant covers it.
 * The path always comes from that CLI, never from the page, and the store
 * checks it against the worktree's own marker before admitting it. A checkout
 * that is gone or does not check out is listed but not admitted.
 */
async function rememberWorktree(
  parent: WorkspaceRoot,
  worktree: DeveloperWorktree,
): Promise<WorkspaceRoot | null> {
  try {
    return await admitNamedWorktree(parent, worktree);
  } catch (error) {
    if (error instanceof WorktreeRootRefused) return null;
    throw error;
  }
}

function admitNamedWorktree(
  parent: WorkspaceRoot,
  worktree: DeveloperWorktree,
): Promise<WorkspaceRoot> {
  return admitWorktreeRoot(parent.id, worktree.id, worktree.path, worktreeName(parent, worktree));
}

async function listWorktrees(parent: WorkspaceRoot): Promise<{
  worktrees: Array<{ worktree: DeveloperWorktree; thread: unknown }>;
}> {
  const server = await readyServer(parent);
  const result = await request(server, 'worktree/managed/list', {});
  const setupScript = isRecord(result) ? toSetupScript(result['setupScript']) : null;
  const raw = isRecord(result) && Array.isArray(result['worktrees']) ? result['worktrees'] : [];
  const listed = await Promise.all(
    raw.map(async (entry: unknown) => {
      const worktree = toWorktree(parent.id, entry, setupScript);
      if (!worktree) return [];
      await rememberWorktree(parent, worktree);
      return [{ worktree, thread: isRecord(entry) ? entry['thread'] : null }];
    }),
  );
  return { worktrees: listed.flat() };
}

/**
 * The folder a `rootId` runs sessions in. An approved folder is itself; a
 * worktree is looked up through the CLI of the folder it was made from, so a
 * page can only reach a worktree that folder's CLI vouches for.
 */
async function resolveRoot(rootId: string): Promise<WorkspaceRoot> {
  const worktree = parseWorktreeRootId(rootId);
  if (!worktree) return requireRoot(rootId);
  const parent = requireRoot(worktree.rootId);
  const known = getRoot(rootId);
  if (known) return known;
  await listWorktrees(parent);
  const found = getRoot(rootId);
  if (!found) {
    throw new DeveloperRuntimeUnavailableError(
      'That worktree is no longer on this computer.',
      'Start a new session to make another one.',
    );
  }
  return found;
}

/** The approved folder and its worktree id, for commands only a worktree answers. */
function requireWorktree(rootId: string): { parent: WorkspaceRoot; worktreeId: string } {
  const worktree = parseWorktreeRootId(rootId);
  if (!worktree) throw new Error('That session does not run in a worktree.');
  return { parent: requireRoot(worktree.rootId), worktreeId: worktree.worktreeId };
}

function toSession(rootId: string, raw: unknown): LocalDeveloperSession | null {
  if (!isRecord(raw)) return null;
  const id = readString(raw, 'id');
  if (!id) return null;
  return {
    id,
    rootId,
    ...(hasSshEnvironment(rootId) ? { environment: 'ssh' as const } : {}),
    title: readString(raw, 'title') ?? 'Untitled session',
    cwd: readString(raw, 'cwd') ?? '',
    model: readString(raw, 'model'),
    provider: readString(raw, 'provider'),
    trustMode: (readString(raw, 'trustMode') ?? 'unknown') as DeveloperSessionTrustMode,
    status: (readString(raw, 'status') ?? 'idle') as ThreadStatus,
    createdAt: readString(raw, 'createdAt') ?? '',
    updatedAt: readString(raw, 'updatedAt') ?? '',
    origin: (readString(raw, 'createdBy') ?? 'cli') as DeveloperSessionSource,
    ...(readString(raw, 'location') === 'cloud' ? { location: 'cloud' as const } : {}),
    ...(raw['pinned'] === true ? { pinned: true } : {}),
    ...(typeof raw['archivedAt'] === 'number' && Number.isFinite(raw['archivedAt'])
      ? { archivedAt: raw['archivedAt'] }
      : {}),
  };
}

function requireSession(rootId: string, raw: unknown): LocalDeveloperSession {
  const session = toSession(rootId, isRecord(raw) ? raw['thread'] : null);
  if (!session) throw new Error('The AGI CLI returned a session this app could not read.');
  return session;
}

async function listForRoot(
  root: WorkspaceRoot,
  includeCloud: boolean,
  includeArchived = false,
): Promise<DeveloperSessionGroup[]> {
  const remote = hasSshEnvironment(root.id);
  const { git, unavailableReason } = remote
    ? {
        git: null,
        unavailableReason:
          'SSH file changes are reviewed through agent output and transcript diffs. The host file editor and PTY are unavailable.',
      }
    : await readWorkspaceGit(root);
  const group: DeveloperSessionGroup = {
    rootId: root.id,
    name: root.name,
    path: root.path,
    branch: git?.branch ?? null,
    ...(unavailableReason ? { gitUnavailableReason: unavailableReason } : {}),
    sessions: [],
  };
  let worktrees: DeveloperSessionGroup[] = [];

  try {
    const server = await readyServer(root);
    const result = await request(server, 'thread/list', {
      cwd: root.path,
      ...(includeCloud ? { includeCloud } : {}),
      ...(includeArchived ? { includeArchived } : {}),
    });
    const threads = isRecord(result) ? result['threads'] : null;
    if (Array.isArray(threads)) {
      group.sessions = threads
        .map((thread) => toSession(root.id, thread))
        .filter((session): session is LocalDeveloperSession => session !== null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    const awaiting = remote ? [] : await serversAwaitingApproval(server);
    if (awaiting.length > 0) group.mcpAwaitingApproval = awaiting;
    if (!remote) worktrees = await worktreeGroups(root, server, group);
  } catch (error) {
    group.unavailable = unavailableFrom(error);
    return [group];
  }

  return [group, ...worktrees];
}

/**
 * An install hint belongs only to a CLI that is missing. A CLI that started and
 * then stopped is installed, so its own reason is the one worth acting on.
 */
function unavailableFrom(error: unknown): DeveloperRuntimeUnavailable {
  if (error instanceof DeveloperRuntimeUnavailableError) {
    return { message: error.message, hint: error.hint };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { message, hint: UNTRUSTED_FOLDER.test(message) ? UNTRUSTED_FOLDER_HINT : RETRY_HINT };
}

const MCP_APPROVAL_SCOPES: readonly DeveloperMcpApprovalScope[] = ['project', 'plugin'];

function toAwaitingApproval(raw: unknown): DeveloperMcpServerAwaitingApproval[] {
  const servers = isRecord(raw) ? raw['servers'] : null;
  if (!Array.isArray(servers)) return [];
  return servers
    .flatMap((entry): DeveloperMcpServerAwaitingApproval[] => {
      if (!isRecord(entry) || entry['status'] !== 'needs_approval') return [];
      const name = readString(entry, 'name');
      const scope = MCP_APPROVAL_SCOPES.find((candidate) => candidate === entry['scope']);
      return name && scope ? [{ name, scope }] : [];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * The project servers this folder's CLI holds back until the user approves
 * their launch. Only a CLI that can be asked about one is read: against any
 * other the approval happens in a terminal, and a row here would offer a
 * review that cannot be carried out. A list that cannot be read is no reason
 * to lose the folder's sessions.
 */
async function serversAwaitingApproval(
  server: RunningServer,
): Promise<DeveloperMcpServerAwaitingApproval[]> {
  if (!server.advertised?.mcpApproval) return [];
  return toAwaitingApproval(await requestOrNull(server, 'mcp/list'));
}

function terminalSize(cols: number, rows: number): { cols: number; rows: number } {
  const clamp = (value: number, max: number) =>
    Math.min(max, Math.max(TERMINAL_MIN_SIZE, Math.round(Number.isFinite(value) ? value : 0)));
  return { cols: clamp(cols, TERMINAL_MAX_COLUMNS), rows: clamp(rows, TERMINAL_MAX_ROWS) };
}

export async function openDeveloperTerminal(
  rootId: string,
  cols: number,
  rows: number,
): Promise<{ terminalId: string }> {
  const root = await resolveRoot(rootId);
  if (hasSshEnvironment(rootId)) {
    throw new DeveloperRuntimeUnavailableError('Terminals open only for folders on this computer.');
  }
  const server = await readyServer(root);
  requireAdvertised(server, 'terminals');
  const result = await request(server, 'terminal/open', {
    cwd: root.path,
    ...terminalSize(cols, rows),
  });
  const terminalId = isRecord(result) ? readString(result, 'terminalId') : null;
  if (!terminalId) throw new Error('The AGI CLI did not open a terminal.');
  terminalRoots.set(terminalId, rootId);
  server.terminals.add(terminalId);
  return { terminalId };
}

async function terminalServer(rootId: string, terminalId: string): Promise<RunningServer> {
  if (terminalRoots.get(terminalId) !== rootId) {
    throw new DeveloperRuntimeUnavailableError('That terminal has closed.');
  }
  return readyServer(await resolveRoot(rootId));
}

export async function writeDeveloperTerminal(
  rootId: string,
  terminalId: string,
  data: string,
): Promise<boolean> {
  if (data.length > TERMINAL_WRITE_LIMIT) throw new Error('That is too much to type at once.');
  await request(await terminalServer(rootId, terminalId), 'terminal/write', { terminalId, data });
  return true;
}

export async function resizeDeveloperTerminal(
  rootId: string,
  terminalId: string,
  cols: number,
  rows: number,
): Promise<boolean> {
  await request(await terminalServer(rootId, terminalId), 'terminal/resize', {
    terminalId,
    ...terminalSize(cols, rows),
  });
  return true;
}

export async function closeDeveloperTerminal(rootId: string, terminalId: string): Promise<boolean> {
  if (terminalRoots.get(terminalId) !== rootId) return true;
  terminalRoots.delete(terminalId);
  const server = await readyServer(await resolveRoot(rootId));
  await requestOrNull(server, 'terminal/close', { terminalId });
  settle(server, () => server.terminals.delete(terminalId));
  return true;
}

/** Whether the CLI this shell last heard from serves MCP servers on this computer. */
export function localMcpAvailable(): boolean {
  return lastAdvertised?.mcp === true;
}

export interface DeveloperMcpServerInput {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  transport?: 'http' | 'sse';
  env?: Record<string, string>;
}

async function mcpServer(rootId: string): Promise<RunningServer> {
  const server = await readyServer(await resolveRoot(rootId));
  requireAdvertised(server, 'mcp');
  return server;
}

export async function listDeveloperMcpServers(rootId: string): Promise<unknown[]> {
  const result = await request(await mcpServer(rootId), 'mcp/list', {});
  return isRecord(result) && Array.isArray(result['servers']) ? result['servers'] : [];
}

export async function addDeveloperMcpServer(
  rootId: string,
  input: DeveloperMcpServerInput,
): Promise<unknown> {
  return request(await mcpServer(rootId), 'mcp/add', { ...input });
}

export async function removeDeveloperMcpServer(rootId: string, name: string): Promise<unknown> {
  return request(await mcpServer(rootId), 'mcp/remove', { name });
}

export async function setDeveloperMcpServerEnabled(
  rootId: string,
  name: string,
  enabled: boolean,
): Promise<unknown> {
  const server = await mcpServer(rootId);
  requireAdvertised(server, 'mcpSetEnabled');
  return request(server, 'mcp/setEnabled', { name, enabled });
}

export async function testDeveloperMcpServer(rootId: string, name: string): Promise<unknown> {
  const result = await request(await mcpServer(rootId), 'mcp/test', { name });
  if (isRecord(result) && typeof result['elapsedMs'] === 'bigint') {
    return { ...result, elapsedMs: Number(result['elapsedMs']) };
  }
  return result;
}

export async function developerMcpServerTools(rootId: string, name: string): Promise<unknown> {
  return request(await mcpServer(rootId), 'mcp/tools', { name });
}

export async function developerMcpServerLogs(
  rootId: string,
  name: string,
  limit: number,
): Promise<unknown> {
  const server = await mcpServer(rootId);
  requireAdvertised(server, 'mcpLogs');
  return request(server, 'mcp/logs', { name, limit });
}

/**
 * The CLI answered a question about a project server with a refusal of its
 * own: the server is already approved, is no longer declared, or cannot start
 * even if approved.
 */
export class DeveloperMcpApprovalRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeveloperMcpApprovalRefused';
  }
}

/**
 * The launch a yes named is no longer the one that would start, so the CLI
 * approved nothing. `current` is that server's launch as the CLI describes it
 * now, which is what the user is asked about next.
 */
export class DeveloperMcpApprovalChanged extends Error {
  readonly current: McpApprovalAsked;

  constructor(message: string, current: McpApprovalAsked) {
    super(message);
    this.name = 'DeveloperMcpApprovalChanged';
    this.current = current;
  }
}

const MCP_SANDBOXES: readonly McpApprovalSandbox[] = [
  'sandboxed',
  'kept_sandboxed',
  'unavailable',
  'opted_out',
  'turned_off',
  'no_sandbox',
];
const MCP_NETWORKS: readonly McpApprovalNetwork[] = [
  'internet',
  'internet_and_local',
  'unconfined',
];

function readStrings(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/**
 * The launch in parts, as a CLI new enough sends it. A containment or a reach
 * this build has no word for is kept as `unknown`, so the dialog says it
 * could not read it instead of leaving the line out as if nothing applied.
 */
function toMcpApprovalLaunch(raw: unknown): McpApprovalLaunchShown | null {
  if (!isRecord(raw)) return null;
  const project = readString(raw, 'project');
  if (!project) return null;
  const env = Array.isArray(raw['env']) ? raw['env'] : [];
  return {
    project,
    program: readString(raw, 'program'),
    args: readStrings(raw['args']),
    env: env.flatMap((entry) => {
      const name = isRecord(entry) ? readString(entry, 'name') : null;
      if (!isRecord(entry) || !name) return [];
      const notPassed = entry['notPassed'] === true;
      const value = !notPassed && typeof entry['value'] === 'string' ? entry['value'] : null;
      return [{ name, value, notPassed }];
    }),
    workingFolder: readString(raw, 'workingFolder'),
    files: readStrings(raw['files']),
    sandbox:
      raw['sandbox'] === undefined
        ? null
        : (MCP_SANDBOXES.find((known) => known === raw['sandbox']) ?? 'unknown'),
    network:
      raw['network'] === undefined
        ? null
        : (MCP_NETWORKS.find((known) => known === raw['network']) ?? 'unknown'),
    url: readString(raw, 'url'),
    headerNames: readStrings(raw['headerNames']),
    authorizeUrl: readString(raw, 'authorizeUrl'),
    tokenUrl: readString(raw, 'tokenUrl'),
    oauthScope: readString(raw, 'oauthScope'),
    oauthClientId: readString(raw, 'oauthClientId'),
    oauthRedirectUri: readString(raw, 'oauthRedirectUri'),
    oauthClientSecretSet: raw['oauthClientSecretSet'] === true,
    askedAtEveryStart: raw['askedAtEveryStart'] === true,
  };
}

/**
 * An approval request as the CLI sent it, for the server that was asked
 * about. One that names another server, or carries no question or no hash, is
 * not something to put to the user.
 */
function toMcpApprovalAsked(
  raw: unknown,
  name: string,
  scope: DeveloperMcpApprovalScope,
): McpApprovalAsked | null {
  if (!isRecord(raw)) return null;
  const question = readString(raw, 'question');
  const fingerprint = readString(raw, 'fingerprint');
  if (!question || !fingerprint || raw['name'] !== name || raw['scope'] !== scope) return null;
  return { name, scope, question, fingerprint, launch: toMcpApprovalLaunch(raw['launch']) };
}

async function requestMcpApproval(
  server: RunningServer,
  method: 'mcp/approval/read' | 'mcp/approval/grant',
  params: Record<string, unknown>,
): Promise<unknown> {
  try {
    return await request(server, method, params);
  } catch (error) {
    if (error instanceof DeveloperRuntimeUnavailableError || error instanceof StaleMcpApproval) {
      throw error;
    }
    throw new DeveloperMcpApprovalRefused(error instanceof Error ? error.message : String(error));
  }
}

/**
 * What the CLI would ask before starting one project server in an approved
 * folder, with the hash of the launch that question describes.
 */
export async function readDeveloperMcpApproval(
  rootId: string,
  name: string,
  scope: DeveloperMcpApprovalScope,
): Promise<McpApprovalAsked> {
  const server = await readyServer(requireRoot(rootId));
  requireAdvertised(server, 'mcpApproval');
  const asked = toMcpApprovalAsked(
    await requestMcpApproval(server, 'mcp/approval/read', { name, scope }),
    name,
    scope,
  );
  if (!asked) {
    throw new DeveloperMcpApprovalRefused(
      'The AGI CLI described no launch for that server, so there is nothing to allow.',
    );
  }
  return asked;
}

/**
 * Record the user's yes to the launch `fingerprint` names. The CLI refuses a
 * launch that is no longer that one, so nothing is approved that was not
 * shown, and says what it is now: that is thrown as
 * `DeveloperMcpApprovalChanged`, read from the refusal and never guessed.
 * Answers with the servers still waiting in the folder.
 */
export async function grantDeveloperMcpApproval(
  rootId: string,
  asked: Pick<McpApprovalAsked, 'name' | 'scope' | 'fingerprint'>,
): Promise<DeveloperMcpServerAwaitingApproval[]> {
  const server = await readyServer(requireRoot(rootId));
  requireAdvertised(server, 'mcpApproval');
  try {
    return toAwaitingApproval(
      await requestMcpApproval(server, 'mcp/approval/grant', {
        name: asked.name,
        scope: asked.scope,
        fingerprint: asked.fingerprint,
      }),
    );
  } catch (error) {
    if (!(error instanceof StaleMcpApproval)) throw error;
    const current = toMcpApprovalAsked(error.current, asked.name, asked.scope);
    if (!current) throw new DeveloperMcpApprovalRefused(error.message);
    throw new DeveloperMcpApprovalChanged(error.message, current);
  }
}

/**
 * A group per worktree the folder's CLI made, carrying the one session that
 * runs in it. The session comes from the folder's own list, so no runtime is
 * started inside a worktree just to name it. A folder that is not a git
 * repository has no worktrees, which is not a failure of the folder; any other
 * refusal is recorded on the folder's group, whose own sessions still list.
 */
const NOT_A_WORKTREE_REPOSITORY = 'is not inside a git repository with a working tree';

async function worktreeGroups(
  parent: WorkspaceRoot,
  server: RunningServer,
  group: DeveloperSessionGroup,
): Promise<DeveloperSessionGroup[]> {
  if (!server.advertised?.worktrees) return [];
  let listed: Awaited<ReturnType<typeof listWorktrees>>;
  try {
    listed = await listWorktrees(parent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.endsWith(NOT_A_WORKTREE_REPOSITORY)) group.worktreesUnavailable = message;
    return [];
  }
  return listed.worktrees.map(({ worktree, thread }) => {
    const rootId = worktreeRootId(parent.id, worktree.id);
    const session = toSession(rootId, thread);
    return {
      rootId,
      name: worktreeName(parent, worktree),
      path: worktree.path,
      branch: null,
      sessions: session ? [session] : [],
      worktree,
    };
  });
}

async function requestOrNull(
  server: RunningServer,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  try {
    return await request(server, method, params);
  } catch {
    return null;
  }
}

function toUnreachable(raw: unknown): DeveloperModelUnreachable | null {
  if (!isRecord(raw)) return null;
  const code = readString(raw, 'code');
  const action = readString(raw, 'action');
  if (!code || !action) return null;
  return {
    code: code as DeveloperModelUnreachable['code'],
    action: action as DeveloperModelUnreachable['action'],
    provider: readString(raw, 'provider'),
  };
}

function toHostModels(raw: unknown): DeveloperHostModel[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = readString(entry, 'id');
    if (!id) return [];
    const trustMode = readString(entry, 'trustMode') ?? 'unknown';
    return [
      {
        id,
        provider: readString(entry, 'provider') ?? '',
        reachable: entry['reachable'] === true,
        trustMode: trustMode as DeveloperHostModel['trustMode'],
        unreachable: toUnreachable(entry['unreachable']),
      },
    ];
  });
}

/**
 * What the CLI can run in one folder. Each of the three reads is optional: a
 * host that does not serve models, settings or an account answers with nothing
 * rather than failing the whole call, so a chooser still gets what is there.
 */
export async function readDeveloperModels(
  rootId: string,
  refresh = false,
): Promise<DeveloperRuntimeModels> {
  const root = await resolveRoot(rootId);
  const server = await readyServer(root);
  const [modelList, settings, account] = await Promise.all([
    requestOrNull(server, 'model/list', refresh ? { refresh: true } : {}),
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

  const mode = normalizeDeveloperAgentMode(
    isRecord(settings) ? readString(settings, 'permissionMode') : null,
  );
  const effort = isRecord(settings) ? readString(settings, 'defaultEffort') : null;

  return {
    models,
    hostModels: toHostModels(isRecord(modelList) ? modelList['hostModels'] : null),
    defaultModelId: isRecord(settings) ? readString(settings, 'defaultModel') : null,
    defaultAgentMode: mode === 'bypass' ? null : mode,
    defaultReasoningEffort: DEVELOPER_REASONING_EFFORTS.find((level) => level === effort) ?? null,
    managedSignedIn: isRecord(account) && account['signedIn'] === true,
    features: server.features,
  };
}

export async function listDeveloperSessions(
  includeRoot: (root: WorkspaceRoot) => boolean = () => true,
  options: { includeCloud?: boolean; includeArchived?: boolean } = {},
): Promise<DeveloperSessionList> {
  const groups = await Promise.all(
    [...listRoots(), ...listSshRoots()]
      .filter(includeRoot)
      .map((root) =>
        listForRoot(root, options.includeCloud === true, options.includeArchived === true),
      ),
  );
  return { groups: groups.flat() };
}

/**
 * The running turn as `thread/reconnect` describes it, with every approval and
 * question it is waiting on, so a page that opens mid-turn can still answer.
 */
function toPanelActiveTurn(raw: unknown): DeveloperActiveTurn | null {
  if (!isRecord(raw)) return null;
  const active = raw['activeTurn'];
  if (!isRecord(active)) return null;
  const turnId = readString(active, 'turnId');
  if (!turnId) return null;
  const approvals = Array.isArray(active['pendingApprovals']) ? active['pendingApprovals'] : [];
  const questions = Array.isArray(active['pendingUserInputs']) ? active['pendingUserInputs'] : [];
  return {
    turnId,
    partialResponse: typeof active['partialResponse'] === 'string' ? active['partialResponse'] : '',
    ...(readCursor(active, 'nextDeltaIndex') === undefined
      ? {}
      : { nextDeltaIndex: readCursor(active, 'nextDeltaIndex') }),
    ...(readCursor(active, 'nextEventSequence') === undefined
      ? {}
      : { nextEventSequence: readCursor(active, 'nextEventSequence') }),
    approvals: approvals.flatMap((entry) => {
      const approval = isRecord(entry) ? toApprovalRequest(entry) : null;
      return approval ? [approval] : [];
    }),
    questions: questions.flatMap((entry): DeveloperUserInputRequest[] => {
      if (!isRecord(entry)) return [];
      const requestId = readString(entry, 'requestId');
      const question = readString(entry, 'question');
      return requestId && question ? [{ requestId, question }] : [];
    }),
  };
}

function toChildTasks(raw: unknown): DeveloperChildTask[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-50).flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = readString(item, 'id');
    const title = readString(item, 'title');
    const parentSessionId = readString(item, 'parentSessionId');
    const state = readString(item, 'state');
    if (
      !id ||
      !title ||
      !parentSessionId ||
      !state ||
      ![
        'queued',
        'running',
        'paused',
        'awaiting_input',
        'completed',
        'cancelled',
        'failed',
      ].includes(state)
    )
      return [];
    return [{ id, title, parentSessionId, state: state as DeveloperChildTask['state'] }];
  });
}

export async function readDeveloperSession(
  rootId: string,
  threadId: string,
): Promise<DeveloperSessionTranscript> {
  const root = await resolveRoot(rootId);
  const server = await readyServer(root);
  const [result, reconnect] = await Promise.all([
    request(server, 'thread/read', { threadId }),
    requestOrNull(server, 'thread/reconnect', { threadId }),
  ]);
  const messages = isRecord(result) ? result['messages'] : null;
  return {
    session: requireSession(rootId, result),
    messages: Array.isArray(messages) ? (messages as DeveloperMessage[]) : [],
    truncated: isRecord(result) && result['transcriptTruncated'] === true,
    activeTurn: toPanelActiveTurn(reconnect),
    childTasks: toChildTasks(isRecord(result) ? result['childTasks'] : null),
  };
}

export type { DeveloperSessionActivity };

function toFileChanges(raw: unknown): DeveloperSessionFileChange[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const filePath = readString(entry, 'path');
    const kind = readString(entry, 'kind');
    if (!filePath || (kind !== 'created' && kind !== 'modified')) return [];
    return [
      {
        path: filePath,
        kind,
        tool: readString(entry, 'tool') ?? '',
        toolCallId: readString(entry, 'toolCallId') ?? '',
        changedAt: readString(entry, 'changedAt') ?? '',
      },
    ];
  });
}

function toActiveTurn(raw: unknown): DeveloperSessionActivity['activeTurn'] {
  if (!isRecord(raw)) return null;
  const active = raw['activeTurn'];
  if (!isRecord(active)) return null;
  const turnId = readString(active, 'turnId');
  if (!turnId) return null;
  const pending = Array.isArray(active['pendingApprovals']) ? active['pendingApprovals'] : [];
  return {
    turnId,
    partialResponse: typeof active['partialResponse'] === 'string' ? active['partialResponse'] : '',
    pendingApprovals: pending.flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const requestId = readString(entry, 'requestId');
      if (!requestId) return [];
      return [
        {
          requestId,
          summary: readString(entry, 'summary') ?? 'The agent needs approval to continue.',
          detail: readString(entry, 'detail') ?? '',
        },
      ];
    }),
  };
}

export async function readDeveloperSessionActivity(
  rootId: string,
  threadId: string,
): Promise<DeveloperSessionActivity> {
  const root = await resolveRoot(rootId);
  const server = await readyServer(root);
  const [read, reconnect] = await Promise.all([
    request(server, 'thread/read', { threadId }),
    requestOrNull(server, 'thread/reconnect', { threadId }),
  ]);
  const messages = isRecord(read) ? read['messages'] : null;
  const thread = isRecord(read) ? read['thread'] : null;
  return {
    transcript: {
      session: requireSession(rootId, read),
      messages: Array.isArray(messages) ? (messages as DeveloperMessage[]) : [],
      truncated: isRecord(read) && read['transcriptTruncated'] === true,
      activeTurn: toPanelActiveTurn(reconnect),
      childTasks: toChildTasks(isRecord(read) ? read['childTasks'] : null),
    },
    branch: isRecord(thread) ? readString(thread, 'gitBranch') : null,
    fileChanges: toFileChanges(isRecord(read) ? read['fileChanges'] : null),
    activeTurn: toActiveTurn(reconnect),
  };
}

/**
 * Start a session in the folder, or in a new worktree of it. A worktree is
 * made by the folder's CLI, then the session starts in a CLI running inside
 * the worktree, which binds the worktree to that one session.
 */
export async function startDeveloperSession(
  rootId: string,
  model?: string,
  placement: Pick<DeveloperSessionStartRequest, 'environment' | 'worktreeStart'> & {
    title?: string;
  } = {},
): Promise<StartedDeveloperSession> {
  const input = { rootId, model, ...placement };
  const title = placement.title;
  if (input.environment === 'ssh' && !hasSshEnvironment(rootId))
    throw new Error('Choose an allowed SSH environment before starting an SSH session.');
  // A thread takes its model route at thread/start, so one started before the
  // CLI is signed in to this account is pinned to the user's own provider keys.
  if (input.environment !== 'worktree') {
    const root = await resolveRoot(rootId);
    const server = await readyServer(root);
    await queueAccountSync(server);
    const result = await request(server, 'thread/start', {
      cwd: root.path,
      ...(model ? { model } : {}),
      ...(title ? { title } : {}),
    });
    return requireSession(rootId, result);
  }

  const parent = requireRoot(rootId);
  const parentServer = await readyServer(parent);
  await queueAccountSync(parentServer);
  requireAdvertised(parentServer, 'worktrees');
  const start =
    input.worktreeStart === 'working_tree'
      ? { kind: 'working_tree' }
      : { kind: 'ref', name: 'HEAD' };
  let created: unknown;
  try {
    created = await request(
      parentServer,
      'worktree/managed/create',
      { start },
      SNAPSHOT_TIMEOUT_MS,
    );
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${failure} The creation outcome is unconfirmed. Refresh the worktree list and inspect it before trying again.`,
    );
  }
  const setupScript = isRecord(created) ? toSetupScript(created['setupScript']) : null;
  const worktree = toWorktree(
    parent.id,
    isRecord(created) ? created['worktree'] : null,
    setupScript,
  );
  if (!worktree) {
    throw new Error(
      'The AGI CLI returned an unreadable worktree creation receipt. The creation outcome is unknown. Refresh the worktree list and inspect it before trying again.',
    );
  }
  const cleanupFailures = toCleanupFailures(isRecord(created) ? created['cleanupFailures'] : null);
  let root: WorkspaceRoot;
  try {
    root = await admitNamedWorktree(parent, worktree);
  } catch (error) {
    throw worktreeStartFailure(worktree, error);
  }
  try {
    const server = await readyServer(root);
    const result = await request(server, 'thread/start', {
      cwd: root.path,
      ...(model ? { model } : {}),
      ...(title ? { title } : {}),
    });
    const session = requireSession(root.id, result);
    return cleanupFailures.length > 0 ? { ...session, cleanupFailures } : session;
  } catch (error) {
    try {
      await stopWorktreeRuntime(root.id);
    } catch (stopError) {
      throw worktreeStartFailure(worktree, error, stopError);
    }
    throw worktreeStartFailure(worktree, error);
  }
}

function worktreeStartFailure(
  worktree: DeveloperWorktree,
  error: unknown,
  stopError?: unknown,
): Error {
  const failure = error instanceof Error ? error.message : String(error);
  const stopping =
    stopError === undefined
      ? ''
      : ` Runtime shutdown could not be confirmed: ${stopError instanceof Error ? stopError.message : String(stopError)}.`;
  return new Error(
    `${failure} The CLI reported worktree ${worktree.id} at ${worktree.path}. No automatic deletion was requested. Refresh the worktree list to inspect it before retrying.${stopping}`,
  );
}

function toCleanupFailures(raw: unknown): WorktreeCleanupFailure[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry: unknown) => {
    if (!isRecord(entry)) return [];
    const reason = readString(entry, 'reason');
    return reason ? [{ worktreeId: readString(entry, 'worktreeId') ?? '', reason }] : [];
  });
}

/**
 * Direct-child exit is not proof that descendants or a remote CLI have stopped.
 */
async function stopWorktreeRuntime(rootId: string): Promise<void> {
  const server = servers.get(rootId);
  if (!server) return;
  if (!server.closed) await requestOrNull(server, 'shutdown', {});
  terminate(server);
  await waitForProcessExit(server);
}

/**
 * Remove a worktree after the CLI keeps everything in it on a ref. Its session
 * is stopped first, because a worktree a runtime is serving cannot be removed.
 */
export async function deleteDeveloperWorktree(rootId: string): Promise<{ snapshotRef: string }> {
  const { parent, worktreeId } = requireWorktree(rootId);
  await stopWorktreeRuntime(rootId);
  const server = await readyServer(parent);
  let result: unknown;
  try {
    result = await request(server, 'worktree/managed/delete', { worktreeId }, SNAPSHOT_TIMEOUT_MS);
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${failure} The deletion outcome for worktree ${worktreeId} is unconfirmed. Inspect the worktree and archive before trying again.`,
    );
  }
  const snapshotRef = isRecord(result) ? readString(result, 'snapshotRef') : null;
  const snapshotCommit = isRecord(result) ? readString(result, 'snapshotCommit') : null;
  if (
    !isRecord(result) ||
    readString(result, 'worktreeId') !== worktreeId ||
    !snapshotRef ||
    !snapshotRef.trim() ||
    !snapshotCommit ||
    !snapshotCommit.trim()
  ) {
    throw new Error(
      `The AGI CLI did not return a complete matching archive receipt for worktree ${worktreeId}. The deletion outcome is unknown. Inspect the worktree and archive before trying again.`,
    );
  }
  forgetWorktreeRoot(rootId);
  return { snapshotRef };
}

export async function pinDeveloperWorktree(rootId: string, pinned: boolean): Promise<boolean> {
  const { parent, worktreeId } = requireWorktree(rootId);
  const server = await readyServer(parent);
  await request(server, 'worktree/managed/pin', { worktreeId, pinned });
  return pinned;
}

function stringList(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/**
 * A CLI this app already started and that finished its handshake, preferring
 * the folder's own. Reading a setting must not start one.
 */
async function runningServer(root: WorkspaceRoot): Promise<RunningServer | null> {
  const candidates = [servers.get(root.id), ...servers.values()];
  for (const server of candidates) {
    if (!server || server.closed) continue;
    try {
      await server.ready;
      return server;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * How many of the newest worktrees cleanup keeps, read or, with `keep`, set
 * through the folder's CLI. The count is the CLI's, shared by every folder. A
 * read with no CLI running answers null rather than starting one.
 */
export async function developerWorktreeKeep(
  rootId: string,
  keep?: number,
): Promise<{ keep: number; maxKeep: number } | null> {
  const root = requireRoot(rootId);
  const server = keep === undefined ? await runningServer(root) : await readyServer(root);
  if (server === null) return null;
  const result = await request(server, 'worktree/managed/keep', keep === undefined ? {} : { keep });
  const count = isRecord(result) ? readNumber(result, 'keep') : null;
  const maxKeep = isRecord(result) ? readNumber(result, 'maxKeep') : null;
  if (count === null || maxKeep === null) {
    throw new Error('The AGI CLI did not say how many worktrees it keeps.');
  }
  return { keep: count, maxKeep };
}

/** Bring a worktree session's changes into the folder it was made from. */
export async function applyDeveloperWorktree(
  rootId: string,
  preview: boolean,
): Promise<WorktreeApplyResponse> {
  const { parent, worktreeId } = requireWorktree(rootId);
  const server = await readyServer(parent);
  const result = await request(
    server,
    'worktree/managed/applyToLocal',
    { worktreeId, ...(preview ? { preview: true } : {}) },
    SNAPSHOT_TIMEOUT_MS,
  );
  if (!isRecord(result)) throw new Error('The AGI CLI did not say what it applied.');
  return {
    applied: stringList(result['applied']),
    skipped: stringList(result['skipped']),
    conflicted: stringList(result['conflicted']),
    preview: result['preview'] === true,
  };
}

/** Run the worktree's setup script, whose exact content the user just approved. */
export async function runDeveloperWorktreeSetup(rootId: string, sha256: string): Promise<boolean> {
  const { parent, worktreeId } = requireWorktree(rootId);
  const server = await readyServer(parent);
  countSetup(server, worktreeId, 1);
  try {
    await request(server, 'worktree/managed/setup/run', { worktreeId, sha256 });
  } catch (error) {
    settle(server, () => countSetup(server, worktreeId, -1));
    throw error;
  }
  return true;
}

export async function listDeveloperCheckpoints(
  rootId: string,
  threadId: string,
): Promise<CheckpointListResponse> {
  const root = await resolveRoot(rootId);
  const server = await readyServer(root);
  requireAdvertised(server, 'checkpoints');
  const result = await request(server, 'checkpoint/list', { threadId }, SNAPSHOT_TIMEOUT_MS);
  if (!isRecord(result) || !Array.isArray(result['turns'])) {
    throw new Error('The AGI CLI returned checkpoints this app could not read.');
  }
  return result as unknown as CheckpointListResponse;
}

export async function readDeveloperCheckpointDiff(
  rootId: string,
  threadId: string,
  turnId: string,
): Promise<CheckpointDiffResponse> {
  const root = await resolveRoot(rootId);
  const server = await readyServer(root);
  requireAdvertised(server, 'checkpoints');
  const result = await request(
    server,
    'checkpoint/diff',
    { threadId, turnId },
    SNAPSHOT_TIMEOUT_MS,
  );
  if (!isRecord(result) || !Array.isArray(result['files'])) {
    throw new Error('The AGI CLI returned a diff this app could not read.');
  }
  return result as unknown as CheckpointDiffResponse;
}

async function checkpointSections(
  method: 'checkpoint/revert' | 'checkpoint/stage',
  input: DeveloperCheckpointSectionsRequest,
): Promise<CheckpointSectionsResponse> {
  const root = await resolveRoot(input.rootId);
  const server = await readyServer(root);
  requireAdvertised(server, 'checkpoints');
  const result = await request(
    server,
    method,
    {
      threadId: input.threadId,
      turnId: input.turnId,
      sections: input.sections,
      ...(input.preview ? { preview: true } : {}),
    },
    SNAPSHOT_TIMEOUT_MS,
  );
  const conflicted = isRecord(result) ? result['conflicted'] : null;
  if (!isRecord(result) || !Array.isArray(conflicted)) {
    throw new Error('The AGI CLI did not say which changes it made.');
  }
  return {
    applied: stringList(result['applied']),
    conflicted: conflicted.flatMap((entry: unknown) => {
      if (!isRecord(entry)) return [];
      const conflictPath = readString(entry, 'path');
      return conflictPath
        ? [{ path: conflictPath, reason: readString(entry, 'reason') ?? '' }]
        : [];
    }),
    preview: result['preview'] === true,
  };
}

export function revertDeveloperCheckpoint(
  input: DeveloperCheckpointSectionsRequest,
): Promise<CheckpointSectionsResponse> {
  return checkpointSections('checkpoint/revert', input);
}

export function stageDeveloperCheckpoint(
  input: DeveloperCheckpointSectionsRequest,
): Promise<CheckpointSectionsResponse> {
  return checkpointSections('checkpoint/stage', input);
}

/** Rewind a session's files, its conversation or both to just before one of its turns. */
export async function revertDeveloperThread(
  input: DeveloperThreadRevertRequest,
): Promise<ThreadRevertResponse> {
  const root = await resolveRoot(input.rootId);
  const server = await readyServer(root);
  if (input.restore && input.restore !== 'both') requireAdvertised(server, 'revertRestore');
  const result = await request(
    server,
    'thread/revert',
    {
      threadId: input.threadId,
      turnId: input.turnId,
      ...(input.preview ? { preview: true } : {}),
      ...(input.restore && input.restore !== 'both' ? { restore: input.restore } : {}),
    },
    SNAPSHOT_TIMEOUT_MS,
  );
  if (!isRecord(result)) throw new Error('The AGI CLI did not say what it rewound.');
  const recoveryRef = readString(result, 'recoveryRef');
  const skippedFiles = stringList(result['skippedFiles']);
  return {
    threadId: input.threadId,
    turnId: input.turnId,
    preview: result['preview'] === true,
    files: stringList(result['files']),
    ...(skippedFiles.length > 0 ? { skippedFiles } : {}),
    messagesRemoved: readNumber(result, 'messagesRemoved') ?? 0,
    ...(recoveryRef ? { recoveryRef } : {}),
  };
}

/**
 * Delete a session and what the CLI persisted with it. A CLI that predates
 * the fuller answer says only `acknowledged`, which reads as nothing kept,
 * removed or released.
 */
export async function deleteDeveloperThread(
  input: DeveloperThreadDeleteRequest,
): Promise<ThreadDeleteResponse> {
  const root = await resolveRoot(input.rootId);
  const server = await readyServer(root);
  requireAdvertised(server, 'threadDelete');
  const result = await request(
    server,
    'thread/delete',
    {
      threadId: input.threadId,
      ...(input.discardWorktreeArchives ? { discardWorktreeArchives: true } : {}),
    },
    SNAPSHOT_TIMEOUT_MS,
  );
  if (!isRecord(result) || result['acknowledged'] !== true) {
    throw new Error('The AGI CLI did not say it deleted the session.');
  }
  return {
    acknowledged: true,
    keptWorktreeArchives: stringList(result['keptWorktreeArchives']),
    removedWorktreeArchives: stringList(result['removedWorktreeArchives']),
    releasedWorktrees: stringList(result['releasedWorktrees']),
  };
}

/**
 * Put a session away. The CLI keeps its conversation and checkpoints and
 * leaves it out of every list; `agi session unarchive` brings it back.
 */
export async function archiveDeveloperThread(rootId: string, threadId: string): Promise<boolean> {
  const root = await resolveRoot(rootId);
  const server = await readyServer(root);
  const result = await request(server, 'thread/archive', { threadId });
  if (!isRecord(result) || result['acknowledged'] !== true) {
    throw new Error('The AGI CLI did not say it archived the session.');
  }
  return true;
}

export async function unarchiveDeveloperThread(rootId: string, threadId: string): Promise<boolean> {
  const root = await resolveRoot(rootId);
  const server = await readyServer(root);
  requireAdvertised(server, 'threadUnarchive');
  const result = await request(server, 'thread/unarchive', { threadId });
  if (!isRecord(result) || result['acknowledged'] !== true) {
    throw new Error('The AGI CLI did not say it restored the session.');
  }
  return true;
}

export async function renameDeveloperThread(
  rootId: string,
  threadId: string,
  title: string,
): Promise<LocalDeveloperSession> {
  const trimmed = title.trim();
  if (trimmed === '') throw new Error('A session needs a name.');
  const root = await resolveRoot(rootId);
  const server = await readyServer(root);
  requireAdvertised(server, 'threadRename');
  return requireSession(
    rootId,
    await request(server, 'thread/rename', { threadId, title: trimmed }),
  );
}

export async function pinDeveloperThread(
  rootId: string,
  threadId: string,
  pinned: boolean,
): Promise<boolean> {
  const root = await resolveRoot(rootId);
  const server = await readyServer(root);
  requireAdvertised(server, 'threadPin');
  const result = await request(server, 'thread/pin', { threadId, pinned });
  if (!isRecord(result) || result['pinned'] !== pinned) {
    throw new Error('The AGI CLI did not say it changed the pin.');
  }
  return pinned;
}

/**
 * Take a session from the program writing it, so turns sent here run. That
 * program's next turn is refused until it takes the session back.
 */
export async function takeOverDeveloperThread(
  rootId: string,
  threadId: string,
): Promise<LocalDeveloperSession> {
  const root = await resolveRoot(rootId);
  const server = await readyServer(root);
  requireAdvertised(server, 'writerLease');
  return requireSession(rootId, await request(server, 'thread/writer/takeover', { threadId }));
}

/**
 * Start a new session from the conversation through one turn. A CLI that
 * cannot cut the copy at a turn would carry the whole conversation instead,
 * so it is refused rather than asked.
 */
export async function forkDeveloperThread(
  input: DeveloperThreadForkRequest,
): Promise<LocalDeveloperSession> {
  const root = await resolveRoot(input.rootId);
  const server = await readyServer(root);
  requireAdvertised(server, 'forkThroughTurn');
  return requireSession(
    input.rootId,
    await request(
      server,
      'thread/fork',
      { threadId: input.threadId, throughTurnId: input.throughTurnId },
      SNAPSHOT_TIMEOUT_MS,
    ),
  );
}

/**
 * Summarize what the model reads of a session, from one turn on or the older
 * part of all of it. The model writes the summary, so this waits as long as a
 * snapshot does.
 */
export async function compactDeveloperThread(
  input: DeveloperThreadCompactRequest,
): Promise<ThreadCompactResponse> {
  const root = await resolveRoot(input.rootId);
  const server = await readyServer(root);
  requireAdvertised(server, 'threadCompact');
  const result = await request(
    server,
    'thread/compact',
    {
      threadId: input.threadId,
      ...(input.fromTurnId ? { fromTurnId: input.fromTurnId } : {}),
    },
    SNAPSHOT_TIMEOUT_MS,
  );
  if (!isRecord(result) || typeof result['compacted'] !== 'boolean') {
    throw new Error('The AGI CLI did not say whether it summarized the session.');
  }
  return result as unknown as ThreadCompactResponse;
}

function turnInput(text: string, images: readonly string[] = []): unknown[] {
  return [
    ...(text === '' ? [] : [{ type: 'text', text, text_elements: [] }]),
    ...images.map((image) => ({ type: 'image', image_url: image })),
  ];
}

export function startDeveloperTurn(input: DeveloperTurnRequest): Promise<{ turnId: string }> {
  return sendTurn(input, () => input.agentMode ?? DEVELOPER_UNNAMED_TURN_AGENT_MODE);
}

async function sendTurn(
  input: DeveloperTurnRequest,
  agentModeFor: (server: RunningServer) => DeveloperAgentMode | null,
  stillAuthorized?: () => boolean,
): Promise<{ turnId: string }> {
  const root = await resolveRoot(input.rootId);
  const server = await readyServer(root);
  await queueAccountSync(server);
  if (!hasSshEnvironment(root.id) && !mayRunIn(root))
    throw new DeveloperAgentNotAllowedError(
      `Coding sessions are not allowed in ${root.name} right now. Start a session in that folder to allow them.`,
    );
  const agentMode = agentModeFor(server);
  if (stillAuthorized && !stillAuthorized())
    throw new Error('The routine grant changed before its turn could start.');
  const result = await request(server, 'turn/start', {
    threadId: input.threadId,
    input: turnInput(input.text, input.images),
    cwd: root.path,
    ...(input.model ? { model: input.model } : {}),
    ...(agentMode ? { agentMode } : {}),
    ...(input.maxTurns ? { maxTurns: input.maxTurns } : {}),
    ...(input.reasoningEffort
      ? {
          reasoningEffort: nearestDeveloperEffort(
            input.reasoningEffort,
            developerEffortLadder(server.advertised?.reasoningEffortLadder === true),
          ),
        }
      : {}),
    ...(input.contextFiles && input.contextFiles.length > 0
      ? { contextFiles: input.contextFiles }
      : {}),
  });
  const turn = isRecord(result) ? result['turn'] : null;
  const turnId = isRecord(turn) ? readString(turn, 'id') : null;
  if (!turnId) throw new Error('The AGI CLI started no turn.');
  return { turnId };
}

/**
 * Start a turn for a paired phone. It goes around the dispatcher, where the
 * person at this computer confirms Bypass permissions, so it never names that
 * posture. A turn that names none is left to the CLI, which runs it in the
 * mode the thread was last saved in and never in bypass; a CLI that would
 * instead carry on in whatever its last turn used is told to ask.
 */
export function startRemoteDeveloperTurn(input: DeveloperTurnRequest): Promise<{ turnId: string }> {
  return sendTurn(
    input,
    (server) =>
      remoteTurnAgentMode(input.agentMode) ??
      (server.advertised?.bypassPerTurn ? null : DEVELOPER_UNNAMED_TURN_AGENT_MODE),
  );
}

export function startUnattendedDeveloperTurn(
  input: DeveloperTurnRequest,
  stillAuthorized: () => boolean,
): Promise<{ turnId: string }> {
  return sendTurn(input, () => 'ask', stillAuthorized);
}

export async function steerDeveloperTurn(input: DeveloperTurnSteer): Promise<{ turnId: string }> {
  const root = await resolveRoot(input.rootId);
  const server = await readyServer(root);
  const result = await request(server, 'turn/steer', {
    threadId: input.threadId,
    input: turnInput(input.text, input.images),
    expectedTurnId: input.turnId,
  });
  const turn = isRecord(result) ? result['turn'] : null;
  const turnId = isRecord(turn) ? readString(turn, 'id') : null;
  if (!turnId) throw new Error('The AGI CLI did not take that message into the running turn.');
  return { turnId };
}

function isSkillSummary(value: unknown): value is SkillSummary {
  return (
    isRecord(value) &&
    typeof value['name'] === 'string' &&
    typeof value['description'] === 'string' &&
    typeof value['enabled'] === 'boolean' &&
    typeof value['consented'] === 'boolean'
  );
}

function isPluginSummary(value: unknown): value is PluginSummary {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['enabled'] === 'boolean'
  );
}

export async function listDeveloperSkills(rootId: string): Promise<SkillListResponse> {
  const server = await readyServer(await resolveRoot(rootId));
  const result = await request(server, 'skills/list', {});
  const skills = isRecord(result) ? result['skills'] : null;
  const projectSkillsDigest = isRecord(result) ? readString(result, 'projectSkillsDigest') : null;
  return {
    skills: Array.isArray(skills) ? skills.filter(isSkillSummary) : [],
    ...(projectSkillsDigest === null ? {} : { projectSkillsDigest }),
  };
}

export async function setDeveloperSkillEnabled(
  rootId: string,
  name: string,
  enabled: boolean,
): Promise<boolean> {
  const server = await readyServer(await resolveRoot(rootId));
  await request(server, 'skills/setEnabled', { name, enabled });
  return enabled;
}

export async function setDeveloperSkillConsent(
  rootId: string,
  granted: boolean,
  digest?: string,
): Promise<boolean> {
  const server = await readyServer(await resolveRoot(rootId));
  const result = await request(
    server,
    'skills/consent',
    granted && digest !== undefined ? { granted, digest } : { granted },
  );
  return isRecord(result) && result['consented'] === true;
}

export async function listDeveloperPlugins(rootId: string): Promise<PluginSummary[]> {
  const server = await readyServer(await resolveRoot(rootId));
  const result = await request(server, 'plugins/list', {});
  const plugins = isRecord(result) ? result['plugins'] : null;
  return Array.isArray(plugins) ? plugins.filter(isPluginSummary) : [];
}

export async function setDeveloperPluginEnabled(
  rootId: string,
  id: string,
  enabled: boolean,
): Promise<boolean> {
  const server = await readyServer(await resolveRoot(rootId));
  await request(server, 'plugins/setEnabled', { id, enabled });
  return enabled;
}

const MEMORY_SCOPES: readonly MemoryScope[] = ['user', 'project', 'local'];

export async function addDeveloperMemory(
  rootId: string,
  text: string,
  scope: MemoryScope,
): Promise<MemoryAddResponse> {
  const server = await readyServer(await resolveRoot(rootId));
  const result = await request(server, 'memory/add', { text, scope });
  const saved = isRecord(result) ? result : null;
  const savedScope = saved ? readString(saved, 'scope') : null;
  const path = saved ? readString(saved, 'path') : null;
  if (!path || !MEMORY_SCOPES.some((candidate) => candidate === savedScope)) {
    throw new Error('The AGI CLI did not say where it saved the memory.');
  }
  return { scope: savedScope as MemoryScope, path };
}

export async function interruptOwnedDeveloperTurn(
  rootId: string,
  threadId: string,
  turnId: string,
): Promise<void> {
  const server = servers.get(rootId);
  if (!server || server.closed) return;
  await request(server, 'turn/interrupt', { threadId, turnId });
}

export async function interruptDeveloperTurn(
  rootId: string,
  threadId: string,
  turnId: string,
): Promise<boolean> {
  const root = await resolveRoot(rootId);
  const server = await readyServer(root);
  await request(server, 'turn/interrupt', { threadId, turnId });
  return true;
}

/**
 * A pending approval as the CLI holds it, with its risk rating and the command
 * rule it proposes, read from the CLI rather than the page so what main shows
 * and grants is the request that will be answered. Null when the approval is
 * gone.
 */
export async function readPendingApproval(
  pending: Pick<DeveloperApprovalAnswer, 'rootId' | 'threadId' | 'turnId' | 'requestId'>,
): Promise<PendingApprovalReview | null> {
  const root = await resolveRoot(pending.rootId);
  const server = await readyServer(root);
  const reconnect = await requestOrNull(server, 'thread/reconnect', { threadId: pending.threadId });
  const active = isRecord(reconnect) ? reconnect['activeTurn'] : null;
  if (!isRecord(active) || readString(active, 'turnId') !== pending.turnId) return null;
  const approvals = Array.isArray(active['pendingApprovals']) ? active['pendingApprovals'] : [];
  const approval = approvals.find(
    (entry: unknown) => isRecord(entry) && readString(entry, 'requestId') === pending.requestId,
  );
  const request = isRecord(approval) ? toApprovalRequest(approval) : null;
  if (!request || !isRecord(approval)) return null;
  return {
    request,
    reserved: await approvalReservations(
      root,
      readString(approval, 'kind') ?? '',
      async () => (await readGitState(root.path))?.remotes ?? null,
    ),
  };
}

export async function answerDeveloperApproval(answer: DeveloperApprovalAnswer): Promise<boolean> {
  const root = await resolveRoot(answer.rootId);
  const decision = developerReviewDecision(answer);
  const server = await readyServer(root);
  await request(server, 'approval/respond', {
    threadId: answer.threadId,
    turnId: answer.turnId,
    requestId: answer.requestId,
    decision,
    ...(answer.note ? { note: answer.note } : {}),
  });
  emit(answer.rootId, {
    type: 'approval-answered',
    threadId: answer.threadId,
    turnId: answer.turnId,
    requestId: answer.requestId,
    decision: answer.decision,
    approved: developerApprovalAllows(answer.decision),
  });
  if (answer.decision === 'deny_and_stop') {
    await request(server, 'turn/interrupt', { threadId: answer.threadId, turnId: answer.turnId });
  }
  return true;
}

export async function answerDeveloperUserInput(answer: DeveloperUserInputAnswer): Promise<boolean> {
  const root = await resolveRoot(answer.rootId);
  const server = await readyServer(root);
  await request(server, 'userInput/respond', {
    threadId: answer.threadId,
    turnId: answer.turnId,
    requestId: answer.requestId,
    answer: answer.answer,
  });
  emit(answer.rootId, {
    type: 'user-input-answered',
    threadId: answer.threadId,
    turnId: answer.turnId,
    requestId: answer.requestId,
    cancelled: answer.answer === null,
  });
  return true;
}

function terminate(server: RunningServer): void {
  closeServer(server, new Error('The AGI CLI was stopped by this app.'));
}

export function stopDeveloperRuntime(rootId: string): void {
  const pending = serverLaunches.get(rootId);
  if (pending) pending.cancelled = true;
  const server = servers.get(rootId);
  if (server) terminate(server);
}

export function stopAllDeveloperRuntimes(): void {
  for (const pending of serverLaunches.values()) pending.cancelled = true;
  for (const server of [...servers.values()]) terminate(server);
}

/**
 * For the moment the app quits. The grace an ordinary stop gives the CLI is a
 * timer, and no timer fires once the app is gone, so every process still
 * running or still shutting down is killed here, before the quit returns.
 */
export function killAllDeveloperRuntimes(): void {
  stopAllDeveloperRuntimes();
  for (const server of [...stopping]) killProcess(server);
}

/**
 * The repository's setup script as the folder's own CLI reports it, and the
 * name of the worktree a `rootId` addresses. Null when either is gone.
 */
export async function readWorktreeSetupScript(
  rootId: string,
): Promise<{ path: string; worktree: string } | null> {
  const { parent, worktreeId } = requireWorktree(rootId);
  const listed = await listWorktrees(parent);
  const found = listed.worktrees.find(({ worktree }) => worktree.id === worktreeId)?.worktree;
  if (!found?.setupScript) return null;
  return { path: found.setupScript.path, worktree: worktreeName(parent, found) };
}
