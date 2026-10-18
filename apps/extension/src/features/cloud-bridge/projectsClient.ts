import {
  createManagedCloudProjectsClient,
  listAllManagedCloudProjects,
  ManagedCloudProjectsHttpError,
  type ManagedCloudProject,
  type ManagedCloudProjectsClient,
} from '@agiworkforce/cloud-contracts';
import { FREE_TRIAL_GATEWAY, getAuthToken } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';

export interface ChromeProjectsDependencies {
  getAuthToken: typeof getAuthToken;
  createProjectsClient: (token: string) => ManagedCloudProjectsClient;
}

export type ChromeProjectsErrorCode =
  'auth_required' | 'cancelled' | 'invalid_request' | 'server_error';

export interface ChromeProjectsError {
  status: 'error';
  code: ChromeProjectsErrorCode;
  message: string;
}

export type ChromeProjectListResult =
  { status: 'success'; projects: ManagedCloudProject[] } | ChromeProjectsError;

function surfaceHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-Requested-With': 'XMLHttpRequest',
    ...platformRequestHeaders(),
  };
}

function createDefaultProjectsClient(token: string): ManagedCloudProjectsClient {
  return createManagedCloudProjectsClient({
    baseUrl: FREE_TRIAL_GATEWAY,
    getHeaders: () => surfaceHeaders(token),
  });
}

const DEFAULT_DEPENDENCIES: ChromeProjectsDependencies = {
  getAuthToken,
  createProjectsClient: createDefaultProjectsClient,
};

const SIGNED_OUT_MESSAGE = 'Sign in to your AGI account to use projects.';

function signedOut(): ChromeProjectsError {
  return { status: 'error', code: 'auth_required', message: SIGNED_OUT_MESSAGE };
}

export function describeProjectsFailure(error: unknown, signal?: AbortSignal): ChromeProjectsError {
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return { status: 'error', code: 'cancelled', message: 'Cancelled.' };
  }
  const status = error instanceof ManagedCloudProjectsHttpError ? error.status : null;
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
    listAllManagedCloudProjects(client, options.signal ? { signal: options.signal } : {}),
  );
  if (result.status === 'error') return result;
  return {
    status: 'success',
    projects: result.value.filter((project) => project.isArchived !== true),
  };
}
