import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type DataPoint,
} from '@opentelemetry/sdk-metrics';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  recordSettledProviderCost: vi.fn(async () => undefined),
}));

import {
  MEDIA_METRIC_NAME,
  mediaJobDiagnostics,
  recordMediaSafety,
  resetMediaInstrumentCache,
  withMediaAttemptSpan,
  withMediaJobSpan,
} from './media-telemetry';
import { METRIC_NAME } from './metrics';
import { resetDeploymentAttributesCache } from './attributes';
import {
  claimImageGenerationJobAttempt,
  completeImageGenerationJob,
} from '@/lib/server/image-generation-jobs';
import {
  claimVideoGenerationJob,
  nudgeVideoGenerationJobFromProviderEvent,
} from '@/lib/server/video-generation-jobs';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const ASSET_ID = '22222222-2222-4222-8222-222222222222';
const STARTED_AT = '2026-09-17T00:00:00.000Z';
const SETTLED_AT = '2026-09-17T00:00:12.000Z';

let reader: PeriodicExportingMetricReader;
let provider: MeterProvider;

afterAll(() => {
  metrics.disable();
});

beforeEach(() => {
  metrics.disable();
  resetMediaInstrumentCache();
  resetDeploymentAttributesCache();
  reader = new PeriodicExportingMetricReader({
    exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
    exportIntervalMillis: 60_000,
  });
  provider = new MeterProvider({ readers: [reader] });
  metrics.setGlobalMeterProvider(provider);
});

afterEach(async () => {
  await provider.shutdown();
});

type Point = DataPoint<unknown>;

async function points(name: string): Promise<Point[]> {
  const { resourceMetrics } = await reader.collect();
  return resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .filter((metric) => metric.descriptor.name === name)
    .flatMap((metric) => metric.dataPoints as Point[]);
}

function imageRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: JOB_ID,
    user_id: 'user-1',
    organization_id: null,
    conversation_id: null,
    idempotency_key: 'agi.media.web.image.operation-123',
    request_hash: 'a'.repeat(64),
    billing_lease_token: 'lease-image',
    provider: 'openai',
    model: 'catalog-image-model',
    operation: 'generate',
    prompt: 'a sunset',
    plan: { aspectRatio: '1:1', quality: 'standard', legacySize: '1024x1024' },
    source_image_sha256: null,
    mask_image_sha256: null,
    image_count: 1,
    source_surface: 'web',
    estimated_cost_microusd: 8000,
    actual_cost_microusd: null,
    status: 'processing',
    attempts: 1,
    max_attempts: 3,
    attempt_started_at: STARTED_AT,
    retryable: false,
    public_error: null,
    cancel_requested_at: null,
    billing_outcome: null,
    billing_settlement_status: null,
    next_attempt_at: STARTED_AT,
    claim_token: 'claim-1',
    claim_expires_at: SETTLED_AT,
    created_at: STARTED_AT,
    updated_at: STARTED_AT,
    terminal_at: null,
    ...overrides,
  };
}

function videoRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: JOB_ID,
    user_id: 'user-1',
    organization_id: null,
    conversation_id: null,
    assistant_message_id: null,
    idempotency_key: 'agi.media.web.video.operation-123',
    request_hash: 'b'.repeat(64),
    billing_lease_token: 'lease-video',
    provider: 'runway',
    model: 'catalog-video-model',
    workflow_run_id: null,
    provider_task_id: 'task-1',
    provider_failure_code: null,
    prompt: 'a sunset',
    duration_secs: 5,
    resolution: '720p',
    aspect_ratio: '16:9',
    generate_audio: false,
    source_surface: 'web',
    estimated_cost_cents: 100,
    actual_cost_cents: null,
    estimated_duration_secs: 30,
    status: 'processing',
    provider_started_at: STARTED_AT,
    cancel_requested_at: null,
    provider_cancel_attempted_at: null,
    provider_cancel_acknowledged_at: null,
    cancel_attempts: 0,
    cancel_last_error: null,
    progress: 10,
    asset_id: null,
    public_error: null,
    billing_outcome: null,
    billing_settlement_status: null,
    incident_alert_status: null,
    incident_alert_attempts: 0,
    incident_alert_last_error: null,
    incident_alert_claim_token: null,
    incident_alert_claim_expires_at: null,
    reconcile_failures: 0,
    next_attempt_at: STARTED_AT,
    reconcile_claim_token: 'claim-1',
    reconcile_claim_expires_at: SETTLED_AT,
    created_at: STARTED_AT,
    updated_at: STARTED_AT,
    terminal_at: null,
    ...overrides,
  };
}

function dbReturning(rows: Array<Record<string, unknown>>) {
  return {
    query: vi.fn(async () => rows),
    execute: vi.fn(async () => undefined),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        query: vi.fn(async () => rows),
        execute: vi.fn(async () => undefined),
      }),
    ),
  } as never;
}

function attributeOf(point: Point | undefined, key: string): unknown {
  return point?.attributes[key];
}

describe('media job spans', () => {
  it('emits a job-trace span per generation request', async () => {
    await withMediaJobSpan({ media: 'image', provider: 'openai' }, async (span) => {
      expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    const spans = await points(METRIC_NAME.spanCount);
    const generation = spans.find(
      (point) => point.attributes['span.name'] === 'media.image.generate',
    );
    expect(generation?.value).toBe(1);
    expect(attributeOf(generation, 'span.status')).toBe('ok');
  });

  it('emits an attempt span per reconciliation attempt and marks a failed one', async () => {
    await withMediaAttemptSpan({ media: 'video', jobId: JOB_ID, attempt: 2 }, () => undefined);
    await expect(
      withMediaAttemptSpan({ media: 'video', jobId: JOB_ID, attempt: 3 }, () => {
        throw new Error('provider timed out');
      }),
    ).rejects.toThrow('provider timed out');

    const spans = (await points(METRIC_NAME.spanCount)).filter(
      (point) => point.attributes['span.name'] === 'media.video.attempt',
    );
    expect(spans.map((point) => point.attributes['span.status']).sort()).toEqual(['error', 'ok']);
  });
});

describe('image job metrics', () => {
  it('counts a claim as a poll and an attempt start', async () => {
    const claimed = await claimImageGenerationJobAttempt({
      db: dbReturning([imageRow()]),
      jobId: JOB_ID,
      userId: 'user-1',
      claimToken: 'claim-1',
    });
    expect(claimed?.id).toBe(JOB_ID);

    const polls = await points(MEDIA_METRIC_NAME.polls);
    expect(attributeOf(polls[0], 'media.outcome')).toBe('claimed');
    expect(attributeOf(polls[0], 'media.kind')).toBe('image');

    const attempts = await points(MEDIA_METRIC_NAME.attempts);
    expect(attributeOf(attempts[0], 'media.outcome')).toBe('started');
    expect(attributeOf(attempts[0], 'media.attempt')).toBe(1);
  });

  it('counts a lost claim as a pending poll and starts no attempt', async () => {
    const claimed = await claimImageGenerationJobAttempt({
      db: dbReturning([]),
      jobId: JOB_ID,
      userId: 'user-1',
      claimToken: 'claim-1',
    });
    expect(claimed).toBeNull();

    const polls = await points(MEDIA_METRIC_NAME.polls);
    expect(attributeOf(polls[0], 'media.outcome')).toBe('pending');
    expect(await points(MEDIA_METRIC_NAME.attempts)).toHaveLength(0);
  });

  it('records generation latency when the job is completed', async () => {
    await completeImageGenerationJob({
      db: dbReturning([imageRow({ status: 'completed', terminal_at: SETTLED_AT })]),
      jobId: JOB_ID,
      claimToken: 'claim-1',
      assetIds: [ASSET_ID],
      actualCostMicrousd: 8000,
      billingSettlementStatus: 'succeeded',
    });

    const durations = await points(MEDIA_METRIC_NAME.generationDuration);
    expect(durations).toHaveLength(1);
    expect((durations[0]?.value as { sum: number }).sum).toBe(12_000);
    expect(attributeOf(durations[0], 'media.outcome')).toBe('completed');
    expect(attributeOf(durations[0], 'media.provider')).toBe('openai');
  });
});

describe('video job metrics', () => {
  it('counts a reconciliation claim as a poll', async () => {
    await claimVideoGenerationJob({
      db: dbReturning([videoRow()]),
      jobId: JOB_ID,
      claimToken: 'claim-1',
    });

    const polls = await points(MEDIA_METRIC_NAME.polls);
    expect(attributeOf(polls[0], 'media.kind')).toBe('video');
    expect(attributeOf(polls[0], 'media.outcome')).toBe('claimed');
  });

  it('counts a provider event as an accepted callback and a duplicate as ignored', async () => {
    await nudgeVideoGenerationJobFromProviderEvent({
      db: dbReturning([{ disposition: 'nudged' }]),
      provider: 'openrouter',
      providerTaskId: 'task-1',
      eventKey: 'event-1',
    });
    await nudgeVideoGenerationJobFromProviderEvent({
      db: dbReturning([{ disposition: 'duplicate' }]),
      provider: 'openrouter',
      providerTaskId: 'task-1',
      eventKey: 'event-1',
    });

    const callbacks = await points(MEDIA_METRIC_NAME.callbacks);
    const byOutcome = new Map(
      callbacks.map((point) => [point.attributes['media.outcome'], point.value]),
    );
    expect(byOutcome.get('accepted')).toBe(1);
    expect(byOutcome.get('ignored')).toBe(1);
  });
});

describe('safety and support diagnostics', () => {
  it('counts a refusal with its reason', async () => {
    recordMediaSafety({ media: 'image', decision: 'blocked', reason: 'prompt_moderation' });
    const safety = await points(MEDIA_METRIC_NAME.safety);
    expect(attributeOf(safety[0], 'media.safety_decision')).toBe('blocked');
    expect(attributeOf(safety[0], 'media.reason')).toBe('prompt_moderation');
  });

  it('derives age and latency and carries no prompt', () => {
    const record = mediaJobDiagnostics(
      {
        media: 'video',
        jobId: JOB_ID,
        status: 'completed',
        provider: 'runway',
        createdAtMs: Date.parse(STARTED_AT),
        settledAtMs: Date.parse(SETTLED_AT),
      },
      Date.parse(SETTLED_AT) + 1_000,
    );
    expect(record.latencyMs).toBe(12_000);
    expect(record.ageMs).toBe(13_000);
    expect(JSON.stringify(record)).not.toContain('sunset');
  });
});
