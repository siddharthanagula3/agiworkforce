import {
  createManagedCloudChatClient,
  type ManagedCloudChatClient,
} from '@agiworkforce/cloud-contracts';
import { accountRequestHeaders } from '../platform/accountHeaders';
import { getCloudWebOrigin } from './api';

export function createExtensionManagedCloudChat(token: string): ManagedCloudChatClient {
  return createManagedCloudChatClient({
    baseUrl: getCloudWebOrigin(),
    getAuthToken: () => Promise.resolve(token),
    fetchImpl: (input, init) =>
      fetch(input, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string> | undefined),
          ...accountRequestHeaders(token),
        },
      }),
  });
}
