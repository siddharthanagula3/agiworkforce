import { Platform } from 'react-native';
import { requestHealthKitAccess, type HealthKitType } from './healthKitPermission';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface HealthSample {
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  value: number;
  unit: string;
  source: string;
}

export interface HealthData {
  type: HealthKitType;
  samples: HealthSample[];
}

export type HealthKitErrorCode =
  | 'not_authorized'
  | 'permission_denied'
  | 'not_available_on_platform'
  | 'query_failed';

export class HealthKitError extends Error {
  constructor(
    public readonly code: HealthKitErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HealthKitError';
  }
}

export interface QueryHealthOptions {
  type: HealthKitType;
  startDate?: string; // ISO 8601 — defaults to 7 days ago
  endDate?: string; // ISO 8601 — defaults to now
  limit?: number; // max samples, default 100
}

// ---------------------------------------------------------------------------
// Internal native module surface
// ---------------------------------------------------------------------------

interface WorkoutSampleNative {
  startDate: string;
  endDate: string;
  totalEnergyBurned?: number;
  totalDistance?: number;
  duration: number;
  sourceBundleId?: string;
  workoutActivityType?: number;
}

interface QuantitySampleNative {
  startDate: string;
  endDate: string;
  quantity: number;
  quantityType: string;
  sourceBundleId?: string;
}

interface CategorySampleNative {
  startDate: string;
  endDate: string;
  value: number;
  categoryType: string;
  sourceBundleId?: string;
}

interface HealthKitNative {
  queryWorkoutSamples: (
    unit: string,
    from: string,
    to: string,
    limit: number,
    ascending: boolean,
  ) => Promise<WorkoutSampleNative[]>;
  queryQuantitySamples: (
    identifier: string,
    unit: string,
    from: string,
    to: string,
    limit: number,
    ascending: boolean,
  ) => Promise<QuantitySampleNative[]>;
  queryCategorySamples: (
    identifier: string,
    from: string,
    to: string,
    limit: number,
    ascending: boolean,
  ) => Promise<CategorySampleNative[]>;
}

function getHealthKitModule(): HealthKitNative | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@kingstinct/react-native-healthkit') as
      | { default?: HealthKitNative }
      | HealthKitNative;
    const resolved = 'default' in mod && mod.default ? mod.default : (mod as HealthKitNative);
    return resolved ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Query type identifiers
// ---------------------------------------------------------------------------

const HK_QUANTITY_ID: Partial<Record<HealthKitType, { identifier: string; unit: string }>> = {
  steps: { identifier: 'HKQuantityTypeIdentifierStepCount', unit: 'count' },
  heart_rate: { identifier: 'HKQuantityTypeIdentifierHeartRate', unit: 'count/min' },
  active_energy: { identifier: 'HKQuantityTypeIdentifierActiveEnergyBurned', unit: 'kcal' },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function defaultDateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function queryWorkouts(
  hk: HealthKitNative,
  startDate: string,
  endDate: string,
  limit: number,
): Promise<HealthData> {
  const raw = await hk.queryWorkoutSamples('', startDate, endDate, limit, false);
  const samples: HealthSample[] = raw.map((w) => ({
    startDate: w.startDate,
    endDate: w.endDate,
    value: w.duration,
    unit: 'seconds',
    source: w.sourceBundleId ?? 'unknown',
  }));
  return { type: 'workouts', samples };
}

async function querySleep(
  hk: HealthKitNative,
  startDate: string,
  endDate: string,
  limit: number,
): Promise<HealthData> {
  const raw = await hk.queryCategorySamples(
    'HKCategoryTypeIdentifierSleepAnalysis',
    startDate,
    endDate,
    limit,
    false,
  );
  const samples: HealthSample[] = raw.map((s) => ({
    startDate: s.startDate,
    endDate: s.endDate,
    value: s.value,
    unit: 'category',
    source: s.sourceBundleId ?? 'unknown',
  }));
  return { type: 'sleep', samples };
}

async function queryQuantity(
  hk: HealthKitNative,
  type: HealthKitType,
  startDate: string,
  endDate: string,
  limit: number,
): Promise<HealthData> {
  const meta = HK_QUANTITY_ID[type];
  if (!meta) {
    throw new HealthKitError('query_failed', `No HK identifier for type: ${type}`);
  }
  const raw = await hk.queryQuantitySamples(
    meta.identifier,
    meta.unit,
    startDate,
    endDate,
    limit,
    false,
  );
  const samples: HealthSample[] = raw.map((s) => ({
    startDate: s.startDate,
    endDate: s.endDate,
    value: s.quantity,
    unit: meta.unit,
    source: s.sourceBundleId ?? 'unknown',
  }));
  return { type, samples };
}

// ---------------------------------------------------------------------------
// Tool descriptor (Anthropic function-calling schema)
// ---------------------------------------------------------------------------

/**
 * Anthropic-format tool descriptor for the on-device HealthKit query function.
 * Pass this in the `tools` array when constructing a chat request so the model
 * can invoke `query_health` to retrieve health data.
 */
export const HEALTHKIT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'query_health',
    description:
      'Query on-device HealthKit data for the user. Returns recent health samples ' +
      'of the requested type. iOS only — will throw on other platforms.',
    parameters: {
      type: 'object' as const,
      required: ['type'],
      properties: {
        type: {
          type: 'string',
          enum: ['workouts', 'sleep', 'steps', 'heart_rate', 'active_energy'] as const,
          description: 'The category of health data to retrieve.',
        },
        startDate: {
          type: 'string',
          description: 'ISO 8601 start of query window. Defaults to 7 days ago.',
        },
        endDate: {
          type: 'string',
          description: 'ISO 8601 end of query window. Defaults to now.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of samples to return. Defaults to 100.',
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Query HealthKit data on-device.
 *
 * Will request authorization for the queried type if not already granted.
 * Throws `HealthKitError` for all failure cases — callers should catch and
 * handle `code` specifically.
 *
 * iOS only. On Android throws `not_available_on_platform`.
 */
export async function queryHealth(opts: QueryHealthOptions): Promise<HealthData> {
  if (Platform.OS !== 'ios') {
    throw new HealthKitError('not_available_on_platform', 'HealthKit is iOS only');
  }

  const hk = getHealthKitModule();
  if (!hk) {
    throw new HealthKitError(
      'not_available_on_platform',
      'HealthKit native module not available — run expo prebuild',
    );
  }

  // Ensure authorization — will use cached state if already granted.
  const auth = await requestHealthKitAccess([opts.type]);
  if (!auth.granted.includes(opts.type)) {
    throw new HealthKitError(
      'permission_denied',
      `HealthKit permission denied for type: ${opts.type}`,
    );
  }

  const dates = defaultDateRange();
  const startDate = opts.startDate ?? dates.start;
  const endDate = opts.endDate ?? dates.end;
  const limit = opts.limit ?? 100;

  try {
    switch (opts.type) {
      case 'workouts':
        return await queryWorkouts(hk, startDate, endDate, limit);
      case 'sleep':
        return await querySleep(hk, startDate, endDate, limit);
      case 'steps':
      case 'heart_rate':
      case 'active_energy':
        return await queryQuantity(hk, opts.type, startDate, endDate, limit);
    }
  } catch (err) {
    if (err instanceof HealthKitError) throw err;
    throw new HealthKitError(
      'query_failed',
      `HealthKit query failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
