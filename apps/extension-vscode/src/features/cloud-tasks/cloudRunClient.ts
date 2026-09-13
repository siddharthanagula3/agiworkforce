import type * as vscode from 'vscode';
import {
  createManagedCloudAgentRunClient,
  type ManagedCloudAgentRunClient,
} from '@agiworkforce/cloud-contracts';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { getExtensionUserAgent } from '../../platform/version';
import { SOURCE_SURFACE } from '../../platform/surface';

export type CloudAgentRunClientResolution =
  | { status: 'ready'; client: ManagedCloudAgentRunClient }
  | { status: 'signed-out' };

export function createExtensionCloudAgentRunClient(token: string): ManagedCloudAgentRunClient {
  return createManagedCloudAgentRunClient({
    baseUrl: getCloudWebOrigin(),
    getAuthToken: () => Promise.resolve(token),
    fetchImpl: (input, init) =>
      fetch(input, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string> | undefined),
          'User-Agent': getExtensionUserAgent(),
          'X-Client': 'vscode-extension',
          'X-AGI-Surface': SOURCE_SURFACE,
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
