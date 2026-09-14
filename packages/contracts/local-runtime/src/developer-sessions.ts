import type {
  DeveloperMessage,
  DeveloperSessionSource,
  DeveloperSessionTrustMode,
  ThreadStatus,
  TurnFailureAction,
  TurnFailureCode,
} from '@agiworkforce/types/protocol';

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

/**
 * What the CLI can run in one folder, as it reports it.
 *
 * Protocol 8 names the models installed on this Mac and the configured
 * default, and says whether the account is signed in; it does not say which
 * own-key providers hold a key. So a caller choosing a model for a new session
 * treats a model the folder has already used as the strongest evidence that it
 * runs here.
 */
export interface DeveloperRuntimeModels {
  models: DeveloperModelOption[];
  defaultModelId: string | null;
  managedSignedIn: boolean;
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
    }
  | {
      type: 'approval-answered';
      threadId: string;
      turnId: string;
      requestId: string;
      approved: boolean;
    }
  | { type: 'runtime-stopped'; message: string };

export interface DeveloperTurnRequest {
  rootId: string;
  threadId: string;
  text: string;
  model?: string;
}

export interface DeveloperApprovalAnswer {
  rootId: string;
  threadId: string;
  turnId: string;
  requestId: string;
  approved: boolean;
}
