export const CLOUD_CODE_NETWORK_ACCESS = ['none', 'trusted', 'full'] as const;
export type CloudCodeNetworkAccess = (typeof CLOUD_CODE_NETWORK_ACCESS)[number];

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
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
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
  finalMessage: string;
  errorMessage: string | null;
  createdAt: string;
  steps: CloudCodeAgentStep[];
}

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

export interface CreateCloudCodeSessionInput {
  requestId: string;
  title: string;
  repositoryUrl?: string | null;
  repositoryBranch?: string | null;
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
