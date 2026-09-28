import {
  createManagedCloudSchedulesClient,
  ManagedCloudScheduleMutationSchema,
  ManagedCloudScheduleResponseSchema,
  ManagedCloudSchedulesHttpError,
  MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE,
  managedCloudSchedulePath,
  type ManagedCloudScheduleMutation,
  type ManagedCloudScheduleRun,
  type ManagedCloudScheduleRunApproval,
  type ManagedCloudSchedulesClient,
  type ManagedCloudScheduleTask,
} from '@agiworkforce/cloud-contracts';
import { FREE_TRIAL_GATEWAY, getAuthToken } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';

export const CHROME_SCHEDULE_PAGE_SIZE = MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE;

export interface ChromeSchedulesDependencies {
  getAuthToken: typeof getAuthToken;
  createClient: (token: string) => ManagedCloudSchedulesClient;
  newIdempotencyKey: () => string;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}

export type ChromeScheduleDetails = Pick<
  ManagedCloudScheduleMutation,
  'name' | 'description' | 'prompt'
>;

const ScheduleDetailsSchema = ManagedCloudScheduleMutationSchema.pick({
  name: true,
  description: true,
  prompt: true,
});

export type ChromeSchedulesErrorCode = 'auth_required' | 'cancelled' | 'server_error';

export interface ChromeSchedulesError {
  status: 'error';
  code: ChromeSchedulesErrorCode;
  message: string;
}

export type ChromeScheduleListResult =
  { status: 'success'; schedules: ManagedCloudScheduleTask[] } | ChromeSchedulesError;

export type ChromeScheduleResult =
  { status: 'success'; schedule: ManagedCloudScheduleTask } | ChromeSchedulesError;

export type ChromeScheduleRunResult = { status: 'success'; replay: boolean } | ChromeSchedulesError;

export type ChromeScheduleDeleteResult = { status: 'success' } | ChromeSchedulesError;

export type ChromeScheduleApprovalResult =
  { status: 'success'; run: ManagedCloudScheduleRun | null } | ChromeSchedulesError;

export type ChromeScheduleRunsResult =
  { status: 'success'; runs: ManagedCloudScheduleRun[]; hasMore: boolean } | ChromeSchedulesError;

function scheduleHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...platformRequestHeaders(),
  };
}

function createDefaultClient(token: string): ManagedCloudSchedulesClient {
  return createManagedCloudSchedulesClient({
    baseUrl: FREE_TRIAL_GATEWAY,
    getHeaders: () => scheduleHeaders(token),
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

export async function createChromeSchedule(
  input: ManagedCloudScheduleMutation,
  options: { signal?: AbortSignal } = {},
  dependencies: Partial<ChromeSchedulesDependencies> = {},
): Promise<ChromeScheduleResult> {
  const result = await withSchedulesClient(dependencies, options.signal, (client) =>
    client.createSchedule(input, options.signal),
  );
  if (result.status === 'error') return result;
  return { status: 'success', schedule: result.value };
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

export async function deleteChromeSchedule(
  scheduleId: string,
  options: { signal?: AbortSignal } = {},
  dependencies: Partial<ChromeSchedulesDependencies> = {},
): Promise<ChromeScheduleDeleteResult> {
  const result = await withSchedulesClient(dependencies, options.signal, (client) =>
    client.deleteSchedule(scheduleId, options.signal),
  );
  if (result.status === 'error') return result;
  return { status: 'success' };
}

async function scheduleRequestFailure(response: Response): Promise<ManagedCloudSchedulesHttpError> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const error = body['error'];
  const message =
    error && typeof error === 'object' ? (error as Record<string, unknown>)['message'] : error;
  return new ManagedCloudSchedulesHttpError(
    typeof message === 'string' && message.trim()
      ? message.trim()
      : `Request failed (${response.status}).`,
    response.status,
  );
}

export async function updateChromeScheduleDetails(
  scheduleId: string,
  details: ChromeScheduleDetails,
  options: { signal?: AbortSignal } = {},
  dependencies: Partial<ChromeSchedulesDependencies> = {},
): Promise<ChromeScheduleResult> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const body = ScheduleDetailsSchema.safeParse(details);
  if (!body.success) {
    return {
      status: 'error',
      code: 'server_error',
      message: 'A schedule needs a name and instructions.',
    };
  }
  const fetchImpl: NonNullable<ChromeSchedulesDependencies['fetchImpl']> =
    deps.fetchImpl ?? ((input, init) => fetch(input, init));
  try {
    const token = await deps.getAuthToken();
    if (!token) return signedOut();
    const response = await fetchImpl(
      `${FREE_TRIAL_GATEWAY}${managedCloudSchedulePath(scheduleId)}`,
      {
        method: 'PUT',
        headers: { ...scheduleHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(body.data),
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
    if (!response.ok) throw await scheduleRequestFailure(response);
    const parsed = ManagedCloudScheduleResponseSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    if (!parsed.success) {
      return {
        status: 'error',
        code: 'server_error',
        message: 'Schedules returned an unreadable answer. Refresh and try again.',
      };
    }
    return { status: 'success', schedule: parsed.data.schedule };
  } catch (error) {
    return describeSchedulesFailure(error, options.signal);
  }
}

export async function listChromeScheduleRuns(
  scheduleId: string,
  options: { signal?: AbortSignal } = {},
  dependencies: Partial<ChromeSchedulesDependencies> = {},
): Promise<ChromeScheduleRunsResult> {
  const result = await withSchedulesClient(dependencies, options.signal, (client) =>
    client.listRuns(scheduleId, {
      limit: CHROME_SCHEDULE_PAGE_SIZE,
      offset: 0,
      ...(options.signal ? { signal: options.signal } : {}),
    }),
  );
  if (result.status === 'error') return result;
  return { status: 'success', runs: result.value.runs, hasMore: result.value.hasMore };
}

export async function readChromeScheduleApproval(
  scheduleId: string,
  options: { signal?: AbortSignal } = {},
  dependencies: Partial<ChromeSchedulesDependencies> = {},
): Promise<ChromeScheduleApprovalResult> {
  const result = await withSchedulesClient(dependencies, options.signal, (client) =>
    client.listRuns(scheduleId, {
      limit: CHROME_SCHEDULE_PAGE_SIZE,
      offset: 0,
      ...(options.signal ? { signal: options.signal } : {}),
    }),
  );
  if (result.status === 'error') return result;
  return {
    status: 'success',
    run:
      result.value.runs.find(
        (run) => run.status === 'awaiting_approval' && Boolean(run.pendingApproval),
      ) ?? null,
  };
}

export async function resolveChromeScheduleApproval(
  scheduleId: string,
  runId: string,
  approval: ManagedCloudScheduleRunApproval,
  options: { signal?: AbortSignal } = {},
  dependencies: Partial<ChromeSchedulesDependencies> = {},
): Promise<ChromeScheduleApprovalResult> {
  const result = await withSchedulesClient(dependencies, options.signal, (client) =>
    client.resolveRunApproval(scheduleId, runId, approval, options.signal),
  );
  if (result.status === 'error') return result;
  return { status: 'success', run: result.value };
}
