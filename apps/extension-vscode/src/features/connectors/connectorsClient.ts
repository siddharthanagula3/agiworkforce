import type * as vscode from 'vscode';
import {
  MANAGED_CLOUD_CONNECTORS_PATH,
  ListConnectorsResponseSchema,
  type ListConnectorsResponse,
} from '@agiworkforce/cloud-contracts';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { platformRequestHeaders } from '../../platform/platformHeaders';

export class ConnectorsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ConnectorsHttpError';
  }
}

export interface ConnectorsClient {
  listConnectors(): Promise<ListConnectorsResponse>;
}

export type ConnectorsClientResolution =
  { status: 'ready'; client: ConnectorsClient } | { status: 'signed-out' };

export function createExtensionConnectorsClient(token: string): ConnectorsClient {
  const baseUrl = getCloudWebOrigin();
  return {
    async listConnectors() {
      const response = await fetch(`${baseUrl}${MANAGED_CLOUD_CONNECTORS_PATH}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...platformRequestHeaders(),
        },
      });
      if (!response.ok) {
        throw new ConnectorsHttpError(`HTTP ${response.status}`, response.status);
      }
      const parsed = ListConnectorsResponseSchema.safeParse(
        await response.json().catch(() => undefined),
      );
      if (!parsed.success) {
        throw new ConnectorsHttpError('AGI Cloud returned an unreadable connector list', 502);
      }
      return parsed.data;
    },
  };
}

export async function resolveConnectorsClient(
  secrets: vscode.SecretStorage,
): Promise<ConnectorsClientResolution> {
  const token = await getAccountToken(secrets);
  if (token === undefined || token === '') return { status: 'signed-out' };
  return { status: 'ready', client: createExtensionConnectorsClient(token) };
}
