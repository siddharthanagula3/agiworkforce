export const CLOUD_CODE_NETWORK_ACCESS = ['none', 'trusted', 'full'] as const;
export type CloudCodeNetworkAccess = (typeof CLOUD_CODE_NETWORK_ACCESS)[number];

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
