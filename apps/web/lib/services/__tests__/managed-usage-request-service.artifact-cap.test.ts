import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const {
  ManagedUsageRequestError,
  artifactUsageSubjectKey,
  reserveManagedUsageProviderStep,
  reserveManagedUsageRequest,
} = await import('../managed-usage-request-service');
const { ARTIFACT_RUNTIME_SHARE_OF_FIVE_HOUR_BUDGET, getPlanMaxArtifactAiCallsPerApp } =
  await import('@agiworkforce/types');
const {
  getArtifactRuntimeUsageLimits,
  getPlanSessionUsageBudgetMicrousd,
  getPlanSessionUsageCapMicrousd,
} = await import('@/lib/server/managed-usage-policy');

const PUBLISHED_ID = '6f1c2a7e-0b1d-4c3e-9a8f-1234567890ab';
const PUBLISHED = { kind: 'published' as const, publishedArtifactId: PUBLISHED_ID };

function dbAnswering(decision: string) {
  const query = vi.fn(async (sql: string) => {
    if (String(sql).includes('reserve_artifact_runtime_usage_microusd')) {
      return [
        {
          reservation_decision: decision,
          request_status: decision === 'acquired' ? 'reserved' : 'declined',
          lease_token: decision === 'acquired' ? 'lease-1' : null,
          estimated_cost_microusd: 5_000_000,
        },
      ];
    }
    return [];
  });
  return { db: { query, execute: vi.fn(async () => undefined) } as never, query };
}

function reservation(db: unknown, overrides: Record<string, unknown> = {}) {
  return {
    db,
    userId: 'viewer-1',
    idempotencyKey: 'artifact-00000001',
    requestHash: 'hash-1',
    provider: 'anthropic',
    model: 'served-model',
    estimatedCostMicrousd: 5_000_000,
    planTier: 'pro',
    isFlagship: false,
    artifactSubject: PUBLISHED,
    ...overrides,
  } as Parameters<typeof reserveManagedUsageRequest>[0];
}

function reservationSql(query: ReturnType<typeof vi.fn>): [string, unknown[]] | undefined {
  return query.mock.calls.find(([sql]) => /reserve_.*_microusd\(/.test(String(sql))) as
    [string, unknown[]] | undefined;
}

beforeEach(() => vi.clearAllMocks());

describe('reserveManagedUsageRequest for a call an app made', () => {
  it('reserves through the per-app ceiling, naming the app and the policy limits', async () => {
    const { db, query } = dbAnswering('acquired');

    await reserveManagedUsageRequest(reservation(db));

    const [sql, params] = reservationSql(query)!;
    expect(sql).toContain('reserve_artifact_runtime_usage_microusd');
    expect(sql).not.toContain('reserve_managed_usage_request_with_limits_microusd');
    const limits = getArtifactRuntimeUsageLimits({ tier: 'pro', catalogVersion: null });
    expect(params.slice(12)).toEqual([
      `published:${PUBLISHED_ID}`,
      5,
      limits.maxCalls,
      limits.capMicrousd,
    ]);
    expect(params[0]).toBe('viewer-1');
  });

  it('answers the app ceiling with its own refusal, not a plan limit', async () => {
    const { db } = dbAnswering('artifact_limit');

    const refusal = reserveManagedUsageRequest(reservation(db));

    await expect(refusal).rejects.toBeInstanceOf(ManagedUsageRequestError);
    await expect(refusal).rejects.toMatchObject({
      status: 429,
      code: 'artifact_runtime_limit_reached',
    });
  });

  it('keeps every other request on the plan ceilings alone', async () => {
    const query = vi.fn(async (sql: string) =>
      String(sql).includes('reserve_managed_usage_request_with_limits_microusd')
        ? [
            {
              reservation_decision: 'acquired',
              request_status: 'reserved',
              lease_token: 'lease-1',
              estimated_cost_microusd: 5_000_000,
            },
          ]
        : [],
    );

    await reserveManagedUsageRequest(
      reservation({ query, execute: vi.fn() }, { artifactSubject: undefined }),
    );

    const [sql] = reservationSql(query)!;
    expect(sql).toContain('reserve_managed_usage_request_with_limits_microusd');
    expect(sql).not.toContain('reserve_artifact_runtime_usage_microusd');
  });

  it('refuses to bill an app call to usage credits, before any reservation', async () => {
    const { db, query } = dbAnswering('acquired');

    await expect(
      reserveManagedUsageRequest(reservation(db, { funding: 'extra_usage' })),
    ).rejects.toMatchObject({ status: 400, code: 'artifact_runtime_funding_unsupported' });
    expect(reservationSql(query)).toBeUndefined();
  });

  it('refuses an app it cannot identify, before any reservation', async () => {
    const { db, query } = dbAnswering('acquired');

    await expect(
      reserveManagedUsageRequest(
        reservation(db, { artifactSubject: { kind: 'owned', artifactId: 'not-an-id' } }),
      ),
    ).rejects.toMatchObject({ status: 400, code: 'artifact_runtime_subject_invalid' });
    expect(reservationSql(query)).toBeUndefined();
  });
});

describe('artifactUsageSubjectKey', () => {
  it('records one spelling per app whatever the case of its id', () => {
    expect(artifactUsageSubjectKey({ kind: 'owned', artifactId: PUBLISHED_ID.toUpperCase() })).toBe(
      `owned:${PUBLISHED_ID}`,
    );
  });
});

describe('getArtifactRuntimeUsageLimits', () => {
  it('holds one app below the plan’s own five-hour ceiling', () => {
    const plan = { tier: 'pro', catalogVersion: null };
    const limits = getArtifactRuntimeUsageLimits(plan);
    const sessionCap = getPlanSessionUsageCapMicrousd(plan);

    expect(limits.capMicrousd).toBe(
      Math.floor(
        getPlanSessionUsageBudgetMicrousd(plan) * ARTIFACT_RUNTIME_SHARE_OF_FIVE_HOUR_BUDGET,
      ),
    );
    expect(limits.capMicrousd).toBeGreaterThan(0);
    expect(sessionCap).not.toBeNull();
    expect(limits.capMicrousd!).toBeLessThan(sessionCap!);
    expect(limits.maxCalls).toBe(getPlanMaxArtifactAiCallsPerApp('pro'));
    expect(limits.maxCalls).toBeGreaterThan(0);
  });

  it('reads the call count from the plan catalog, where a tier can be unlimited', () => {
    expect(
      getArtifactRuntimeUsageLimits({ tier: 'enterprise', catalogVersion: null }).maxCalls,
    ).toBe(null);
    expect(getArtifactRuntimeUsageLimits({ tier: 'free', catalogVersion: null }).maxCalls).toBe(
      getPlanMaxArtifactAiCallsPerApp('free'),
    );
  });

  it('adds no spend ceiling of its own where the plan has no five-hour budget', () => {
    expect(getArtifactRuntimeUsageLimits({ tier: 'free', catalogVersion: null }).capMicrousd).toBe(
      null,
    );
  });
});

describe('reserveManagedUsageProviderStep for an app’s run', () => {
  function stepDb(decision: string) {
    const query = vi.fn(async (sql: string) => {
      const text = String(sql);
      if (text.includes('reserve_artifact_runtime_usage_microusd')) {
        return [
          {
            reservation_decision: 'acquired',
            request_status: 'reserved',
            lease_token: 'lease-1',
            estimated_cost_microusd: 5_000_000,
          },
        ];
      }
      if (text.includes('_provider_step_microusd(')) {
        return [
          {
            extension_decision: decision,
            request_status: 'provider_started',
            estimated_cost_microusd: 10_000_000,
          },
        ];
      }
      return [];
    });
    return { db: { query, execute: vi.fn(async () => undefined) } as never, query };
  }

  function stepSql(query: ReturnType<typeof vi.fn>): [string, unknown[]] {
    return query.mock.calls.find(([sql]) => String(sql).includes('_provider_step_microusd(')) as [
      string,
      unknown[],
    ];
  }

  it('rechecks the app’s ceiling on every later provider step', async () => {
    const { db, query } = stepDb('extended');
    const reserved = await reserveManagedUsageRequest(reservation(db));

    await reserveManagedUsageProviderStep({
      reservation: reserved,
      operationKey: 'provider:2',
      estimatedCostMicrousd: 5_000_000,
      planTier: 'pro',
      isFlagship: false,
    });

    const [sql, params] = stepSql(query);
    expect(sql).toContain('extend_artifact_runtime_usage_provider_step_microusd');
    expect(params.slice(10)).toEqual([
      `published:${PUBLISHED_ID}`,
      5,
      getArtifactRuntimeUsageLimits({ tier: 'pro', catalogVersion: null }).capMicrousd,
    ]);
  });

  it('stops the run with the app ceiling refusal when a step would pass it', async () => {
    const { db } = stepDb('artifact_limit');
    const reserved = await reserveManagedUsageRequest(reservation(db));

    await expect(
      reserveManagedUsageProviderStep({
        reservation: reserved,
        operationKey: 'provider:3',
        estimatedCostMicrousd: 5_000_000,
        planTier: 'pro',
        isFlagship: false,
      }),
    ).rejects.toMatchObject({ status: 429, code: 'artifact_runtime_limit_reached' });
  });

  it('leaves a chat turn on the plan-only step extension', async () => {
    const query = vi.fn(async (sql: string) =>
      String(sql).includes('extend_managed_usage_request_provider_step_microusd')
        ? [
            {
              extension_decision: 'extended',
              request_status: 'provider_started',
              estimated_cost_microusd: 10_000_000,
            },
          ]
        : [],
    );

    await reserveManagedUsageProviderStep({
      reservation: {
        db: { query, execute: vi.fn() } as never,
        userId: 'viewer-1',
        idempotencyKey: 'chat-00000001',
        requestHash: 'hash-1',
        leaseToken: 'lease-1',
        estimatedCostCents: 1,
      },
      operationKey: 'provider:2',
      estimatedCostMicrousd: 5_000_000,
      planTier: 'pro',
      isFlagship: false,
    });

    const [sql] = stepSql(query);
    expect(sql).not.toContain('extend_artifact_runtime_usage_provider_step_microusd');
  });
});
