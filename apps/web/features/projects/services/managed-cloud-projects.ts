'use client';

import {
  createManagedCloudProjectsClient,
  type ManagedCloudProject,
  type ManagedCloudProjectCreateRequest,
  type ManagedCloudProjectListQuery,
  type ManagedCloudProjectUpdateRequest,
} from '@agiworkforce/cloud-contracts';
import type { Project } from '@agiworkforce/unified-chat';
import { addCsrfHeaders } from '@/lib/client/csrf';

const client = createManagedCloudProjectsClient({
  fetchImpl: (input, init) => fetch(input, init),
  credentials: 'same-origin',
  getHeaders: ({ mutation }) => (mutation ? addCsrfHeaders() : {}),
});

function toWebProject(project: ManagedCloudProject): Project {
  return {
    id: project.id,
    ownerUserId: project.ownerUserId,
    organizationId: project.organizationId,
    name: project.name,
    description: project.description ?? undefined,
    instructions: project.instructions ?? undefined,
    color: project.color ?? undefined,
    isArchived: project.isArchived,
    starred: Boolean((project.metadata as Record<string, unknown> | null)?.['starred']),
    iconEmoji: project.iconEmoji ?? undefined,
    accentColor: project.accentColor ?? undefined,
    defaultPrivacyMode: project.defaultPrivacyMode,
    defaultProviderMode: project.defaultProviderMode,
    allowedSurfaces: project.allowedSurfaces,
    defaultModelId: project.defaultModelId,
    knowledgeFileCount: project.knowledgeFileCount,
    memberCount: project.memberCount,
    lastUsedAt: project.lastUsedAt,
    importedFrom: project.importedFrom,
    metadata: project.metadata,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/** Web view-model adapter; transport paths and validation stay in services. */
export const webManagedCloudProjects = {
  async listProjects(query?: ManagedCloudProjectListQuery): Promise<Project[]> {
    return (await client.listProjects(query)).map(toWebProject);
  },
  async getProject(projectId: string): Promise<Project> {
    return toWebProject(await client.getProject(projectId));
  },
  async createProject(input: ManagedCloudProjectCreateRequest): Promise<Project> {
    return toWebProject(await client.createProject(input));
  },
  async updateProject(
    projectId: string,
    input: ManagedCloudProjectUpdateRequest,
  ): Promise<Project> {
    return toWebProject(await client.updateProject(projectId, input));
  },
  deleteProject(projectId: string): Promise<void> {
    return client.deleteProject(projectId);
  },
};
