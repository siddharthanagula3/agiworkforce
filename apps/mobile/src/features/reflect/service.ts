import {
  MANAGED_CLOUD_REFLECT_PATH,
  ManagedCloudReflectRecapSchema,
  type ManagedCloudReflectRange,
  type ManagedCloudReflectRecap,
} from '@agiworkforce/cloud-contracts';

import { ApiHttpError, api } from '@/services/api';

export type ReflectRange = ManagedCloudReflectRange;
export type ReflectRecap = ManagedCloudReflectRecap;

export const REFLECT_RANGES: ReadonlyArray<{ value: ReflectRange; label: string }> = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '3 months' },
  { value: '180d', label: '6 months' },
  { value: '365d', label: '1 year' },
];

export class ReflectMemoryRequiredError extends Error {
  constructor() {
    super('Reflect needs memory turned on.');
    this.name = 'ReflectMemoryRequiredError';
  }
}

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function isMemoryRequired(error: unknown): boolean {
  return error instanceof ApiHttpError && error.status === 409 && error.code === 'memory_required';
}

export async function fetchReflectRecap(
  range: ReflectRange,
  signal?: AbortSignal,
): Promise<ReflectRecap> {
  const query = new URLSearchParams({ range, timezone: deviceTimezone() });
  try {
    return ManagedCloudReflectRecapSchema.parse(
      await api.get<unknown>(
        `${MANAGED_CLOUD_REFLECT_PATH}?${query.toString()}`,
        signal ? { signal } : undefined,
      ),
    );
  } catch (error) {
    if (isMemoryRequired(error)) throw new ReflectMemoryRequiredError();
    throw error;
  }
}
