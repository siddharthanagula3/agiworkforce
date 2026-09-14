import {
  createManagedCloudChatClient,
  createManagedCloudProjectsClient,
  ManagedCloudChatHttpError,
  ManagedCloudProjectsHttpError,
  type ManagedCloudChatClient,
  type ManagedCloudProject,
  type ManagedCloudProjectCreateRequest,
  type ManagedCloudProjectsClient,
} from '@agiworkforce/cloud-contracts';
import { FREE_TRIAL_GATEWAY, getAuthToken } from './freeTrialClient';

export const CHROME_PROJECT_PAGE_SIZE = 50;
export const CHROME_PROJECT_CONVERSATION_PAGE_SIZE = 10;
export const CHROME_PROJECT_NAME_MAX_CHARS = 200;
export const CHROME_PROJECT_INSTRUCTIONS_MAX_CHARS = 10_000;

export interface ChromeProjectConversation {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ChromeProjectsDependencies {
  getAuthToken: typeof getAuthToken;
  createProjectsClient: (token: string) => ManagedCloudProjectsClient;
  createChatClient: (token: string) => ManagedCloudChatClient;
}

export type ChromeProjectsErrorCode =
  | 'auth_required'
  | 'cancelled'
  | 'invalid_request'
  | 'server_error';

export interface ChromeProjectsError {
  status: 'error';
  code: ChromeProjectsErrorCode;
  message: string;
}

export type ChromeProjectListResult =
  | { status: 'success'; projects: ManagedCloudProject[] }
  | ChromeProjectsError;

export type ChromeProjectResult =
  | { status: 'success'; project: ManagedCloudProject }
  | ChromeProjectsError;

export type ChromeProjectWriteResult = { status: 'success' } | ChromeProjectsError;

export type ChromeProjectConversationsResult =
  | { status: 'success'; conversations: ChromeProjectConversation[] }
  | ChromeProjectsError;

function surfaceHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-Requested-With': 'XMLHttpRequest',
    'X-AGI-Surface': 'chrome',
  };
}

function createDefaultProjectsClient(token: string): ManagedCloudProjectsClient {
  return createManagedCloudProjectsClient({
    baseUrl: FREE_TRIAL_GATEWAY,
    getHeaders: () => surfaceHeaders(token),
  });
}

function createDefaultChatClient(token: string): ManagedCloudChatClient {
  return createManagedCloudChatClient({
    baseUrl: FREE_TRIAL_GATEWAY,
    getAuthToken: async () => token,
    decorateMutationHeaders: (headers) => ({
      ...headers,
      'X-Requested-With': 'XMLHttpRequest',
      'X-AGI-Surface': 'chrome',
    }),
  });
}

const DEFAULT_DEPENDENCIES: ChromeProjectsDependencies = {
  getAuthToken,
  createProjectsClient: createDefaultProjectsClient,
  createChatClient: createDefaultChatClient,
};

const SIGNED_OUT_MESSAGE = 'Sign in to your AGI account to use projects.';

function signedOut(): ChromeProjectsError {
  return { status: 'error', code: 'auth_required', message: SIGNED_OUT_MESSAGE };
}

export function describeProjectsFailure(error: unknown, signal?: AbortSignal): ChromeProjectsError {
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return { status: 'error', code: 'cancelled', message: 'Cancelled.' };
  }
  const status =
    error instanceof ManagedCloudProjectsHttpError || error instanceof ManagedCloudChatHttpError
      ? error.status
      : null;
  if (status === 401 || status === 403) return signedOut();
  if (status === 400 || status === 422) {
    return {
      status: 'error',
      code: 'invalid_request',
      message: error instanceof Error ? error.message : 'That project could not be saved.',
    };
  }
  return {
    status: 'error',
    code: 'server_error',
    message: error instanceof Error ? error.message : 'Projects are unavailable right now.',
  };
}

async function withProjectsClient<T>(
  dependencies: Partial<ChromeProjectsDependencies>,
  signal: AbortSignal | undefined,
  run: (client: ManagedCloudProjectsClient) => Promise<T>,
): Promise<{ status: 'success'; value: T } | ChromeProjectsError> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  try {
    const token = await deps.getAuthToken();
    if (!token) return signedOut();
    return { status: 'success', value: await run(deps.createProjectsClient(token)) };
  } catch (error) {
    return describeProjectsFailure(error, signal);
  }
}

export async function listChromeProjects(
  options: { signal?: AbortSignal } = {},
  dependencies: Partial<ChromeProjectsDependencies> = {},
): Promise<ChromeProjectListResult> {
  const result = await withProjectsClient(dependencies, options.signal, (client) =>
    client.listProjects(
      { limit: CHROME_PROJECT_PAGE_SIZE },
      options.signal ? { signal: options.signal } : {},
    ),
  );
  if (result.status === 'error') return result;
  return {
    status: 'success',
    projects: result.value.filter((project) => project.isArchived !== true),
  };
}

export async function createChromeProject(
  input: { name: string; instructions?: string; signal?: AbortSignal },
  dependencies: Partial<ChromeProjectsDependencies> = {},
): Promise<ChromeProjectResult> {
  const name = input.name.trim().slice(0, CHROME_PROJECT_NAME_MAX_CHARS);
  if (!name) {
    return { status: 'error', code: 'invalid_request', message: 'A project needs a name.' };
  }
  const instructions = input.instructions?.trim().slice(0, CHROME_PROJECT_INSTRUCTIONS_MAX_CHARS);
  const body: ManagedCloudProjectCreateRequest = {
    name,
    ...(instructions ? { instructions } : {}),
  };
  const result = await withProjectsClient(dependencies, input.signal, (client) =>
    client.createProject(body, input.signal ? { signal: input.signal } : {}),
  );
  if (result.status === 'error') return result;
  return { status: 'success', project: result.value };
}

export async function deleteChromeProject(
  projectId: string,
  options: { signal?: AbortSignal } = {},
  dependencies: Partial<ChromeProjectsDependencies> = {},
): Promise<ChromeProjectWriteResult> {
  if (!projectId.trim()) {
    return { status: 'error', code: 'invalid_request', message: 'A project id is required.' };
  }
  const result = await withProjectsClient(dependencies, options.signal, (client) =>
    client.deleteProject(projectId, options.signal ? { signal: options.signal } : {}),
  );
  if (result.status === 'error') return result;
  return { status: 'success' };
}

export async function listChromeProjectConversations(
  projectId: string,
  options: { signal?: AbortSignal } = {},
  dependencies: Partial<ChromeProjectsDependencies> = {},
): Promise<ChromeProjectConversationsResult> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  try {
    const token = await deps.getAuthToken();
    if (!token) return signedOut();
    const page = await deps.createChatClient(token).listConversations(
      {
        projectId,
        limit: CHROME_PROJECT_CONVERSATION_PAGE_SIZE,
        archived: 'exclude',
      },
      options.signal ? { signal: options.signal } : {},
    );
    return {
      status: 'success',
      conversations: page.conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
      })),
    };
  } catch (error) {
    return describeProjectsFailure(error, options.signal);
  }
}
