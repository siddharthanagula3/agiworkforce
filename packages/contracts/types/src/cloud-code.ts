import type { AgentTaskState } from './generated/protocol/AgentTaskState';
import { TOOL_APPROVAL_ACTION_LABELS } from './tool-approval-policy';

export const CLOUD_CODE_NETWORK_ACCESS = ['none', 'trusted', 'full'] as const;
export type CloudCodeNetworkAccess = (typeof CLOUD_CODE_NETWORK_ACCESS)[number];

export const CLOUD_CODE_LIMITS = {
  title: 120,
  task: 8000,
} as const;

/**
 * The verified E2B code-interpreter image the notebook surface runs cells on.
 * Shared by the (server-only) template catalogue and the client notebook UI,
 * so the id is declared once here rather than duplicated across the boundary.
 */
export const NOTEBOOK_TEMPLATE_ID = 'code-interpreter-v1';

export const CLOUD_CODE_SESSION_STATES = [
  'provisioning',
  'ready',
  'running',
  'failed',
  'closed',
] as const;
export type CloudCodeSessionState = (typeof CLOUD_CODE_SESSION_STATES)[number];

export const CLOUD_CODE_SESSION_STATE_LABELS: Readonly<Record<CloudCodeSessionState, string>> =
  Object.freeze({
    ready: 'Ready',
    running: 'Running a command',
    provisioning: 'Provisioning',
    failed: 'Needs attention',
    closed: 'Closed',
  });

/**
 * A sandbox image the account may build in. Sourced from the E2B team's own
 * template list rather than a hardcoded set, so a template added or rebuilt in
 * the E2B console is offered here without a release.
 */
export interface CloudCodeRuntime {
  id: string;
  name: string;
  /**
   * `harness` ships a coding agent's CLI already installed; `image` is a plain
   * environment the reader drives themselves.
   */
  kind: 'harness' | 'image';
  /** One line on what is in it. */
  summary: string;
  /** Command that starts the agent, for a harness. */
  agentCommand: string | null;
  cpuCount: number;
  memoryMB: number;
  diskSizeMB: number;
  /** Public E2B templates as opposed to the team's own. */
  isPublic: boolean;
  /**
   * True when this harness's provider has no managed credential configured,
   * so a session needs the caller's own key or a different harness.
   */
  needsUserCredential?: boolean;
  runsOwnAgent?: boolean;
}

export interface CloudCodeSession {
  id: string;
  title: string;
  repositoryUrl: string | null;
  /** Git ref cloned into the workspace. Null means the repository's default. */
  repositoryBranch: string | null;
  networkAccess: CloudCodeNetworkAccess;
  /** Null for sessions created before the runtime was selectable. */
  runtimeId: string | null;
  /** Extra hostnames allowlisted on top of networkAccess. Empty for most sessions. */
  extraHosts: string[];
  state: CloudCodeSessionState;
  workspacePath: string;
  /** The branch this session works on and pushes. Null with no repository. */
  workingBranch: string | null;
  /**
   * The branch the clone checked out, which the work is measured against.
   * Resolved at provisioning rather than guessed, and null when there is no
   * repository or the session predates it being recorded.
   */
  baseBranch: string | null;
  /** The pull request opened from the working branch, once one exists. */
  pullRequestUrl: string | null;
  pullRequestNumber: number | null;
  /** Set while the session is archived: listed, reversible, refuses work. */
  archivedAt: string | null;
  /** Tokens every turn of this session has reported, for the context reading. */
  contextInputTokens: number;
  contextOutputTokens: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export function cloudCodeSessionIsBusy(session: Pick<CloudCodeSession, 'state'>): boolean {
  return session.state === 'running' || session.state === 'provisioning';
}

export function cloudCodeRepositoryLabel(repositoryUrl: string): string {
  const trimmed = repositoryUrl.replace(/\.git$/, '').replace(/\/$/, '');
  const parts = trimmed.split('/').filter(Boolean);
  return parts.slice(-2).join('/') || trimmed;
}

export function cloudCodePullRequestLabel(
  session: Pick<CloudCodeSession, 'pullRequestNumber'>,
): string | null {
  return session.pullRequestNumber === null ? null : `Pull request #${session.pullRequestNumber}`;
}

export interface CloudCodeTerminalEntry {
  id: string;
  sessionId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  startedAt: string;
  completedAt: string;
}

export const CLOUD_CODE_AGENT_STOP_REASONS = [
  'done',
  'max_steps',
  'timeout',
  'cancelled',
  'error',
  'denied',
  'awaiting_approval',
] as const;
export type CloudCodeAgentStopReason = (typeof CLOUD_CODE_AGENT_STOP_REASONS)[number];

export const CLOUD_CODE_STOP_REASON_AGENT_TASK_STATES: Readonly<
  Record<CloudCodeAgentStopReason, AgentTaskState>
> = Object.freeze({
  done: 'ready_for_review',
  max_steps: 'partial',
  timeout: 'timed_out',
  cancelled: 'cancelled',
  error: 'failed',
  denied: 'failed',
  awaiting_approval: 'awaiting_approval',
});

export function agentTaskStateForStopReason(reason: CloudCodeAgentStopReason): AgentTaskState {
  return CLOUD_CODE_STOP_REASON_AGENT_TASK_STATES[reason];
}

export const CLOUD_CODE_STOP_REASON_LABELS: Readonly<Record<CloudCodeAgentStopReason, string>> =
  Object.freeze({
    done: 'Finished',
    awaiting_approval: 'Waiting for your approval',
    max_steps: 'Stopped at the step limit',
    timeout: 'Timed out',
    cancelled: 'Cancelled',
    denied: 'Stopped, a command was denied',
    error: 'Failed',
  });

export function cloudCodeStopReasonIsFailure(reason: CloudCodeAgentStopReason): boolean {
  return reason === 'error' || reason === 'denied' || reason === 'timeout';
}

export function cloudCodeStopReasonIsRetryable(reason: CloudCodeAgentStopReason): boolean {
  return cloudCodeStopReasonIsFailure(reason) || reason === 'cancelled';
}

export const CLOUD_CODE_SESSION_COPY = Object.freeze({
  composerPlaceholder: 'Describe a task or ask a question',
  runningPlaceholder: 'The agent is working. Your next task can wait here.',
  stopTurn: 'Stop the task',
  stoppingTurn: 'Stopping the task',
  approvalHeading: 'Approval required',
  approve: `${TOOL_APPROVAL_ACTION_LABELS.approve} and continue`,
  reject: TOOL_APPROVAL_ACTION_LABELS.deny,
  agentWorking: 'Working',
  unarchiveSession: 'Unarchive',
  archivedBanner: 'This session is archived. Unarchive it to keep working in this session.',
});

export function cloudCodeCommandRanLabel(count: number): string {
  return count === 1 ? 'Ran a command' : `Ran ${count} commands`;
}

/**
 * The function limit of the two routes that run an agent turn, the start and
 * the approval that resumes one. Each holds its request open until the turn
 * stops or pauses, so a client waiting on either must allow at least this
 * long. The routes declare it as the literal `maxDuration = 300`, which
 * Next.js cannot take from an import, and are kept in step by hand.
 */
export const CLOUD_CODE_AGENT_TURN_REQUEST_LIMIT_MS = 300_000;

/**
 * One tool the agent ran, as the transcript shows it. `label` is the line the
 * reader recognises: the shell command for a command tool, the tool and its
 * target for a file tool, and null when neither applies, where the transcript
 * falls back to `toolName`.
 */
export interface CloudCodeAgentStep {
  index: number;
  toolName: string;
  label: string | null;
  output: string;
  isError: boolean;
}

/**
 * A finished or in-flight agent turn. The Code surface rebuilds its transcript
 * from these on reopen, so every field the transcript renders lives here rather
 * than only in the response to the request that started the turn.
 */
export interface CloudCodeAgentTurnRecord {
  turnId: string;
  goal: string;
  stopReason: CloudCodeAgentStopReason | null;
  stepsUsed: number;
  /** Tokens this turn reported, summed from what each step's provider call returned. */
  inputTokens: number;
  outputTokens: number;
  /**
   * When the reader asked this turn to stop. A stopped turn and a turn whose
   * connection dropped both end as `cancelled`, and this is what tells them
   * apart: null means nobody asked, so the turn ended for a reason the reader
   * did not choose.
   */
  cancelRequestedAt: string | null;
  finalMessage: string;
  errorMessage: string | null;
  createdAt: string;
  steps: CloudCodeAgentStep[];
}

export const CLOUD_CODE_TURN_STEP_BOUNDS = [12, 24, 48] as const;
export type CloudCodeTurnStepBound = (typeof CLOUD_CODE_TURN_STEP_BOUNDS)[number];
export const CLOUD_CODE_DEFAULT_TURN_STEPS: CloudCodeTurnStepBound = 24;

export function isCloudCodeTurnStepBound(value: unknown): value is CloudCodeTurnStepBound {
  return (CLOUD_CODE_TURN_STEP_BOUNDS as readonly unknown[]).includes(value);
}

export const CLOUD_CODE_PAGE_ROUTE = '/code';

export function cloudCodeSessionPagePath(sessionId: string): string {
  return `${CLOUD_CODE_PAGE_ROUTE}/${encodeURIComponent(sessionId)}`;
}

export const CLOUD_CODE_GOAL_COMMANDS = ['/review', '/security-review'] as const;
export type CloudCodeGoalCommand = (typeof CLOUD_CODE_GOAL_COMMANDS)[number];

export const CLOUD_CODE_CHANGE_STATES = [
  'added',
  'modified',
  'deleted',
  'renamed',
  'untracked',
  'conflicted',
] as const;
export type CloudCodeChangeState = (typeof CLOUD_CODE_CHANGE_STATES)[number];

export interface CloudCodeChangedFile {
  path: string;
  state: CloudCodeChangeState;
}

/**
 * What the Changes panel draws. `base` is the branch name the diff was taken
 * against, as a reader would say it, and null when the sandbox could only
 * compare against its own last commit, which the panel says rather than
 * implying a comparison it did not make. Untracked files appear in `files` and
 * not in `diff`, because reading the changes must not stage anything.
 */
export interface CloudCodeSessionChanges {
  session: CloudCodeSession;
  base: string | null;
  workingBranch: string | null;
  files: CloudCodeChangedFile[];
  diff: string;
  diffTruncated: boolean;
}

export interface CloudCodePullRequestResponse {
  session: CloudCodeSession;
  url: string;
  number: number;
  /** True when the pull request already existed and nothing new was opened. */
  alreadyOpen: boolean;
}

/**
 * The Recents filter. `open` is everything a reader can still work in, `closed`
 * and `archived` are the two ways a session leaves that set, and they are
 * separate because closing is final and archiving is not.
 */
export const CLOUD_CODE_SESSION_STATUS_FILTERS = ['open', 'closed', 'archived', 'all'] as const;
export type CloudCodeSessionStatusFilter = (typeof CLOUD_CODE_SESSION_STATUS_FILTERS)[number];

export const CLOUD_CODE_SESSION_STATUS_FILTER_LABELS: Readonly<
  Record<CloudCodeSessionStatusFilter, string>
> = Object.freeze({
  open: 'Open',
  closed: 'Closed',
  archived: 'Archived',
  all: 'All',
});

export interface CloudCodeAvailability {
  deploymentEnabled: boolean;
  storageReady: boolean;
  planEntitled: boolean;
  planTier: string;
  maxSessions: number;
}

export interface CloudCodeSessionListResponse {
  availability: CloudCodeAvailability;
  sessions: CloudCodeSession[];
  /** Empty when the catalogue cannot be read; the default image is used then. */
  runtimes: CloudCodeRuntime[];
}

/**
 * A repository chosen from a connected GitHub installation, as an alternative
 * to a raw URL. The installation is what makes a private repository reachable,
 * so it travels with the name rather than being guessed from the owner.
 */
export interface CloudCodeRepositoryReference {
  installationId: number;
  /** `owner/repository`, exactly as the installation reported it. */
  fullName: string;
  /** Null or absent means the repository's own default branch. */
  branch?: string | null;
}

export interface CreateCloudCodeSessionInput {
  requestId: string;
  title: string;
  repositoryUrl?: string | null;
  repositoryBranch?: string | null;
  /** Wins over repositoryUrl when both name the same repository. */
  repository?: CloudCodeRepositoryReference | null;
  networkAccess: CloudCodeNetworkAccess;
  fullNetworkAcknowledged?: boolean;
  /** Must match a catalogue entry; omitted means the default image. */
  runtimeId?: string | null;
  /** Extra hostnames allowed on top of networkAccess, at most a named maximum. */
  extraHosts?: string[];
  /**
   * Caller-supplied provider credential for a harness with no managed key
   * for its provider. Wins over managed resolution when present.
   */
  harnessCredential?: string | null;
}

export interface CreateCloudCodeSessionResponse {
  session: CloudCodeSession;
  terminalEntries: CloudCodeTerminalEntry[];
}

export interface RunCloudCodeCommandInput {
  command: string;
}

export interface RunCloudCodeCommandResponse {
  session: CloudCodeSession;
  terminalEntry: CloudCodeTerminalEntry;
}

/** Mirrors `@e2b/code-interpreter`'s `RunCodeLanguage` union. */
export const NOTEBOOK_CELL_LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'r',
  'java',
  'bash',
] as const;
export type NotebookCellLanguage = (typeof NOTEBOOK_CELL_LANGUAGES)[number];

/**
 * One piece of a cell's ordered output. `stream` is stdout/stderr text,
 * `image` and `html` are a result's richest available representation (a
 * plot's PNG, a DataFrame's HTML table), and `error` is the interpreter
 * traceback. Order matches the order the sandbox produced them in.
 */
export const NOTEBOOK_CELL_OUTPUT_KINDS = ['stream', 'html', 'image', 'error'] as const;
export type NotebookCellOutputKind = (typeof NOTEBOOK_CELL_OUTPUT_KINDS)[number];

export interface NotebookCellOutput {
  kind: NotebookCellOutputKind;
  /** Text for `stream`/`error`, markup for `html`, a base64 PNG for `image`. */
  data: string;
}

export interface RunCloudCodeNotebookCellInput {
  code: string;
  language: NotebookCellLanguage;
}

export interface RunCloudCodeNotebookCellResponse {
  session: CloudCodeSession;
  ok: boolean;
  outputs: NotebookCellOutput[];
  error?: string;
}

export interface CloudCodeNotebookFile {
  path: string;
  name: string;
  isDir: boolean;
  byteSize: number;
}

export interface ListCloudCodeNotebookFilesResponse {
  session: CloudCodeSession;
  files: CloudCodeNotebookFile[];
}

export interface UploadCloudCodeNotebookFileResponse {
  session: CloudCodeSession;
  file: CloudCodeNotebookFile;
}
