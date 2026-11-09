import type * as vscode from 'vscode';
import {
  MANAGED_CLOUD_ARTIFACT_INDEX_PATH,
  MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH,
  ManagedCloudArtifactIndexResponseSchema,
  ManagedCloudPublishedArtifactListResponseSchema,
  managedCloudArtifactIndexQueryString,
  type ManagedCloudArtifactIndexEntry,
  type ManagedCloudArtifactIndexQuery,
  type ManagedCloudChatClient,
  type ManagedCloudPublishedArtifact,
} from '@agiworkforce/cloud-contracts';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { accountRequestHeaders } from '../../platform/accountHeaders';
import { createExtensionManagedCloudChat } from '../../utils/managedCloudChat';
import { readAccountRefusal } from '../../utils/accountRefusal';

const PUBLISHED_PAGE_MAX_COUNT = 100;

export class ArtifactsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
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
  { status: 'ready'; workspace: ArtifactsWorkspace } | { status: 'signed-out' };

async function readJson(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, { headers: accountRequestHeaders(token) });
  if (!response.ok) {
    const refusal = await readAccountRefusal(response);
    throw new ArtifactsHttpError(
      refusal?.message ?? `HTTP ${response.status}`,
      response.status,
      refusal?.code,
    );
  }
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
        const artifacts: ManagedCloudPublishedArtifact[] = [];
        const seenCursors = new Set<string>();
        let cursor: string | undefined;
        for (let page = 0; page < PUBLISHED_PAGE_MAX_COUNT; page += 1) {
          const suffix = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
          const parsed = ManagedCloudPublishedArtifactListResponseSchema.safeParse(
            await readJson(`${baseUrl}${MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH}${suffix}`, token),
          );
          if (!parsed.success) {
            throw new ArtifactsHttpError('AGI Cloud returned an unreadable published list', 502);
          }
          artifacts.push(...parsed.data.artifacts);
          const next = parsed.data.pageInfo?.nextCursor ?? null;
          if (next === null) return artifacts;
          if (seenCursors.has(next)) break;
          seenCursors.add(next);
          cursor = next;
        }
        throw new ArtifactsHttpError('AGI Cloud returned an incomplete published list', 502);
      },
    },
    chat: createExtensionManagedCloudChat(token),
  };
}

export async function resolveArtifactsWorkspace(
  secrets: vscode.SecretStorage,
): Promise<ArtifactsWorkspaceResolution> {
  const token = await getAccountToken(secrets);
  if (token === undefined || token === '') return { status: 'signed-out' };
  return { status: 'ready', workspace: createExtensionArtifactsWorkspace(token) };
}
