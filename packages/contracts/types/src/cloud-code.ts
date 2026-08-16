
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
