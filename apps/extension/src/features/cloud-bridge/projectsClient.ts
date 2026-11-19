import {
  createManagedCloudProjectsClient,
  listAllManagedCloudProjects,
  ManagedCloudProjectsHttpError,
  type ManagedCloudProject,
  type ManagedCloudProjectsClient,
} from '@agiworkforce/cloud-contracts';
import { FREE_TRIAL_GATEWAY, getAuthToken } from './freeTrialClient';
import {
  captureCloudRefusals,
  classifyCloudRefusal,
  describeCloudRefusal,
  type CloudRefusal,
} from './cloudRefusal';
import { platformRequestHeaders } from '../../platformHeaders';

type ProjectsFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ChromeProjectsDependencies {
  getAuthToken: typeof getAuthToken;
  createProjectsClient: (token: string, fetchImpl?: ProjectsFetch) => ManagedCloudProjectsClient;
  fetchImpl?: ProjectsFetch;
}

export type ChromeProjectsErrorCode =
  | 'auth_required'
  | 'plan_required'
  | 'policy_blocked'
  | 'unavailable'
  | 'refused'
  | 'cancelled'
  | 'invalid_request'
  | 'server_error';

export interface ChromeProjectsError {
  status: 'error';
  code: ChromeProjectsErrorCode;
  message: string;
  retryAfterSeconds?: number;
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

function createDefaultProjectsClient(
  token: string,
  fetchImpl?: ProjectsFetch,
): ManagedCloudProjectsClient {
  return createManagedCloudProjectsClient({
    baseUrl: FREE_TRIAL_GATEWAY,
    getHeaders: () => surfaceHeaders(token),
    ...(fetchImpl ? { fetchImpl } : {}),
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

const PROJECTS_REFUSAL_COPY = {
  refused: 'Projects are not available for this account.',
  unavailable: 'Projects are temporarily unavailable.',
  limitUnit: 'requests',
};

function projectsHttpMessage(error: ManagedCloudProjectsHttpError): string {
  return error.message.replace(/^HTTP \d{3}: /u, '').trim();
}

export function describeProjectsFailure(
  error: unknown,
  signal?: AbortSignal,
  captured?: CloudRefusal | null,
): ChromeProjectsError {
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return { status: 'error', code: 'cancelled', message: 'Cancelled.' };
  }
  const refusal =
    error instanceof ManagedCloudProjectsHttpError
      ? captured?.status === error.status
        ? captured
        : classifyCloudRefusal(error.status, {})
      : null;
  if (refusal) {
    const message = describeCloudRefusal(refusal, PROJECTS_REFUSAL_COPY);
    switch (refusal.kind) {
      case 'auth':
        return signedOut();
      case 'plan':
        return { status: 'error', code: 'plan_required', message };
      case 'policy':
        return { status: 'error', code: 'policy_blocked', message };
      case 'unavailable':
      case 'rate_limited':
        return {
          status: 'error',
          code: 'unavailable',
          message,
          ...(refusal.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: refusal.retryAfterSeconds }
            : {}),
        };
      case 'account':
      case 'refused':
        return { status: 'error', code: 'refused', message };
      case 'invalid':
        return {
          status: 'error',
          code: 'invalid_request',
          message: refusal.message ?? projectsHttpMessage(error as ManagedCloudProjectsHttpError),
        };
      default:
        break;
    }
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
  const capture = captureCloudRefusals(deps.fetchImpl);
  try {
    const token = await deps.getAuthToken();
    if (!token) return signedOut();
    return { status: 'success', value: await run(deps.createProjectsClient(token, capture.fetch)) };
  } catch (error) {
    return describeProjectsFailure(error, signal, capture.last);
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
