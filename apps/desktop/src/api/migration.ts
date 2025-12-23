import { invoke } from '../lib/tauri-mock';
import type {
  LovableConnectionRequest,
  LovableConnectionResponse,
  LovableMigrationLaunchRequest,
  LovableMigrationLaunchResponse,
  LovableWorkflowListResponse,
} from '../types/migration';

const MIGRATION_TIMEOUT_MS = 60000;
const MIGRATION_LAUNCH_TIMEOUT_MS = 300000;

interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invokeWithTimeout<T>(
  command: string,
  args?: Record<string, unknown>,
  timeoutMs: number = MIGRATION_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Migration command '${command}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    invoke<T>(command, args)
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Migration command '${command}' failed: ${error}`));
      });
  });
}

async function invokeWithRetry<T>(
  command: string,
  args?: Record<string, unknown>,
  timeoutMs: number = MIGRATION_TIMEOUT_MS,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await invokeWithTimeout<T>(command, args, timeoutMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retryConfig.maxRetries) {
        const delay = retryConfig.delayMs * Math.pow(retryConfig.backoffMultiplier, attempt);
        await sleep(delay);
      }
    }
  }

  throw (
    lastError ||
    new Error(`Migration command '${command}' failed after ${retryConfig.maxRetries} retries`)
  );
}

function validateNonEmpty(value: string | undefined, fieldName: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
}

function validateApiKey(apiKey: string): void {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('API key cannot be empty');
  }

  if (apiKey.length < 10) {
    throw new Error('API key appears to be invalid (too short)');
  }
}

function validateWorkspaceSlug(slug: string): void {
  if (!slug || slug.trim().length === 0) {
    throw new Error('Workspace slug cannot be empty');
  }

  if (!/^[a-zA-Z0-9-_]+$/.test(slug)) {
    throw new Error('Workspace slug contains invalid characters');
  }
}

export async function testLovableConnection(
  request: LovableConnectionRequest,
): Promise<LovableConnectionResponse> {
  try {
    if (!request) {
      throw new Error('Connection request cannot be null or undefined');
    }
    validateApiKey(request.apiKey);
    validateWorkspaceSlug(request.workspaceSlug);

    return await invokeWithRetry<LovableConnectionResponse>('migration_test_lovable_connection', {
      request: {
        api_key: request.apiKey,
        workspace_slug: request.workspaceSlug,
      },
    });
  } catch (error) {
    throw new Error(`Failed to test Lovable connection: ${error}`);
  }
}

export async function listLovableWorkflows(
  workspaceSlug: string,
): Promise<LovableWorkflowListResponse> {
  try {
    validateWorkspaceSlug(workspaceSlug);

    return await invokeWithRetry<LovableWorkflowListResponse>('migration_list_lovable_workflows', {
      workspaceSlug,
    });
  } catch (error) {
    throw new Error(`Failed to list Lovable workflows for workspace '${workspaceSlug}': ${error}`);
  }
}

export async function launchLovableMigration(
  request: LovableMigrationLaunchRequest,
): Promise<LovableMigrationLaunchResponse> {
  try {
    if (!request) {
      throw new Error('Migration launch request cannot be null or undefined');
    }
    validateWorkspaceSlug(request.workspaceSlug);
    validateWorkspaceSlug(request.targetWorkspace);

    if (!Array.isArray(request.workflowIds)) {
      throw new Error('workflowIds must be an array');
    }
    if (request.workflowIds.length === 0) {
      throw new Error('workflowIds cannot be empty');
    }

    if (request.namingPrefix !== undefined) {
      validateNonEmpty(request.namingPrefix, 'naming prefix');
    }

    return await invokeWithRetry<LovableMigrationLaunchResponse>(
      'migration_launch_lovable',
      {
        request: {
          workspace_slug: request.workspaceSlug,
          target_workspace: request.targetWorkspace,
          naming_prefix: request.namingPrefix,
          auto_enable_schedules: request.autoEnableSchedules,
          include_audit_logs: request.includeAuditLogs,
          notes: request.notes,
          workflow_ids: request.workflowIds,
        },
      },
      MIGRATION_LAUNCH_TIMEOUT_MS,
    );
  } catch (error) {
    throw new Error(`Failed to launch Lovable migration: ${error}`);
  }
}
