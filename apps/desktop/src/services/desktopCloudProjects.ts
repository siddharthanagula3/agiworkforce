import {
  createManagedCloudProjectsClient,
  type ManagedCloudProject,
  type ManagedCloudProjectCreateRequest,
  type ManagedCloudProjectUpdateRequest,
} from '@agiworkforce/cloud-contracts';
import { WEB_APP_URL } from '../api/config';
import { cloudFetch, getAuthHeaders } from '../api/cloudApi';
import type { Project } from '../stores/projectStore';
import { assertManagedCloudBoundary, captureManagedCloudBoundary } from './managedCloudBoundary';

const client = createManagedCloudProjectsClient({
  baseUrl: WEB_APP_URL,
  credentials: 'include',
  fetchImpl: cloudFetch,
  getHeaders: async () => getAuthHeaders(),
});

function toDesktopProject(project: ManagedCloudProject): Project {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? '',
    customInstructions: project.instructions ?? '',
    // Device paths and extracted local file contents never cross into the
    // managed project projection.
    files: [],
    conversationIds: [],
    conversationCount: project.conversationCount ?? 0,
    color: project.color ?? undefined,
    icon: undefined,
    isArchived: project.isArchived ?? false,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    knowledgeBaseFiles: [],
    iconEmoji: project.iconEmoji ?? null,
    accentColor: project.accentColor ?? null,
    defaultPrivacyMode: 'managed',
  };
}

function createInput(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) {
  return {
    name: project.name,
    description: project.description || null,
    instructions: project.customInstructions || null,
    ...(project.color ? { color: project.color } : {}),
    iconEmoji: project.iconEmoji ?? null,
    accentColor: project.accentColor ?? null,
    defaultPrivacyMode: 'managed',
    conversationIds: Array.from(new Set(project.conversationIds)),
  } satisfies ManagedCloudProjectCreateRequest;
}

function updateInput(updates: Partial<Project>): ManagedCloudProjectUpdateRequest {
  return {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.description !== undefined ? { description: updates.description || null } : {}),
    ...(updates.customInstructions !== undefined
      ? { instructions: updates.customInstructions || null }
      : {}),
    ...(updates.color !== undefined ? { color: updates.color } : {}),
    ...(updates.isArchived !== undefined ? { isArchived: updates.isArchived } : {}),
    ...(updates.iconEmoji !== undefined ? { iconEmoji: updates.iconEmoji } : {}),
    ...(updates.accentColor !== undefined ? { accentColor: updates.accentColor } : {}),
    ...(updates.conversationIds !== undefined
      ? { conversationIds: Array.from(new Set(updates.conversationIds)) }
      : {}),
    defaultPrivacyMode: 'managed',
  };
}

export const desktopCloudProjects = {
  async listProjects(): Promise<Project[]> {
    const boundary = captureManagedCloudBoundary('Managed Cloud projects');
    const projects: Project[] = [];
    let offset = 0;
    while (offset <= 10_000) {
      const page = await client.listProjects({ limit: 100, offset });
      assertManagedCloudBoundary(boundary);
      projects.push(...page.map(toDesktopProject));
      if (page.length < 100) return projects;
      offset += page.length;
    }
    throw new Error('Managed Cloud project pagination exceeded the supported account limit.');
  },

  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const boundary = captureManagedCloudBoundary('Managed Cloud project creation');
    const created = await client.createProject(createInput(project));
    assertManagedCloudBoundary(boundary);
    return {
      ...toDesktopProject(created),
      conversationIds: Array.from(new Set(project.conversationIds)),
      conversationCount: new Set(project.conversationIds).size,
    };
  },

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    const boundary = captureManagedCloudBoundary('Managed Cloud project update');
    const response = await client.updateProject(id, updateInput(updates));
    assertManagedCloudBoundary(boundary);
    const updated = toDesktopProject(response);
    return updates.conversationIds
      ? {
          ...updated,
          conversationIds: Array.from(new Set(updates.conversationIds)),
          conversationCount: new Set(updates.conversationIds).size,
        }
      : updated;
  },

  async deleteProject(id: string): Promise<void> {
    const boundary = captureManagedCloudBoundary('Managed Cloud project deletion');
    await client.deleteProject(id);
    assertManagedCloudBoundary(boundary);
  },
};
