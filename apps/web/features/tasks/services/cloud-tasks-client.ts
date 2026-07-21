import { createManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';

// Browser client for the durable Cloud task (agent-run) list/cancel API,
// reusing the same shared client + auth/CSRF wiring that useChatStream uses to
// follow and cancel runs. The backend (cloud_agent_runs + /runs endpoints)
// already exists; this is the read/cancel surface the Tasks page consumes.
export function createWebCloudTasksClient() {
  return createManagedCloudAgentRunClient({
    getAuthToken,
    decorateMutationHeaders: addCsrfHeaders,
  });
}
