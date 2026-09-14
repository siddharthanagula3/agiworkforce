import type * as vscode from 'vscode';
import {
  MANAGED_CLOUD_ARTIFACT_INDEX_PATH,
  MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH,
  ManagedCloudArtifactIndexResponseSchema,
  ManagedCloudPublishedArtifactListResponseSchema,
  createManagedCloudChatClient,
  managedCloudArtifactIndexQueryString,
  type ManagedCloudArtifactIndexEntry,
  type ManagedCloudArtifactIndexQuery,
  type ManagedCloudChatClient,
  type ManagedCloudPublishedArtifact,
} from '@agiworkforce/cloud-contracts';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { getExtensionUserAgent } from '../../platform/version';
import { SOURCE_SURFACE } from '../../platform/surface';

export class ArtifactsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ArtifactsHttpError';
  }
}

export interface ArtifactIndexClient {
  listArtifacts(query?: ManagedCloudArtifactIndexQuery): Promise<ManagedCloudArtifactIndexEntry[]>;
  listPublishedArtifacts(): Promise<ManagedCloudPublishedArtifact[]>;
}

export interface ArtifactsWorkspace {
  index: ArtifactIndexClient;
  chat: ManagedCloudChatClient;
}

export type ArtifactsWorkspaceResolution =
  | { status: 'ready'; workspace: ArtifactsWorkspace }
  | { status: 'signed-out' };

function hostedHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'User-Agent': getExtensionUserAgent(),
    'X-Client': 'vscode-extension',
    'X-AGI-Surface': SOURCE_SURFACE,
  };
}

async function readJson(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, { headers: hostedHeaders(token) });
  if (!response.ok) throw new ArtifactsHttpError(`HTTP ${response.status}`, response.status);
  return response.json().catch(() => undefined);
}

export function createExtensionArtifactsWorkspace(token: string): ArtifactsWorkspace {
  const baseUrl = getCloudWebOrigin();
  return {
    index: {
      async listArtifacts(query = {}) {
        const parsed = ManagedCloudArtifactIndexResponseSchema.safeParse(
          await readJson(
            `${baseUrl}${MANAGED_CLOUD_ARTIFACT_INDEX_PATH}${managedCloudArtifactIndexQueryString(query)}`,
            token,
          ),
        );
        if (!parsed.success) {
          throw new ArtifactsHttpError('AGI Cloud returned an unreadable artifact index', 502);
        }
        return parsed.data.artifacts;
      },
      async listPublishedArtifacts() {
        const parsed = ManagedCloudPublishedArtifactListResponseSchema.safeParse(
          await readJson(`${baseUrl}${MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH}`, token),
        );
        if (!parsed.success) {
          throw new ArtifactsHttpError('AGI Cloud returned an unreadable published list', 502);
        }
        return parsed.data.artifacts;
      },
    },
    chat: createManagedCloudChatClient({
      baseUrl,
      getAuthToken: () => Promise.resolve(token),
      fetchImpl: (input, init) =>
        fetch(input, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string> | undefined),
            ...hostedHeaders(token),
          },
        }),
    }),
  };
}

export async function resolveArtifactsWorkspace(
  secrets: vscode.SecretStorage,
): Promise<ArtifactsWorkspaceResolution> {
  const token = await getAccountToken(secrets);
  if (token === undefined || token === '') return { status: 'signed-out' };
  return { status: 'ready', workspace: createExtensionArtifactsWorkspace(token) };
}
