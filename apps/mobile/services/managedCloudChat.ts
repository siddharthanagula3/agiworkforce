import { createManagedCloudChatClient } from '@agiworkforce/cloud-contracts';
import { apiFetch } from './api';

export const managedCloudChat = createManagedCloudChatClient({
  fetchImpl: (input, init) => apiFetch(input, init ?? {}),
});
