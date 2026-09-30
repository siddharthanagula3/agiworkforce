import type {
  DeveloperAgentMode,
  DeveloperMessage,
  DeveloperSessionSource,
  DeveloperSessionTrustMode,
  ThreadStatus,
  TurnFailureAction,
  TurnFailureCode,
} from '@agiworkforce/types/protocol';
import type { MessageKind } from '@agiworkforce/types';

export const DEVELOPER_SESSION_COMMANDS = [
  'developer_runtime_status',
  'developer_model_list',
  'developer_session_list',
  'developer_session_read',
  'developer_session_resume',
  'developer_session_start',
  'developer_turn_start',
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

export interface DeveloperSessionGroup {
  rootId: string;
  name: string;
  path: string;
  branch: string | null;
  sessions: LocalDeveloperSession[];
  unavailable?: DeveloperRuntimeUnavailable;
}

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
   * Why the shell could not make the CLI this account, or null when it had no
   * reason to try. The picker keeps whatever the CLI already reported, so this
   * row is the only place the attempt is visible.
   */
  accountSyncError: string | null;
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
  defaultAgentMode: DeveloperAgentMode | null;
  managedSignedIn: boolean;
  features?: DeveloperRuntimeFeatures;
}

export interface DeveloperSessionList {
  groups: DeveloperSessionGroup[];
}

export interface DeveloperSessionTranscript {
  session: LocalDeveloperSession;
  messages: DeveloperMessage[];
  truncated: boolean;
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

export type DeveloperSessionEvent =
  | { type: 'turn-started'; threadId: string; turnId: string }
  | { type: 'output-delta'; threadId: string; turnId: string; delta: string }
  | {
      type: 'turn-finished';
      threadId: string;
      turnId: string;
      outcome: DeveloperTurnOutcome;
      response: string;
      failure: DeveloperTurnFailure | null;
      inputTokens: number;
      outputTokens: number;
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
  | {
      type: 'approval-requested';
      threadId: string;
      turnId: string;
      requestId: string;
      summary: string;
      detail: string;
      /** Present when the agent asks the user to choose, not to allow a step. */
      question?: DeveloperApprovalQuestion;
    }
  | {
      type: 'approval-answered';
      threadId: string;
      turnId: string;
      requestId: string;
      approved: boolean;
    }
  | { type: 'runtime-stopped'; message: string };

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
  'runtime-stopped': 'error',
} as const satisfies Readonly<Record<DeveloperSessionEvent['type'], MessageKind>>);

export function messageKindForDeveloperSessionEvent(
  type: DeveloperSessionEvent['type'],
): MessageKind {
  return DEVELOPER_SESSION_EVENT_MESSAGE_KINDS[type];
}

export interface DeveloperTurnRequest {
  rootId: string;
  threadId: string;
  text: string;
  model?: string;
  agentMode?: DeveloperAgentMode;
  maxTurns?: number;
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
  approved: boolean;
  /** The option the user chose, for a question. */
  note?: string;
}
