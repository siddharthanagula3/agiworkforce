/**
 * Durable managed-cloud Code session contracts shared by the Web UI and API.
 *
 * These records describe the product-owned session journal. Provider sandbox
 * identifiers and credentials are deliberately excluded from the client wire
 * format.
 */

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

export interface CloudCodeSession {
  id: string;
  title: string;
  repositoryUrl: string | null;
  networkAccess: CloudCodeNetworkAccess;
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
  /** False when the deployment has not applied the Code persistence migration. */
  storageReady: boolean;
  planEntitled: boolean;
  planTier: string;
  maxSessions: number;
}

export interface CloudCodeSessionListResponse {
  availability: CloudCodeAvailability;
  sessions: CloudCodeSession[];
}

export interface CreateCloudCodeSessionInput {
  requestId: string;
  title: string;
  repositoryUrl?: string | null;
  networkAccess: CloudCodeNetworkAccess;
  /** Required true when networkAccess is "full"; enforced at the API boundary. */
  fullNetworkAcknowledged?: boolean;
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
