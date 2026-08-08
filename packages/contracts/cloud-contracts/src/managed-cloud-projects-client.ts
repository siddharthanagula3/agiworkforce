import { z } from 'zod';
import { stripTrailingSlashes } from '@agiworkforce/types';
import {
  ProjectsSyncPullResponseSchema,
  ProjectsSyncPushRequestSchema,
  ProjectsSyncPushResponseSchema,
  ServerVersionSchema,
  type ProjectsSyncPullResponse,
  type ProjectsSyncPushRequest,
  type ProjectsSyncPushResponse,
} from './sync';
import {
  MANAGED_CLOUD_PROJECTS_PATH,
  MANAGED_CLOUD_PROJECTS_SYNC_PATH,
  ManagedCloudProjectCreateRequestSchema,
  ManagedCloudProjectDeleteResponseSchema,
  ManagedCloudProjectListQuerySchema,
  ManagedCloudProjectListResponseSchema,
  ManagedCloudProjectResponseSchema,
  ManagedCloudProjectUpdateRequestSchema,
  managedCloudProjectPath,
  type ManagedCloudProject,
  type ManagedCloudProjectCreateRequest,
  type ManagedCloudProjectListQuery,
  type ManagedCloudProjectUpdateRequest,
} from './projects';

export type ManagedCloudProjectsMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface ManagedCloudProjectsTransportRequest {
  path: string;
  method: ManagedCloudProjectsMethod;
  body?: unknown;
  signal?: AbortSignal;
}

export type ManagedCloudProjectsRequestJson = (
  request: ManagedCloudProjectsTransportRequest,
) => Promise<unknown>;

export interface ManagedCloudProjectsHeaderContext {
  method: ManagedCloudProjectsMethod;
  path: string;
  mutation: boolean;
  json: boolean;
}

export interface ManagedCloudProjectsClientConfig {
  baseUrl?: string;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  requestJson?: ManagedCloudProjectsRequestJson;
  getHeaders?: (context: ManagedCloudProjectsHeaderContext) => HeadersInit | Promise<HeadersInit>;
  credentials?: RequestCredentials;
}

export interface ManagedCloudProjectsRequestOptions {
  signal?: AbortSignal;
}

export interface ManagedCloudProjectsClient {
  listProjects(
    query?: ManagedCloudProjectListQuery,
    options?: ManagedCloudProjectsRequestOptions,
  ): Promise<ManagedCloudProject[]>;
  getProject(
    projectId: string,
    options?: ManagedCloudProjectsRequestOptions,
  ): Promise<ManagedCloudProject>;
  createProject(
    input: ManagedCloudProjectCreateRequest,
    options?: ManagedCloudProjectsRequestOptions,
  ): Promise<ManagedCloudProject>;
  updateProject(
    projectId: string,
    input: ManagedCloudProjectUpdateRequest,
    options?: ManagedCloudProjectsRequestOptions,
  ): Promise<ManagedCloudProject>;
  deleteProject(projectId: string, options?: ManagedCloudProjectsRequestOptions): Promise<void>;
  pullProjects(
    cursor: string,
    options?: ManagedCloudProjectsRequestOptions,
  ): Promise<ProjectsSyncPullResponse>;
  pushProjects(
    input: ProjectsSyncPushRequest,
    options?: ManagedCloudProjectsRequestOptions,
  ): Promise<ProjectsSyncPushResponse>;
}

export class ManagedCloudProjectsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ManagedCloudProjectsHttpError';
  }
}

export class ManagedCloudProjectsContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManagedCloudProjectsContractError';
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return stripTrailingSlashes(baseUrl);
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown, name: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ManagedCloudProjectsContractError(
      `Managed Cloud projects ${name} contract violation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

function parseOutput<T>(schema: z.ZodType<T>, input: unknown, name: string): T {
  return parseInput(schema, input, `${name} response`);
}

async function responseError(response: Response): Promise<ManagedCloudProjectsHttpError> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = body['error'];
  const message =
    typeof raw === 'string'
      ? raw
      : raw &&
          typeof raw === 'object' &&
          typeof (raw as Record<string, unknown>)['message'] === 'string'
        ? ((raw as Record<string, unknown>)['message'] as string)
        : `HTTP ${response.status}`;
  return new ManagedCloudProjectsHttpError(`HTTP ${response.status}: ${message}`, response.status);
}

export function createManagedCloudProjectsClient(
  config: ManagedCloudProjectsClientConfig = {},
): ManagedCloudProjectsClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl ?? '');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function requestJson(request: ManagedCloudProjectsTransportRequest): Promise<unknown> {
    if (config.requestJson) return config.requestJson(request);
    const json = request.body !== undefined;
    const mutation = request.method !== 'GET';
    const configuredHeaders = await config.getHeaders?.({
      method: request.method,
      path: request.path,
      mutation,
      json,
    });
    const headers = new Headers(configuredHeaders);
    if (json && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetchImpl(`${baseUrl}${request.path}`, {
      method: request.method,
      headers: Object.fromEntries(headers.entries()),
      credentials: config.credentials,
      body: json ? JSON.stringify(request.body) : undefined,
      signal: request.signal,
    });
    if (!response.ok) throw await responseError(response);
    return response.json().catch(() => undefined);
  }

  async function request<T>(
    transport: ManagedCloudProjectsTransportRequest,
    schema: z.ZodType<T>,
    name: string,
  ): Promise<T> {
    return parseOutput(schema, await requestJson(transport), name);
  }

  return {
    async listProjects(query = {}, options = {}) {
      const parsed = parseInput(ManagedCloudProjectListQuerySchema, query, 'list query');
      const params = new URLSearchParams();
      if (parsed.limit !== undefined) params.set('limit', String(parsed.limit));
      if (parsed.offset !== undefined) params.set('offset', String(parsed.offset));
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      const result = await request(
        {
          path: `${MANAGED_CLOUD_PROJECTS_PATH}${suffix}`,
          method: 'GET',
          signal: options.signal,
        },
        ManagedCloudProjectListResponseSchema,
        'list',
      );
      return result.projects;
    },

    async getProject(projectId, options = {}) {
      const result = await request(
        { path: managedCloudProjectPath(projectId), method: 'GET', signal: options.signal },
        ManagedCloudProjectResponseSchema,
        'get',
      );
      return result.project;
    },

    async createProject(input, options = {}) {
      const body = parseInput(ManagedCloudProjectCreateRequestSchema, input, 'create request');
      const result = await request(
        { path: MANAGED_CLOUD_PROJECTS_PATH, method: 'POST', body, signal: options.signal },
        ManagedCloudProjectResponseSchema,
        'create',
      );
      return result.project;
    },

    async updateProject(projectId, input, options = {}) {
      const body = parseInput(ManagedCloudProjectUpdateRequestSchema, input, 'update request');
      const result = await request(
        { path: managedCloudProjectPath(projectId), method: 'PUT', body, signal: options.signal },
        ManagedCloudProjectResponseSchema,
        'update',
      );
      return result.project;
    },

    async deleteProject(projectId, options = {}) {
      await request(
        { path: managedCloudProjectPath(projectId), method: 'DELETE', signal: options.signal },
        ManagedCloudProjectDeleteResponseSchema,
        'delete',
      );
    },

    async pullProjects(cursor, options = {}) {
      const parsedCursor = parseInput(ServerVersionSchema, cursor, 'sync cursor');
      return request(
        {
          path: `${MANAGED_CLOUD_PROJECTS_SYNC_PATH}?since=${encodeURIComponent(parsedCursor)}`,
          method: 'GET',
          signal: options.signal,
        },
        ProjectsSyncPullResponseSchema,
        'sync pull',
      );
    },

    async pushProjects(input, options = {}) {
      const body = parseInput(ProjectsSyncPushRequestSchema, input, 'sync push request');
      return request(
        {
          path: MANAGED_CLOUD_PROJECTS_SYNC_PATH,
          method: 'POST',
          body,
          signal: options.signal,
        },
        ProjectsSyncPushResponseSchema,
        'sync push',
      );
    },
  };
}
