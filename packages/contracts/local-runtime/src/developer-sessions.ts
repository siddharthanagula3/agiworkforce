import type {
  AgentEventApprovalRiskLevel,
  CheckpointSection,
  DeveloperAgentMode,
  DeveloperMessage,
  DeveloperChildTask,
  DeveloperReasoningEffort,
  DeveloperSessionSource,
  DeveloperSessionTrustMode,
  McpServerScope,
  ReviewDecision,
  ThreadRevertRestore,
  ThreadStatus,
  TurnFailureAction,
  TurnFailureCode,
  WorktreeCleanupFailure,
  WorktreeSetupStream,
  WorktreeStartPoint,
} from '@agiworkforce/types/protocol';
import type { MessageKind } from '@agiworkforce/types';

export const DEVELOPER_SESSION_MAX_FRAME_BYTES = 4 * 1024 * 1024;

export const DEVELOPER_SESSION_COMMANDS = [
  'developer_runtime_status',
  'developer_model_list',
  'developer_session_list',
  'developer_session_read',
  'developer_sessions_allow',
  'developer_session_start',
  'developer_turn_start',
  'developer_turn_steer',
  'developer_turn_interrupt',
  'developer_approval_answer',
  'developer_session_changes',
  'developer_session_discard',
  'developer_skills_list',
  'developer_skill_set_enabled',
  'developer_skill_consent',
  'developer_plugins_list',
  'developer_plugin_set_enabled',
  'developer_branches_list',
  'developer_branch_switch',
  'developer_branch_push',
  'developer_memory_add',
  'developer_user_input_answer',
  'developer_worktree_delete',
  'developer_worktree_pin',
  'developer_worktree_keep',
  'developer_worktree_apply',
  'developer_worktree_setup_run',
  'developer_checkpoint_list',
  'developer_checkpoint_diff',
  'developer_checkpoint_revert',
  'developer_checkpoint_stage',
  'developer_thread_revert',
  'developer_thread_delete',
  'developer_thread_fork',
  'developer_thread_compact',
  'developer_thread_archive',
  'developer_thread_takeover',
  'developer_mcp_approval_review',
  'developer_account_report',
] as const;

export type DeveloperSessionCommand = (typeof DEVELOPER_SESSION_COMMANDS)[number];

export function isDeveloperSessionCommand(value: string): value is DeveloperSessionCommand {
  return (DEVELOPER_SESSION_COMMANDS as readonly string[]).includes(value);
}

/**
 * Which surface opened a session, as the CLI recorded it from the client name
 * given at `initialize`. This shell calls itself `agi-desktop`, which is what
 * makes its own sessions say `desktop`.
 */
export const DEVELOPER_SESSION_ORIGIN_LABELS: Record<DeveloperSessionSource, string> = {
  cli: 'CLI',
  vscode: 'VS Code',
  desktop: 'Desktop',
  unknown: 'Another surface',
};

export const DEVELOPER_SESSION_TRUST_LABELS: Record<DeveloperSessionTrustMode, string> = {
  local: 'Local',
  byok: 'Your key',
  managed: 'Managed',
  unknown: 'Unverified',
};

export interface LocalDeveloperSession {
  id: string;
  rootId: string;
  title: string;
  cwd: string;
  model: string | null;
  provider: string | null;
  trustMode: DeveloperSessionTrustMode;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  origin: DeveloperSessionSource;
  location?: 'cloud';
  environment?: 'local' | 'worktree' | 'ssh';
}

/**
 * Why a turn ended without completing, as the CLI classified it.
 *
 * `code` and `action` are the closed sets a surface may branch on; `message` is
 * the CLI's own line, which reads for a terminal and is shown only where this
 * surface has nothing better to say.
 */
export interface DeveloperTurnFailure {
  code: TurnFailureCode;
  message: string;
  provider: string | null;
  action: TurnFailureAction;
  retryable: boolean;
}

/**
 * Why one approved folder contributed no sessions. `hint` is the sentence the
 * surface renders verbatim, so the shell decides what the user should do about
 * a runtime it could not start rather than the page guessing from a code.
 */
export interface DeveloperRuntimeUnavailable {
  message: string;
  hint: string;
}

/**
 * A project server needs approval only when the project's own files name it:
 * its MCP file or one of its plugins. A server the user configured for
 * themselves is theirs already.
 */
export type DeveloperMcpApprovalScope = Exclude<McpServerScope, 'user'>;

/**
 * An MCP server a folder's own files name whose launch the user has not
 * approved for that folder, so the CLI does not start it. The page is told
 * only that it is waiting: what it would run is shown, and answered, in the
 * shell's own dialog, which `developer_mcp_approval_review` opens.
 */
export interface DeveloperMcpServerAwaitingApproval {
  name: string;
  scope: DeveloperMcpApprovalScope;
}

/**
 * How a review ended. `approved` and `declined` are the user's answer in the
 * shell's dialog. `refused` is the CLI declining to ask or to record it, with
 * its own reason in `message`: the server is already approved, is no longer
 * declared, or could not start even if approved.
 */
export interface DeveloperMcpApprovalReview {
  outcome: 'approved' | 'declined' | 'refused';
  message?: string;
}

export interface DeveloperSessionGroup {
  rootId: string;
  name: string;
  path: string;
  branch: string | null;
  /**
   * Why a folder inside a repository has no git state: a user-facing clause,
   * never a raw error, such as "its repository settings run programs
   * (filter.lfs.clean in .git/config)". Absent from shells that predate it.
   */
  gitUnavailableReason?: string;
  sessions: LocalDeveloperSession[];
  /**
   * Set when the folder's sessions were left out because the agent is not
   * allowed to run in it yet, which is what reads them. `developer_sessions_allow`
   * asks the user for that; a list read after it is granted carries them.
   */
  sessionsWithheld?: true;
  /**
   * The project servers waiting for the user's approval before the CLI will
   * start them here. Absent when there are none, and from a shell or a CLI
   * that cannot ask.
   */
  mcpAwaitingApproval?: DeveloperMcpServerAwaitingApproval[];
  unavailable?: DeveloperRuntimeUnavailable;
  /** Set when the group is a worktree of an approved folder rather than the folder itself. */
  worktree?: DeveloperWorktree;
}

/**
 * The coding-session features a shell's dispatcher handles. The page is
 * deployed before installed shells update, so it offers a feature only when
 * the shell says it has it; an older shell would ignore the option or answer
 * with an unknown command.
 */
export const DEVELOPER_RUNTIME_CAPABILITIES = [
  'worktrees',
  'checkpoints',
  'agent_mode',
  'reasoning_effort',
  'context_files',
  'steer',
  'user_input',
  'review',
  'approval_decisions',
  'thread_delete',
  'images',
  'thread_fork',
  'thread_compact',
  'rewind_choice',
  'thread_archive',
  'thread_takeover',
] as const;

export type DeveloperRuntimeCapability = (typeof DEVELOPER_RUNTIME_CAPABILITIES)[number];

/**
 * What the page in a window can do, sent with a session read or a new turn.
 * The shell is installed before the page it loads is replaced, so a page that
 * sends nothing is taken to have none of them: a question the agent asks is
 * cancelled at once rather than left waiting on a page that cannot show it.
 */
export const DEVELOPER_CLIENT_CAPABILITIES = ['user_input'] as const;

export type DeveloperClientCapability = (typeof DEVELOPER_CLIENT_CAPABILITIES)[number];

/**
 * What the shell found when it resolved the AGI CLI, as the settings row
 * prints it. `path` is display form with the home directory collapsed, because
 * the page cannot know where home is.
 */
export interface DeveloperRuntimeStatus {
  available: boolean;
  name: string;
  version: string | null;
  path: string | null;
  hint: string | null;
  /**
   * Where the binary came from: the path the user confirmed under Settings,
   * the copy bundled with the app, or `agi` on the PATH.
   */
  source?: 'bundled' | 'custom' | 'path';
  /**
   * Why the shell could not make the CLI this account, or null when it had no
   * reason to try. The picker keeps whatever the CLI already reported, so this
   * row is the only place the attempt is visible.
   */
  accountSyncError: string | null;
  /**
   * What the CLI this shell runs said it serves. Empty until one has answered
   * `initialize`, and absent from shells that predate it, which have none of
   * the features.
   */
  capabilities?: string[];
}

/** What the page says when a shell answers a coding-session command it does not have. */
export const DEVELOPER_COMMAND_NEEDS_UPDATE =
  'This needs a newer version of AGI Cloud. Update the app, then try again.';

export function developerRuntimeCapabilities(
  status: Pick<DeveloperRuntimeStatus, 'capabilities'>,
): ReadonlySet<DeveloperRuntimeCapability> {
  const reported = new Set(status.capabilities ?? []);
  return new Set(DEVELOPER_RUNTIME_CAPABILITIES.filter((capability) => reported.has(capability)));
}

/**
 * A model the CLI reported for one folder. `local` marks a model installed on
 * this Mac that the CLI says is ready now; everything else is a route the CLI
 * would have to reach over the network.
 */
export interface DeveloperModelOption {
  id: string;
  provider: string;
  local: boolean;
}

/** Why a model cannot run here, in the words a failed turn would use. */
export interface DeveloperModelUnreachable {
  code: TurnFailureCode;
  action: TurnFailureAction;
  provider: string | null;
}

/** What the host says about one model it knows, reachable models first. */
export interface DeveloperHostModel {
  id: string;
  provider: string;
  reachable: boolean;
  trustMode: DeveloperSessionTrustMode;
  unreachable: DeveloperModelUnreachable | null;
}

/**
 * What the CLI can run in one folder. `hostModels` is empty against a CLI that
 * predates it, and a caller falls back to `models` there.
 */
export interface DeveloperRuntimeFeatures {
  maxTurns: boolean;
  memory: boolean;
}

export interface DeveloperRuntimeModels {
  models: DeveloperModelOption[];
  hostModels: DeveloperHostModel[];
  defaultModelId: string | null;
  /** The posture the CLI applies when a turn names none. Never `bypass`. */
  defaultAgentMode: DeveloperAgentMode | null;
  defaultReasoningEffort: DeveloperReasoningEffort | null;
  managedSignedIn: boolean;
  features?: DeveloperRuntimeFeatures;
}

export interface DeveloperSessionList {
  groups: DeveloperSessionGroup[];
}

export interface DeveloperSessionTranscript {
  childTasks?: DeveloperChildTask[];
  session: LocalDeveloperSession;
  messages: DeveloperMessage[];
  truncated: boolean;
  /** The turn running when the session was read, so a page opened mid-turn can answer it. */
  activeTurn: DeveloperActiveTurn | null;
}

export interface DeveloperActiveTurn {
  turnId: string;
  partialResponse: string;
  nextDeltaIndex?: number;
  nextEventSequence?: number;
  approvals: DeveloperApprovalRequest[];
  questions: DeveloperUserInputRequest[];
}

export const DEVELOPER_TURN_OUTCOMES = ['completed', 'failed', 'interrupted'] as const;

export type DeveloperTurnOutcome = (typeof DEVELOPER_TURN_OUTCOMES)[number];

export const DEVELOPER_FILE_CHANGES = ['created', 'modified', 'deleted'] as const;

export type DeveloperFileChange = (typeof DEVELOPER_FILE_CHANGES)[number];

export const DEVELOPER_FILE_CHANGE_LABELS: Record<DeveloperFileChange, string> = {
  created: 'Created',
  modified: 'Edited',
  deleted: 'Deleted',
};

type DeveloperSessionEventBody =
  | { type: 'turn-started'; threadId: string; turnId: string }
  | { type: 'output-delta'; threadId: string; turnId: string; delta: string; index?: number }
  | {
      type: 'turn-finished';
      threadId: string;
      turnId: string;
      outcome: DeveloperTurnOutcome;
      response: string;
      failure: DeveloperTurnFailure | null;
      inputTokens: number;
      outputTokens: number;
      /** Follow-ups steered into the turn that it ended before reading, the newest last. */
      unsentSteers?: number;
    }
  | {
      type: 'tool-queued';
      threadId: string;
      turnId: string;
      toolCallId: string;
      name: string;
      position: number;
      queueDepth: number;
    }
  | {
      type: 'tool-started';
      threadId: string;
      turnId: string;
      toolCallId: string;
      name: string;
      summary: string;
    }
  | {
      type: 'command-started';
      threadId: string;
      turnId: string;
      toolCallId: string;
      command: string;
      cwd: string | null;
    }
  | {
      type: 'file-changed';
      threadId: string;
      turnId: string;
      toolCallId: string;
      path: string;
      change: DeveloperFileChange;
    }
  | {
      type: 'turn-diff';
      threadId: string;
      turnId: string;
      unifiedDiff: string;
      paths: string[];
    }
  | {
      type: 'tool-finished';
      threadId: string;
      turnId: string;
      toolCallId: string;
      name: string;
      output: string;
      isError: boolean;
    }
  | ({
      type: 'approval-requested';
      threadId: string;
      turnId: string;
    } & DeveloperApprovalRequest)
  | {
      type: 'approval-answered';
      threadId: string;
      turnId: string;
      requestId: string;
      decision: DeveloperApprovalDecision;
      /** Whether the call was allowed to run, for a reader that needs no more. */
      approved: boolean;
    }
  | ({
      type: 'user-input-requested';
      threadId: string;
      turnId: string;
    } & DeveloperUserInputRequest)
  | {
      type: 'user-input-answered';
      threadId: string;
      turnId: string;
      requestId: string;
      cancelled: boolean;
    }
  | { type: 'turn-steered'; threadId: string; turnId: string }
  | {
      type: 'worktree-setup-log';
      threadId: string;
      worktreeId: string;
      stream: WorktreeSetupStream;
      text: string;
    }
  | {
      type: 'worktree-setup-finished';
      threadId: string;
      worktreeId: string;
      exitCode: number | null;
      succeeded: boolean;
    }
  | { type: 'runtime-stopped'; message: string };

export type DeveloperSessionEvent = DeveloperSessionEventBody & { sequence?: number };

export const DEVELOPER_SESSION_EVENT_MESSAGE_KINDS = Object.freeze({
  'turn-started': 'status',
  'output-delta': 'text',
  'turn-finished': 'status',
  'tool-queued': 'tool_call',
  'tool-started': 'tool_call',
  'command-started': 'tool_call',
  'file-changed': 'tool_result',
  'turn-diff': 'tool_result',
  'tool-finished': 'tool_result',
  'approval-requested': 'approval',
  'approval-answered': 'approval',
  'user-input-requested': 'approval',
  'user-input-answered': 'approval',
  'turn-steered': 'status',
  'worktree-setup-log': 'text',
  'worktree-setup-finished': 'status',
  'runtime-stopped': 'error',
} as const satisfies Readonly<Record<DeveloperSessionEvent['type'], MessageKind>>);

export function messageKindForDeveloperSessionEvent(
  type: DeveloperSessionEvent['type'],
): MessageKind {
  return DEVELOPER_SESSION_EVENT_MESSAGE_KINDS[type];
}

/**
 * One pending approval as the CLI asked it. `command` is the command line when
 * the request is to run one, and null for every other kind, so a surface never
 * offers a command rule for a file write.
 */
export interface DeveloperApprovalRequest {
  requestId: string;
  kind: string;
  summary: string;
  detail: string;
  command: string | null;
  riskLevel: AgentEventApprovalRiskLevel | null;
  /** Null when the CLI did not say, which is not the same as reversible. */
  reversible: boolean | null;
  /**
   * The command rule the CLI offers for an "always allow" answer, which must
   * send exactly this prefix. Absent, the command can only be approved once or
   * for the session.
   */
  proposedCommandPrefix?: string[];
  /** Present when the agent asks the user to choose, not to allow a step. */
  question?: DeveloperApprovalQuestion;
}

/** A question the agent asked mid-turn, which it waits on until answered or cancelled. */
export interface DeveloperUserInputRequest {
  requestId: string;
  question: string;
}

/** The reader's answer, or `answer: null` to cancel, which the agent reads as no answer. */
export interface DeveloperUserInputAnswer {
  rootId: string;
  threadId: string;
  turnId: string;
  requestId: string;
  answer: string | null;
}

/**
 * Bounds the CLI enforces on one turn's input, mirrored so the shell refuses an
 * oversized turn before it crosses the pipe. `developer_host.rs` owns them.
 */
export const DEVELOPER_TURN_LIMITS = {
  images: 8,
  imageBytes: 10_000_000,
  contextFiles: 64,
} as const;

export interface DeveloperTurnRequest {
  rootId: string;
  threadId: string;
  text: string;
  model?: string;
  agentMode?: DeveloperAgentMode;
  maxTurns?: number;
  reasoningEffort?: DeveloperReasoningEffort;
  /** Files inside the folder, relative to it, that the agent reads before answering. */
  contextFiles?: string[];
  /** `data:image/<type>;base64,` URLs. */
  images?: string[];
  clientCapabilities?: DeveloperClientCapability[];
}

/** Text added to the turn already running, which the agent reads at its next step. */
export interface DeveloperTurnSteer {
  rootId: string;
  threadId: string;
  turnId: string;
  text: string;
  images?: string[];
}

export const DEVELOPER_APPROVAL_DECISIONS = [
  'approve_once',
  'approve_for_session',
  'always_allow_command',
  'deny',
  'deny_and_stop',
] as const;

export type DeveloperApprovalDecision = (typeof DEVELOPER_APPROVAL_DECISIONS)[number];

export function isDeveloperApprovalDecision(value: unknown): value is DeveloperApprovalDecision {
  return (
    typeof value === 'string' && (DEVELOPER_APPROVAL_DECISIONS as readonly string[]).includes(value)
  );
}

export function developerApprovalAllows(decision: DeveloperApprovalDecision): boolean {
  return (
    decision === 'approve_once' ||
    decision === 'approve_for_session' ||
    decision === 'always_allow_command'
  );
}

export const WORKING_TREE_CHANGE_STATES = [
  'added',
  'modified',
  'deleted',
  'renamed',
  'untracked',
  'conflicted',
] as const;
export type WorkingTreeChangeState = (typeof WORKING_TREE_CHANGE_STATES)[number];

export interface WorkingTreeChange {
  path: string;
  state: WorkingTreeChangeState;
  originalPath: string | null;
}

export interface LocalBranchPush {
  branch: string;
  remoteUrl: string;
  baseBranch: string | null;
}

export interface LocalBranches {
  current: string | null;
  branches: string[];
  remoteUrl: string | null;
  baseBranch: string | null;
}

export interface WorkingTreeChanges {
  files: WorkingTreeChange[];
  diff: string;
  diffTruncated: boolean;
  folderPrefix: string;
}

const PORCELAIN_PATH_INDEX = 3;
const PORCELAIN_RENAME_SEPARATOR = ' -> ';
const PORCELAIN_CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

function unquotePorcelainPath(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"') || value.length < 2) return value;
  try {
    return JSON.parse(value) as string;
  } catch {
    return value.slice(1, -1);
  }
}

function porcelainChangeState(codes: string): WorkingTreeChangeState {
  if (codes.startsWith('?')) return 'untracked';
  if (PORCELAIN_CONFLICT_CODES.has(codes)) return 'conflicted';
  const primary = codes.trim().charAt(0);
  if (primary === 'A') return 'added';
  if (primary === 'D') return 'deleted';
  if (primary === 'R' || primary === 'C') return 'renamed';
  return 'modified';
}

export function parseWorkingTreeStatus(output: string): WorkingTreeChange[] {
  const changes: WorkingTreeChange[] = [];
  for (const line of output.split('\n')) {
    if (line.length <= PORCELAIN_PATH_INDEX) continue;
    const rest = line.slice(PORCELAIN_PATH_INDEX);
    const separator = rest.indexOf(PORCELAIN_RENAME_SEPARATOR);
    const path = unquotePorcelainPath(
      (separator >= 0 ? rest.slice(separator + PORCELAIN_RENAME_SEPARATOR.length) : rest).trim(),
    );
    if (!path) continue;
    const originalPath =
      separator >= 0 ? unquotePorcelainPath(rest.slice(0, separator).trim()) || null : null;
    changes.push({ path, state: porcelainChangeState(line.slice(0, 2)), originalPath });
  }
  return changes;
}

export interface DeveloperApprovalQuestion {
  question: string;
  options: string[];
}

export interface DeveloperApprovalAnswer {
  rootId: string;
  threadId: string;
  turnId: string;
  requestId: string;
  decision: DeveloperApprovalDecision;
  /** The argv prefix a command rule allows. Required for `always_allow_command`. */
  commandPrefix?: string[];
  /** The option the user chose, for a question. */
  note?: string;
}

/**
 * The wire decision for an answer. `deny_and_stop` is `abort`, which refuses the
 * call; the shell then interrupts the turn, because the CLI keeps going after a
 * refused call. A command rule with no prefix has nothing to allow, so it is
 * refused here rather than sent as an empty rule.
 */
export function developerReviewDecision(answer: DeveloperApprovalAnswer): ReviewDecision {
  switch (answer.decision) {
    case 'approve_once':
      return 'approved';
    case 'approve_for_session':
      return 'approved_for_session';
    case 'always_allow_command': {
      const prefix = answer.commandPrefix ?? [];
      if (prefix.length === 0 || prefix.some((token) => token === '')) {
        throw new Error('A command rule needs the command it allows.');
      }
      return { approved_execpolicy_amendment: { proposed_execpolicy_amendment: prefix } };
    }
    case 'deny':
      return 'denied';
    case 'deny_and_stop':
      return 'abort';
    default:
      throw new Error('That is not an approval decision.');
  }
}

/**
 * Where a new session runs: in the approved folder itself, or in a worktree of
 * it that only that session changes.
 */
export const DEVELOPER_SESSION_ENVIRONMENTS = ['local', 'worktree', 'ssh'] as const;

export type DeveloperSessionEnvironment = (typeof DEVELOPER_SESSION_ENVIRONMENTS)[number];

export function isDeveloperSessionEnvironment(
  value: unknown,
): value is DeveloperSessionEnvironment {
  return (
    typeof value === 'string' &&
    (DEVELOPER_SESSION_ENVIRONMENTS as readonly string[]).includes(value)
  );
}

/**
 * What a new worktree starts from: the current commit alone, or the current
 * commit with every uncommitted change in the folder carried over.
 */
export const DEVELOPER_WORKTREE_STARTS = ['head', 'working_tree'] as const;

export type DeveloperWorktreeStart = (typeof DEVELOPER_WORKTREE_STARTS)[number];

export function isDeveloperWorktreeStart(value: unknown): value is DeveloperWorktreeStart {
  return (
    typeof value === 'string' && (DEVELOPER_WORKTREE_STARTS as readonly string[]).includes(value)
  );
}

export interface DeveloperSessionStartRequest {
  rootId: string;
  model?: string;
  environment?: DeveloperSessionEnvironment;
  /** Only with `environment: 'worktree'`. Defaults to `head`. */
  worktreeStart?: DeveloperWorktreeStart;
}

/**
 * A session just started. `cleanupFailures` names older worktrees the CLI
 * could not archive while making this one's; the new worktree exists either
 * way. Absent from shells and CLIs that predate it.
 */
export interface StartedDeveloperSession extends LocalDeveloperSession {
  cleanupFailures?: WorktreeCleanupFailure[];
}

/** The repository's setup script, which runs only once this exact content is approved. */
export interface DeveloperWorktreeSetupScript {
  path: string;
  sha256: string;
  approved: boolean;
}

/** A worktree the CLI made for one session, as its group carries it. */
export interface DeveloperWorktree {
  id: string;
  /** The approved folder the worktree was made from. */
  rootId: string;
  path: string;
  label: string | null;
  start: WorktreeStartPoint;
  baseCommit: string;
  createdAt: string;
  threadId: string | null;
  pinned: boolean;
  /** A runtime is serving it, so it cannot be removed. */
  active: boolean;
  missing: boolean;
  setupScript: DeveloperWorktreeSetupScript | null;
  setupExitCode: number | null;
  setupRanAt: string | null;
}

const WORKTREE_ROOT_SEPARATOR = '::worktree::';
const WORKTREE_ID = /^[0-9a-f]{8}$/u;

/**
 * The id a worktree's sessions are addressed by. Every developer command takes
 * a `rootId`; for a worktree it names the approved folder and the worktree, so
 * the shell checks permission against the folder and runs the session in the
 * worktree.
 */
export function worktreeRootId(rootId: string, worktreeId: string): string {
  return `${rootId}${WORKTREE_ROOT_SEPARATOR}${worktreeId}`;
}

export function parseWorktreeRootId(value: string): { rootId: string; worktreeId: string } | null {
  const at = value.lastIndexOf(WORKTREE_ROOT_SEPARATOR);
  if (at <= 0) return null;
  const rootId = value.slice(0, at);
  const worktreeId = value.slice(at + WORKTREE_ROOT_SEPARATOR.length);
  return WORKTREE_ID.test(worktreeId) ? { rootId, worktreeId } : null;
}

/** The approved folder a `rootId` belongs to, which is itself unless it names a worktree. */
export function approvedRootId(value: string): string {
  return parseWorktreeRootId(value)?.rootId ?? value;
}

export interface DeveloperCheckpointSectionsRequest {
  rootId: string;
  threadId: string;
  turnId: string;
  sections: CheckpointSection[];
  /** Report what would change without changing anything. */
  preview?: boolean;
}

export const DEVELOPER_THREAD_REVERT_RESTORES = [
  'both',
  'conversation',
  'code',
] as const satisfies readonly ThreadRevertRestore[];

export function isDeveloperThreadRevertRestore(value: unknown): value is ThreadRevertRestore {
  return (
    typeof value === 'string' &&
    (DEVELOPER_THREAD_REVERT_RESTORES as readonly string[]).includes(value)
  );
}

export interface DeveloperThreadRevertRequest {
  rootId: string;
  threadId: string;
  turnId: string;
  preview?: boolean;
  /** What goes back to how it was before the turn; both when omitted. */
  restore?: ThreadRevertRestore;
}

/**
 * Archives of the thread's worktrees may hold the only copy of uncommitted
 * work, so the CLI keeps them unless `discardWorktreeArchives` says the user
 * confirmed losing them.
 */
export interface DeveloperThreadDeleteRequest {
  rootId: string;
  threadId: string;
  discardWorktreeArchives?: boolean;
}

/**
 * A new session carrying the conversation through the end of one turn. The
 * source session and the files in the folder are left as they are.
 */
export interface DeveloperThreadForkRequest {
  rootId: string;
  threadId: string;
  throughTurnId: string;
}

/**
 * Summarize what the model reads of a session: from `fromTurnId` on, keeping
 * the turns before it word for word, or the older part of all of it. The
 * session still shows every message; the summarized turns can no longer be
 * rewound to.
 */
export interface DeveloperThreadCompactRequest {
  rootId: string;
  threadId: string;
  fromTurnId?: string;
}
