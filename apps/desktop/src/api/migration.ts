import { invoke } from '@tauri-apps/api/core';
import type {
  LovableConnectionRequest,
  LovableConnectionResponse,
  LovableWorkflowListResponse,
  LovableMigrationLaunchRequest,
  LovableMigrationLaunchResponse,
} from '../types/migration';

export async function testLovableConnection(
  request: LovableConnectionRequest,
): Promise<LovableConnectionResponse> {
  return invoke<LovableConnectionResponse>('migration_test_lovable_connection', {
    request: {
      api_key: request.apiKey,
      workspace_slug: request.workspaceSlug,
    },
  });
}

export async function listLovableWorkflows(
  workspaceSlug: string,
): Promise<LovableWorkflowListResponse> {
  return invoke<LovableWorkflowListResponse>('migration_list_lovable_workflows', {
    workspaceSlug,
  });
}

export async function launchLovableMigration(
  request: LovableMigrationLaunchRequest,
): Promise<LovableMigrationLaunchResponse> {
  return invoke<LovableMigrationLaunchResponse>('migration_launch_lovable', {
    request: {
      workspace_slug: request.workspaceSlug,
      target_workspace: request.targetWorkspace,
      naming_prefix: request.namingPrefix,
      auto_enable_schedules: request.autoEnableSchedules,
      include_audit_logs: request.includeAuditLogs,
      notes: request.notes,
      workflow_ids: request.workflowIds,
    },
  });
}
