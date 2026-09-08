import {
  createManagedCloudAgentRunClient,
  type CloudAgentRun,
} from '@agiworkforce/cloud-contracts';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';

const RUNS_PATH = '/api/llm/v1/chat/completions/runs';

export function createWebCloudTasksClient() {
  return createManagedCloudAgentRunClient({
    getAuthToken,
    decorateMutationHeaders: addCsrfHeaders,
  });
}

/**
 * Archive is web-only for now: the shared page asks the host for it and paints
 * nothing when the host cannot do it, so this stays beside the client rather
 * than in the shared run contract.
 */
export async function setWebCloudTaskArchived(
  runId: string,
  archived: boolean,
): Promise<CloudAgentRun> {
  const token = await getAuthToken();
  const headers = await addCsrfHeaders({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  const response = await fetch(`${RUNS_PATH}/${encodeURIComponent(runId)}/archive`, {
    method: archived ? 'POST' : 'DELETE',
    headers,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as { error?: { message?: unknown } }).error?.message === 'string'
        ? (body as { error: { message: string } }).error.message
        : `Request failed (${response.status})`;
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return (body as { run: CloudAgentRun }).run;
}
