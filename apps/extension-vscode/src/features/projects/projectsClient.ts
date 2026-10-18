import type * as vscode from 'vscode';
import {
  ManagedCloudProjectKnowledgeListResponseSchema,
  createManagedCloudProjectsClient,
  managedCloudProjectKnowledgePath,
  type ManagedCloudChatClient,
  type ManagedCloudProjectKnowledgeFile,
  type ManagedCloudProjectsClient,
} from '@agiworkforce/cloud-contracts';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { accountRequestHeaders } from '../../platform/accountHeaders';
import { createExtensionManagedCloudChat } from '../../utils/managedCloudChat';
import { readAccountRefusal } from '../../utils/accountRefusal';

export interface ProjectKnowledgeReader {
  listKnowledgeFiles(projectId: string): Promise<ManagedCloudProjectKnowledgeFile[]>;
}

export interface ProjectsWorkspace {
  projects: ManagedCloudProjectsClient;
  chat: ManagedCloudChatClient;
  knowledge: ProjectKnowledgeReader;
}

export type ProjectsWorkspaceResolution =
  { status: 'ready'; workspace: ProjectsWorkspace } | { status: 'signed-out' };

export class ProjectKnowledgeHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ProjectKnowledgeHttpError';
  }
}

function createKnowledgeReader(token: string): ProjectKnowledgeReader {
  const baseUrl = getCloudWebOrigin();
  return {
    async listKnowledgeFiles(projectId) {
      const response = await fetch(`${baseUrl}${managedCloudProjectKnowledgePath(projectId)}`, {
        headers: accountRequestHeaders(token),
      });
      if (!response.ok) {
        const refusal = await readAccountRefusal(response);
        throw new ProjectKnowledgeHttpError(
          refusal?.message ?? `HTTP ${response.status}`,
          response.status,
          refusal?.code,
        );
      }
      const parsed = ManagedCloudProjectKnowledgeListResponseSchema.safeParse(
        await response.json().catch(() => undefined),
      );
      if (!parsed.success) {
        throw new ProjectKnowledgeHttpError('AGI Cloud returned an unreadable file list', 502);
      }
      return parsed.data.files;
    },
  };
}

export function createExtensionProjectsWorkspace(token: string): ProjectsWorkspace {
  const baseUrl = getCloudWebOrigin();
  return {
    projects: createManagedCloudProjectsClient({
      baseUrl,
      getHeaders: () => accountRequestHeaders(token),
    }),
    chat: createExtensionManagedCloudChat(token),
    knowledge: createKnowledgeReader(token),
  };
}

export async function resolveProjectsWorkspace(
  secrets: vscode.SecretStorage,
): Promise<ProjectsWorkspaceResolution> {
  const token = await getAccountToken(secrets);
  if (token === undefined || token === '') return { status: 'signed-out' };
  return { status: 'ready', workspace: createExtensionProjectsWorkspace(token) };
}
