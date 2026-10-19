import {
  AgentActivityResponseSchema,
  AgentConversationResponseSchema,
  AgentFileListResponseSchema,
  AgentFileSchema,
  AgentShareResponseSchema,
  AgentUsageResponseSchema,
  AgentVersionListResponseSchema,
  MANAGED_CLOUD_AGENTS_PATH,
  ManagedCloudAgentListResponseSchema,
  ManagedCloudAgentResponseSchema,
  managedCloudAgentPath,
  type AgentActivityResponse,
  type AgentCreateRequest,
  type AgentFile,
  type AgentShareRequest,
  type AgentShareResponse,
  type AgentStatus,
  type AgentUpdateRequest,
  type AgentUsageResponse,
  type AgentVersion,
  type ManagedCloudAgent,
} from '@agiworkforce/cloud-contracts';
import { API_URL } from '@/lib/constants';
import { guardedFetch } from '@/lib/egressGuard';
import { platformRequestHeaders } from '@/src/platform/platformHeaders';
import { ApiHttpError, api, apiFetch } from '@/services/api';
import { getAuthHeaders } from '@/services/authSession';

export interface AgentFileUpload {
  uri: string;
  name: string;
  mimeType: string;
}

export async function listAgents(signal?: AbortSignal): Promise<ManagedCloudAgent[]> {
  const body = await api.get<unknown>(MANAGED_CLOUD_AGENTS_PATH, { signal });
  return ManagedCloudAgentListResponseSchema.parse(body).agents;
}

export async function getAgent(agentId: string, signal?: AbortSignal): Promise<ManagedCloudAgent> {
  const body = await api.get<unknown>(managedCloudAgentPath(agentId), { signal });
  return ManagedCloudAgentResponseSchema.parse(body).agent;
}

export async function createAgent(input: AgentCreateRequest): Promise<ManagedCloudAgent> {
  const body = await api.post<unknown>(MANAGED_CLOUD_AGENTS_PATH, input);
  return ManagedCloudAgentResponseSchema.parse(body).agent;
}

export async function importAgentMarkdown(markdown: string): Promise<ManagedCloudAgent> {
  const body = await api.post<unknown>(`${MANAGED_CLOUD_AGENTS_PATH}/import`, { markdown });
  return ManagedCloudAgentResponseSchema.parse(body).agent;
}

export async function updateAgent(
  agentId: string,
  patch: AgentUpdateRequest,
): Promise<ManagedCloudAgent> {
  const body = await api.patch<unknown>(managedCloudAgentPath(agentId), patch);
  return ManagedCloudAgentResponseSchema.parse(body).agent;
}

export async function deleteAgent(agentId: string): Promise<void> {
  await expectOk(await apiFetch(managedCloudAgentPath(agentId), { method: 'DELETE' }));
}

export async function setAgentStatus(
  agentId: string,
  status: AgentStatus,
): Promise<ManagedCloudAgent> {
  const body = await api.post<unknown>(managedCloudAgentPath(agentId, 'status'), { status });
  return ManagedCloudAgentResponseSchema.parse(body).agent;
}

export async function publishAgent(agentId: string, note?: string): Promise<ManagedCloudAgent> {
  const trimmed = note?.trim();
  const body = await api.post<unknown>(
    managedCloudAgentPath(agentId, 'publish'),
    trimmed ? { note: trimmed } : {},
  );
  return ManagedCloudAgentResponseSchema.parse(body).agent;
}

export async function listAgentVersions(agentId: string): Promise<AgentVersion[]> {
  const body = await api.get<unknown>(managedCloudAgentPath(agentId, 'versions'));
  return AgentVersionListResponseSchema.parse(body).versions;
}

export async function restoreAgentVersion(
  agentId: string,
  version: number,
): Promise<ManagedCloudAgent> {
  const body = await api.post<unknown>(managedCloudAgentPath(agentId, 'restore'), { version });
  return ManagedCloudAgentResponseSchema.parse(body).agent;
}

export async function getAgentShare(agentId: string): Promise<AgentShareResponse> {
  return AgentShareResponseSchema.parse(
    await api.get<unknown>(managedCloudAgentPath(agentId, 'share')),
  );
}

export async function updateAgentShare(
  agentId: string,
  input: AgentShareRequest,
): Promise<AgentShareResponse> {
  return AgentShareResponseSchema.parse(
    await api.put<unknown>(managedCloudAgentPath(agentId, 'share'), input),
  );
}

export async function transferAgent(agentId: string, newOwnerId: string): Promise<void> {
  await api.post<unknown>(managedCloudAgentPath(agentId, 'transfer'), { newOwnerId });
}

export async function getAgentUsage(agentId: string): Promise<AgentUsageResponse> {
  return AgentUsageResponseSchema.parse(
    await api.get<unknown>(managedCloudAgentPath(agentId, 'usage')),
  );
}

export async function getAgentActivity(agentId: string): Promise<AgentActivityResponse> {
  return AgentActivityResponseSchema.parse(
    await api.get<unknown>(managedCloudAgentPath(agentId, 'activity')),
  );
}

export async function listAgentFiles(agentId: string): Promise<AgentFile[]> {
  return AgentFileListResponseSchema.parse(
    await api.get<unknown>(managedCloudAgentPath(agentId, 'files')),
  ).files;
}

export async function uploadAgentFile(agentId: string, file: AgentFileUpload): Promise<AgentFile> {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  const response = await guardedFetch(`${API_URL}${managedCloudAgentPath(agentId, 'files')}`, {
    method: 'POST',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
      ...(await getAuthHeaders()),
    },
    body: form,
  });
  const text = await response.text();
  if (!response.ok) throw new ApiHttpError(errorMessage(text, response.status), response.status);
  return AgentFileSchema.parse((JSON.parse(text) as { file: unknown }).file);
}

export async function deleteAgentFile(agentId: string, fileId: string): Promise<void> {
  await expectOk(
    await apiFetch(managedCloudAgentPath(agentId, `files/${encodeURIComponent(fileId)}`), {
      method: 'DELETE',
    }),
  );
}

export async function startAgentConversation(agentId: string): Promise<string> {
  const body = await api.post<unknown>(managedCloudAgentPath(agentId, 'conversations'), {});
  return AgentConversationResponseSchema.parse(body).conversationId;
}

export async function exportAgentMarkdown(agentId: string): Promise<string> {
  const response = await apiFetch(managedCloudAgentPath(agentId, 'export'), { method: 'GET' });
  await expectOk(response);
  return response.text();
}

async function expectOk(response: Response): Promise<void> {
  if (response.ok) return;
  throw new ApiHttpError(errorMessage(await response.text(), response.status), response.status);
}

function errorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } | string };
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error;
    if (typeof parsed.error === 'object' && typeof parsed.error?.message === 'string') {
      return parsed.error.message;
    }
  } catch {
    return `The request failed (${status}).`;
  }
  return `The request failed (${status}).`;
}

export { cloudActionError as agentActionError } from '@/src/shared/utils/cloudActionError';
