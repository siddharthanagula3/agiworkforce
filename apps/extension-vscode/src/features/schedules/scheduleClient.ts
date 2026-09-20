import type * as vscode from 'vscode';
import {
  createManagedCloudSchedulesClient,
  type ManagedCloudSchedulesClient,
} from '@agiworkforce/cloud-contracts';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { platformRequestHeaders } from '../../platform/platformHeaders';

export type ScheduleClientResolution =
  { status: 'ready'; client: ManagedCloudSchedulesClient } | { status: 'signed-out' };

export function createExtensionSchedulesClient(token: string): ManagedCloudSchedulesClient {
  return createManagedCloudSchedulesClient({
    baseUrl: getCloudWebOrigin(),
    getHeaders: () => ({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...platformRequestHeaders(),
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
