import type {
  DeveloperMessage,
  DeveloperSessionTrustMode,
  ThreadStatus,
} from '@agiworkforce/types/protocol';

export const DEVELOPER_SESSION_COMMANDS = [
  'developer_runtime_status',
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
 * Which surface opened a session.
 *
 * The CLI stores `cli` for every client whose name is not VS Code, so a
 * session this shell started is indistinguishable in the shared store. The
 * shell keeps its own record of what it started and reports `desktop` for
 * those; anything it has no record of is reported exactly as the store has it.
 */
export const DEVELOPER_SESSION_ORIGINS = ['cli', 'vscode', 'desktop'] as const;

export type DeveloperSessionOrigin = (typeof DEVELOPER_SESSION_ORIGINS)[number];

export const DEVELOPER_SESSION_ORIGIN_LABELS: Record<DeveloperSessionOrigin, string> = {
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

export interface DeveloperSession {
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
  origin: DeveloperSessionOrigin;
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
  sessions: DeveloperSession[];
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

export interface DeveloperSessionList {
  groups: DeveloperSessionGroup[];
}

export interface DeveloperSessionTranscript {
  session: DeveloperSession;
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
      error: string | null;
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
