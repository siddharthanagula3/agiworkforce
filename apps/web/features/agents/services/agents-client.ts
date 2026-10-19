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
import type { z } from 'zod';

import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';

export class AgentRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AgentRequestError';
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

async function headersFor(method: Method, json: boolean): Promise<HeadersInit> {
  const token = await getAuthToken();
  const base: Record<string, string> = {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return method === 'GET' ? base : addCsrfHeaders(base);
}

async function failure(response: Response): Promise<AgentRequestError> {
  const body: unknown = await response.json().catch(() => null);
  const message =
    body &&
    typeof body === 'object' &&
    'error' in body &&
    typeof (body as { error?: { message?: unknown } }).error?.message === 'string'
      ? (body as { error: { message: string } }).error.message
      : `The request failed (${response.status}).`;
  return new AgentRequestError(message, response.status);
}

async function send(path: string, method: Method, body?: unknown | FormData): Promise<Response> {
  const form = body instanceof FormData;
  const response = await fetch(path, {
    method,
    headers: await headersFor(method, body !== undefined && !form),
    cache: 'no-store',
    ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
  });
  if (!response.ok) throw await failure(response);
  return response;
}

async function sendJson<T>(
  schema: z.ZodType<T>,
  path: string,
  method: Method,
  body?: unknown,
): Promise<T> {
  return schema.parse(await (await send(path, method, body)).json());
}

function agentPath(agentId: string, leaf = ''): string {
  return `${MANAGED_CLOUD_AGENTS_PATH}/${encodeURIComponent(agentId)}${leaf ? `/${leaf}` : ''}`;
}

export interface AgentsApi {
  list(): Promise<ManagedCloudAgent[]>;
  get(agentId: string): Promise<ManagedCloudAgent>;
  create(input: AgentCreateRequest): Promise<ManagedCloudAgent>;
  importMarkdown(markdown: string): Promise<ManagedCloudAgent>;
  update(agentId: string, patch: AgentUpdateRequest): Promise<ManagedCloudAgent>;
  remove(agentId: string): Promise<void>;
  setStatus(agentId: string, status: AgentStatus): Promise<ManagedCloudAgent>;
  publish(agentId: string, note?: string): Promise<ManagedCloudAgent>;
  versions(agentId: string): Promise<AgentVersion[]>;
  restore(agentId: string, version: number): Promise<ManagedCloudAgent>;
  share(agentId: string): Promise<AgentShareResponse>;
  updateShare(agentId: string, input: AgentShareRequest): Promise<AgentShareResponse>;
  transfer(agentId: string, newOwnerId: string): Promise<void>;
  usage(agentId: string): Promise<AgentUsageResponse>;
  activity(agentId: string): Promise<AgentActivityResponse>;
  files(agentId: string): Promise<AgentFile[]>;
  addFile(agentId: string, file: File): Promise<AgentFile>;
  removeFile(agentId: string, fileId: string): Promise<void>;
  startConversation(agentId: string): Promise<string>;
  exportHref(agentId: string): string;
  exportMarkdown(agentId: string): Promise<string>;
}

export const agentsApi: AgentsApi = {
  list: async () =>
    (await sendJson(ManagedCloudAgentListResponseSchema, MANAGED_CLOUD_AGENTS_PATH, 'GET')).agents,
  get: async (agentId) =>
    (await sendJson(ManagedCloudAgentResponseSchema, agentPath(agentId), 'GET')).agent,
  create: async (input) =>
    (await sendJson(ManagedCloudAgentResponseSchema, MANAGED_CLOUD_AGENTS_PATH, 'POST', input))
      .agent,
  importMarkdown: async (markdown) =>
    (
      await sendJson(
        ManagedCloudAgentResponseSchema,
        `${MANAGED_CLOUD_AGENTS_PATH}/import`,
        'POST',
        { markdown },
      )
    ).agent,
  update: async (agentId, patch) =>
    (await sendJson(ManagedCloudAgentResponseSchema, agentPath(agentId), 'PATCH', patch)).agent,
  remove: async (agentId) => {
    await send(agentPath(agentId), 'DELETE');
  },
  setStatus: async (agentId, status) =>
    (
      await sendJson(ManagedCloudAgentResponseSchema, agentPath(agentId, 'status'), 'POST', {
        status,
      })
    ).agent,
  publish: async (agentId, note) =>
    (
      await sendJson(ManagedCloudAgentResponseSchema, agentPath(agentId, 'publish'), 'POST', {
        ...(note ? { note } : {}),
      })
    ).agent,
  versions: async (agentId) =>
    (await sendJson(AgentVersionListResponseSchema, agentPath(agentId, 'versions'), 'GET'))
      .versions,
  restore: async (agentId, version) =>
    (
      await sendJson(ManagedCloudAgentResponseSchema, agentPath(agentId, 'restore'), 'POST', {
        version,
      })
    ).agent,
  share: (agentId) => sendJson(AgentShareResponseSchema, agentPath(agentId, 'share'), 'GET'),
  updateShare: (agentId, input) =>
    sendJson(AgentShareResponseSchema, agentPath(agentId, 'share'), 'PUT', input),
  transfer: async (agentId, newOwnerId) => {
    await send(agentPath(agentId, 'transfer'), 'POST', { newOwnerId });
  },
  usage: (agentId) => sendJson(AgentUsageResponseSchema, agentPath(agentId, 'usage'), 'GET'),
  activity: (agentId) =>
    sendJson(AgentActivityResponseSchema, agentPath(agentId, 'activity'), 'GET'),
  files: async (agentId) =>
    (await sendJson(AgentFileListResponseSchema, agentPath(agentId, 'files'), 'GET')).files,
  addFile: async (agentId, file) => {
    const form = new FormData();
    form.append('file', file);
    const response = await send(agentPath(agentId, 'files'), 'POST', form);
    return AgentFileSchema.parse(((await response.json()) as { file: unknown }).file);
  },
  removeFile: async (agentId, fileId) => {
    await send(agentPath(agentId, `files/${encodeURIComponent(fileId)}`), 'DELETE');
  },
  startConversation: async (agentId) =>
    (
      await sendJson(
        AgentConversationResponseSchema,
        agentPath(agentId, 'conversations'),
        'POST',
        {},
      )
    ).conversationId,
  exportHref: (agentId) => agentPath(agentId, 'export'),
  exportMarkdown: async (agentId) => (await send(agentPath(agentId, 'export'), 'GET')).text(),
};
