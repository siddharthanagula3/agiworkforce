import { createManagedMediaIdempotencyKey } from '@agiworkforce/utils/managed-media-idempotency';
import { FREE_TRIAL_GATEWAY, getAuthToken } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';

export const VIDEO_GENERATE_PATH = '/api/media/video/generate';
export const VIDEO_STATUS_PATH = '/api/media/video/status';
export const VIDEO_POLL_INTERVAL_MS = 5_000;
export const VIDEO_POLL_TIMEOUT_MS = 5 * 60_000;

const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const UPGRADE_CODES: ReadonlySet<string> = new Set([
  'plan_upgrade_required',
  'subscription_required',
]);

export type ChromeVideoTaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'timeout';

export interface ChromeVideoTask {
  taskId: string;
  status: ChromeVideoTaskStatus;
  videoUrl?: string;
  progress?: number;
  error?: string;
}

export class ChromeVideoError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly upgradeRequired: boolean,
  ) {
    super(message);
    this.name = 'ChromeVideoError';
  }
}

export interface ChromeVideoDependencies {
  getAuthToken: typeof getAuthToken;
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  operationId: () => string;
}

const DEFAULT_DEPENDENCIES: ChromeVideoDependencies = {
  getAuthToken,
  fetchImpl: (input, init) => fetch(input, init),
  operationId: () => crypto.randomUUID(),
};

export function isChromeVideoTaskId(value: unknown): value is string {
  return typeof value === 'string' && TASK_ID_PATTERN.test(value);
}

function readTask(value: unknown): ChromeVideoTask {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const taskId = record['task_id'];
  const status = record['status'];
  if (
    !isChromeVideoTaskId(taskId) ||
    (status !== 'queued' &&
      status !== 'processing' &&
      status !== 'completed' &&
      status !== 'failed' &&
      status !== 'timeout')
  ) {
    throw new ChromeVideoError('The video service returned an unreadable answer.', null, false);
  }
  const videoUrl = record['video_url'];
  const progress = record['progress'];
  const error = record['error'];
  return {
    taskId,
    status,
    ...(typeof videoUrl === 'string' && videoUrl ? { videoUrl } : {}),
    ...(typeof progress === 'number' && Number.isFinite(progress) ? { progress } : {}),
    ...(typeof error === 'string' && error ? { error } : {}),
  };
}

async function readFailure(response: Response, fallback: string): Promise<ChromeVideoError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string | { message?: unknown; code?: unknown };
  };
  const nested = typeof body.error === 'object' && body.error !== null ? body.error : undefined;
  const message =
    (typeof nested?.message === 'string' && nested.message) ||
    (typeof body.error === 'string' && body.error) ||
    fallback;
  const code = typeof nested?.code === 'string' ? nested.code : '';
  return new ChromeVideoError(message, response.status, UPGRADE_CODES.has(code));
}

async function authorizedHeaders(deps: ChromeVideoDependencies): Promise<Record<string, string>> {
  const token = await deps.getAuthToken();
  if (!token) {
    throw new ChromeVideoError('Sign in to your AGI account to create videos.', 401, false);
  }
  return {
    Authorization: `Bearer ${token}`,
    'X-Requested-With': 'XMLHttpRequest',
    ...platformRequestHeaders(),
  };
}

export async function startChromeVideo(
  prompt: string,
  dependencies: Partial<ChromeVideoDependencies> = {},
): Promise<ChromeVideoTask> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const headers = await authorizedHeaders(deps);
  const response = await deps.fetchImpl(`${FREE_TRIAL_GATEWAY}${VIDEO_GENERATE_PATH}`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'Idempotency-Key': createManagedMediaIdempotencyKey({
        surface: 'chrome',
        operation: 'video',
        operationId: deps.operationId(),
      }),
    },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) throw await readFailure(response, 'The video could not be started.');
  return readTask(await response.json());
}

export async function readChromeVideoStatus(
  taskId: string,
  dependencies: Partial<ChromeVideoDependencies> = {},
): Promise<ChromeVideoTask> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const headers = await authorizedHeaders(deps);
  const response = await deps.fetchImpl(
    `${FREE_TRIAL_GATEWAY}${VIDEO_STATUS_PATH}?task_id=${encodeURIComponent(taskId)}`,
    { method: 'GET', headers },
  );
  if (!response.ok) throw await readFailure(response, 'The video status could not be read.');
  return readTask(await response.json());
}
