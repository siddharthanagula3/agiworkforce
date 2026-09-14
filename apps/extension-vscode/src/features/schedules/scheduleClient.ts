import type * as vscode from 'vscode';
import {
  createManagedCloudSchedulesClient,
  type ManagedCloudSchedulesClient,
} from '@agiworkforce/cloud-contracts';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { getExtensionUserAgent } from '../../platform/version';
import { SOURCE_SURFACE } from '../../platform/surface';

export type ScheduleClientResolution =
  | { status: 'ready'; client: ManagedCloudSchedulesClient }
  | { status: 'signed-out' };

export function createExtensionSchedulesClient(token: string): ManagedCloudSchedulesClient {
  return createManagedCloudSchedulesClient({
    baseUrl: getCloudWebOrigin(),
    getHeaders: () => ({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': getExtensionUserAgent(),
      'X-Client': 'vscode-extension',
      'X-AGI-Surface': SOURCE_SURFACE,
    }),
  });
}

export async function resolveSchedulesClient(
  secrets: vscode.SecretStorage,
): Promise<ScheduleClientResolution> {
  const token = await getAccountToken(secrets);
  if (token === undefined || token === '') return { status: 'signed-out' };
  return { status: 'ready', client: createExtensionSchedulesClient(token) };
}
