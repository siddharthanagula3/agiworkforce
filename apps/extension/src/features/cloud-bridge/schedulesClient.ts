import {
  createManagedCloudSchedulesClient,
  ManagedCloudSchedulesHttpError,
  MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE,
  type ManagedCloudSchedulesClient,
  type ManagedCloudScheduleTask,
} from '@agiworkforce/cloud-contracts';
import { FREE_TRIAL_GATEWAY, getAuthToken } from './freeTrialClient';

export const CHROME_SCHEDULE_PAGE_SIZE = MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE;

export interface ChromeSchedulesDependencies {
  getAuthToken: typeof getAuthToken;
  createClient: (token: string) => ManagedCloudSchedulesClient;
  newIdempotencyKey: () => string;
}

export type ChromeSchedulesErrorCode = 'auth_required' | 'cancelled' | 'server_error';

export interface ChromeSchedulesError {
  status: 'error';
  code: ChromeSchedulesErrorCode;
  message: string;
}

export type ChromeScheduleListResult =
  | { status: 'success'; schedules: ManagedCloudScheduleTask[] }
  | ChromeSchedulesError;

export type ChromeScheduleResult =
  | { status: 'success'; schedule: ManagedCloudScheduleTask }
  | ChromeSchedulesError;

export type ChromeScheduleRunResult = { status: 'success'; replay: boolean } | ChromeSchedulesError;

function createDefaultClient(token: string): ManagedCloudSchedulesClient {
  return createManagedCloudSchedulesClient({
    baseUrl: FREE_TRIAL_GATEWAY,
    getHeaders: () => ({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-AGI-Surface': 'chrome',
    }),
  });
}

const DEFAULT_DEPENDENCIES: ChromeSchedulesDependencies = {
  getAuthToken,
  createClient: createDefaultClient,
  newIdempotencyKey: () => crypto.randomUUID(),
};

function signedOut(): ChromeSchedulesError {
  return {
    status: 'error',
    code: 'auth_required',
    message: 'Sign in to your AGI account to use schedules.',
  };
}

export function describeSchedulesFailure(
  error: unknown,
  signal?: AbortSignal,
): ChromeSchedulesError {
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return { status: 'error', code: 'cancelled', message: 'Cancelled.' };
  }
  const status = error instanceof ManagedCloudSchedulesHttpError ? error.status : null;
  if (status === 401 || status === 403) return signedOut();
  return {
    status: 'error',
    code: 'server_error',
    message: error instanceof Error ? error.message : 'Schedules are unavailable right now.',
  };
}

async function withSchedulesClient<T>(
  dependencies: Partial<ChromeSchedulesDependencies>,
  signal: AbortSignal | undefined,
  run: (client: ManagedCloudSchedulesClient, deps: ChromeSchedulesDependencies) => Promise<T>,
): Promise<{ status: 'success'; value: T } | ChromeSchedulesError> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  try {
    const token = await deps.getAuthToken();
    if (!token) return signedOut();
    return { status: 'success', value: await run(deps.createClient(token), deps) };
  } catch (error) {
    return describeSchedulesFailure(error, signal);
  }
}

export async function listChromeSchedules(
  options: { signal?: AbortSignal } = {},
  dependencies: Partial<ChromeSchedulesDependencies> = {},
): Promise<ChromeScheduleListResult> {
  const result = await withSchedulesClient(dependencies, options.signal, (client) =>
    client.listSchedules({
      limit: CHROME_SCHEDULE_PAGE_SIZE,
      offset: 0,
      ...(options.signal ? { signal: options.signal } : {}),
    }),
  );
  if (result.status === 'error') return result;
  return { status: 'success', schedules: result.value.schedules };
}

export async function setChromeScheduleEnabled(
  scheduleId: string,
  isActive: boolean,
  options: { signal?: AbortSignal } = {},
  dependencies: Partial<ChromeSchedulesDependencies> = {},
): Promise<ChromeScheduleResult> {
  const result = await withSchedulesClient(dependencies, options.signal, (client) =>
    client.setScheduleEnabled(scheduleId, isActive, options.signal),
  );
  if (result.status === 'error') return result;
  return { status: 'success', schedule: result.value };
}

export async function runChromeScheduleNow(
  scheduleId: string,
  options: { signal?: AbortSignal } = {},
  dependencies: Partial<ChromeSchedulesDependencies> = {},
): Promise<ChromeScheduleRunResult> {
  const result = await withSchedulesClient(dependencies, options.signal, (client, deps) =>
    client.runNow(scheduleId, deps.newIdempotencyKey(), options.signal),
  );
  if (result.status === 'error') return result;
  return { status: 'success', replay: result.value.replay };
}
