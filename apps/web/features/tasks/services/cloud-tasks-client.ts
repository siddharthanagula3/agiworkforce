import { createManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';

export function createWebCloudTasksClient() {
  return createManagedCloudAgentRunClient({
    getAuthToken,
    decorateMutationHeaders: addCsrfHeaders,
  });
}
