import { cloudFetch, getAuthHeaders } from './cloudApi';
import { WEB_APP_URL } from './config';
import {
  assertManagedCloudBoundary,
  captureManagedCloudBoundary,
} from '../services/managedCloudBoundary';

/**
 * Downloads the reviewed, tenant-scoped Cloud account export. Local chats,
 * local settings, and device-held provider credentials are intentionally not
 * part of this payload.
 */
export async function exportCloudAccountData(): Promise<string> {
  const boundary = captureManagedCloudBoundary('Cloud account export');
  const response = await cloudFetch(`${WEB_APP_URL}/api/user/export?download=true`, {
    method: 'GET',
    headers: {
      ...(await getAuthHeaders()),
      Accept: 'application/octet-stream',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const rawError =
      payload && typeof payload === 'object' && 'error' in payload ? payload.error : null;
    const message =
      typeof rawError === 'string'
        ? rawError
        : rawError &&
            typeof rawError === 'object' &&
            'message' in rawError &&
            typeof rawError.message === 'string'
          ? rawError.message
          : `Cloud export failed (${response.status}).`;
    throw new Error(message);
  }

  const exported = await response.text();
  assertManagedCloudBoundary(boundary);
  return exported;
}
