import {
  ManagedCloudEventTriggerCreatedResponseSchema,
  ManagedCloudEventTriggerListResponseSchema,
  ManagedCloudEventTriggerResponseSchema,
  MANAGED_CLOUD_TRIGGERS_PATH,
  managedCloudTriggerPath,
  managedCloudTriggersForTaskPath,
  managedCloudTriggerWatchPath,
  type ManagedCloudEventTrigger,
  type ManagedCloudEventTriggerCreated,
  type ManagedCloudEventTriggerInput,
  type ManagedCloudScheduleFieldCondition,
} from '@agiworkforce/cloud-contracts';
import { CLOUD_API_BASE_URL } from './cloudApi';
import { createManagedCloudRequestContext } from '../services/managedCloudRequestContext';

function readApiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fallback;
  const record = body as Record<string, unknown>;
  const nested = record['error'];
  if (typeof nested === 'string') return nested;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const message = (nested as Record<string, unknown>)['message'];
    if (typeof message === 'string') return message;
  }
  if (typeof record['message'] === 'string') return record['message'];
  return fallback;
}

async function requestJson(
  label: string,
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown },
  fallbackError: string,
): Promise<unknown> {
  const request = createManagedCloudRequestContext(label);
  const headers = await request.getHeaders();
  const res = await request.fetch(`${CLOUD_API_BASE_URL}${path}`, {
    method: init.method,
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const payload: unknown = await res.json().catch(() => null);
  request.assertBoundary();
  if (!res.ok) throw new Error(readApiError(payload, `${fallbackError} (HTTP ${res.status})`));
  return payload;
}

function parseOrThrow<T>(
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error('The cloud trigger service returned an invalid response.');
  return parsed.data;
}

export async function listTaskTriggers(taskId: string): Promise<ManagedCloudEventTrigger[]> {
  const payload = await requestJson(
    'Cloud triggers',
    managedCloudTriggersForTaskPath(taskId),
    { method: 'GET' },
    'The triggers for this schedule could not be read',
  );
  return parseOrThrow(ManagedCloudEventTriggerListResponseSchema, payload).triggers;
}

export async function createTaskTrigger(
  input: ManagedCloudEventTriggerInput,
): Promise<ManagedCloudEventTriggerCreated> {
  const payload = await requestJson(
    'Cloud trigger creation',
    MANAGED_CLOUD_TRIGGERS_PATH,
    { method: 'POST', body: input },
    'That trigger could not be added',
  );
  return parseOrThrow(ManagedCloudEventTriggerCreatedResponseSchema, payload);
}

export async function updateTaskTrigger(
  triggerId: string,
  patch: { isEnabled?: boolean; conditions?: ManagedCloudScheduleFieldCondition[] },
): Promise<ManagedCloudEventTrigger> {
  const payload = await requestJson(
    'Cloud trigger update',
    managedCloudTriggerPath(triggerId),
    { method: 'PATCH', body: patch },
    'That trigger could not be changed',
  );
  return parseOrThrow(ManagedCloudEventTriggerResponseSchema, payload).trigger;
}

export async function deleteTaskTrigger(triggerId: string): Promise<void> {
  await requestJson(
    'Cloud trigger deletion',
    managedCloudTriggerPath(triggerId),
    { method: 'DELETE' },
    'That trigger could not be deleted',
  );
}

export async function registerTaskTriggerWatch(
  triggerId: string,
): Promise<ManagedCloudEventTrigger> {
  const payload = await requestJson(
    'Cloud trigger mailbox watch',
    managedCloudTriggerWatchPath(triggerId),
    { method: 'POST' },
    'The mailbox watch could not be registered',
  );
  return parseOrThrow(ManagedCloudEventTriggerResponseSchema, payload).trigger;
}
