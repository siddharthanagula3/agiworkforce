import type * as vscode from 'vscode';
import {
  MANAGED_CLOUD_CONNECTORS_PATH,
  ListConnectorsResponseSchema,
  type ListConnectorsResponse,
} from '@agiworkforce/cloud-contracts';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { platformRequestHeaders } from '../../platform/platformHeaders';
import { readAccountRefusal } from '../../utils/accountRefusal';

export class ConnectorsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
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
        const refusal = await readAccountRefusal(response);
        throw new ConnectorsHttpError(
          refusal?.message ?? `HTTP ${response.status}`,
          response.status,
          refusal?.code,
        );
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
