import type * as vscode from 'vscode';
import {
  createManagedCloudAgentRunClient,
  type ManagedCloudAgentRunClient,
} from '@agiworkforce/cloud-contracts';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { platformRequestHeaders } from '../../platform/platformHeaders';

export type CloudAgentRunClientResolution =
  { status: 'ready'; client: ManagedCloudAgentRunClient } | { status: 'signed-out' };

export function createExtensionCloudAgentRunClient(token: string): ManagedCloudAgentRunClient {
  return createManagedCloudAgentRunClient({
    baseUrl: getCloudWebOrigin(),
    getAuthToken: () => Promise.resolve(token),
    fetchImpl: (input, init) =>
      fetch(input, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string> | undefined),
          ...platformRequestHeaders(),
        },
      }),
  });
}

export async function resolveCloudAgentRunClient(
  secrets: vscode.SecretStorage,
): Promise<CloudAgentRunClientResolution> {
  const token = await getAccountToken(secrets);
  if (token === undefined || token === '') return { status: 'signed-out' };
  return { status: 'ready', client: createExtensionCloudAgentRunClient(token) };
}
