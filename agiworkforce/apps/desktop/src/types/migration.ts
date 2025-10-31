export interface LovableConnectionRequest {
  apiKey: string;
  workspaceSlug: string;
}

export interface LovableConnectionResponse {
  workspaceName: string;
  totalWorkflows: number;
  betaAccess: boolean;
}

export type LovableWorkflowStatus = 'healthy' | 'broken' | 'deprecated';

export interface LovableWorkflow {
  id: string;
  name: string;
  owner: string;
  lastRun: string;
  status: LovableWorkflowStatus;
  estimatedMinutes: number;
}

export interface LovableWorkflowListResponse {
  workflows: LovableWorkflow[];
}

export interface LovableMigrationLaunchRequest {
  workspaceSlug: string;
  targetWorkspace: string;
  namingPrefix?: string;
  autoEnableSchedules: boolean;
  includeAuditLogs: boolean;
  notes?: string;
  workflowIds: string[];
}

export interface LovableMigrationLaunchResponse {
  queued: number;
  estimateMinutes: number;
}
