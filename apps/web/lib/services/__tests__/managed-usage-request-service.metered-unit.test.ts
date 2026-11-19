import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { reserveManagedUsageRequest } = await import('../managed-usage-request-service');
const { LIVE_VOICE_SESSION_OPERATION, TRANSCRIPTION_OPERATION } =
  await import('../tier-unit-quota-service');

function dbAcquiring() {
  const query = vi.fn(async (sql: string) => {
    if (String(sql).includes('reserve_managed_usage_request_with_limits_microusd')) {
      return [
        {
          reservation_decision: 'acquired',
          request_status: 'reserved',
          lease_token: 'lease-1',
          estimated_cost_microusd: 5_000_000,
        },
      ];
    }
    return [];
  });
  const execute = vi.fn(async () => undefined);
  return { db: { query, execute } as never, execute };
}

function reservation(db: unknown, overrides: Record<string, unknown> = {}) {
  return {
    db,
    userId: 'user-1',
    idempotencyKey: 'request-00000001',
    requestHash: 'hash-1',
    provider: 'anthropic',
    model: 'served-model',
    estimatedCostMicrousd: 5_000_000,
    planTier: 'max',
    isFlagship: false,
    ...overrides,
  } as Parameters<typeof reserveManagedUsageRequest>[0];
}

function usageWrites(execute: ReturnType<typeof vi.fn>): Array<[string, unknown[]]> {
  return (execute.mock.calls as unknown as Array<[string, unknown[]]>).filter(([sql]) =>
    /set usage = usage \|\| \$3::jsonb/.test(String(sql).replace(/\s+/g, ' ')),
  );
}

beforeEach(() => vi.clearAllMocks());

describe('reserveManagedUsageRequest records the metered unit while the request is outstanding', () => {
  it('tags a computer-use request so the next preflight counts it before it settles', async () => {
    const { db, execute } = dbAcquiring();

    await reserveManagedUsageRequest(reservation(db, { quotaFeature: 'computer_use' }));

    const [writes] = usageWrites(execute);
    expect(writes?.[0]).toMatch(/status = 'reserved'/);
    expect(writes?.[1]).toEqual(['user-1', 'request-00000001', '{"quotaFeature":"computer_use"}']);
  });

  it('records the estimated audio seconds of a paid transcription', async () => {
    const { db, execute } = dbAcquiring();

    await reserveManagedUsageRequest(
      reservation(db, {
        reservedUsage: { operation: TRANSCRIPTION_OPERATION, estimatedAudioSeconds: 60 },
      }),
    );

    const [writes] = usageWrites(execute);
    expect(JSON.parse(String(writes?.[1][2]))).toEqual({
      operation: 'transcription',
      estimatedAudioSeconds: 60,
    });
  });

  it('records the reserved seconds of a live voice session', async () => {
    const { db, execute } = dbAcquiring();

    await reserveManagedUsageRequest(
      reservation(db, {
        reservedUsage: { operation: LIVE_VOICE_SESSION_OPERATION, billedSeconds: 300 },
      }),
    );

    const [writes] = usageWrites(execute);
    expect(JSON.parse(String(writes?.[1][2]))).toEqual({
      operation: 'voice_live_session',
      billedSeconds: 300,
    });
  });

  it('writes nothing for a request that meters no unit', async () => {
    const { db, execute } = dbAcquiring();

    await reserveManagedUsageRequest(reservation(db));

    expect(usageWrites(execute)).toHaveLength(0);
  });
});

type ImportedModule0 = typeof import('@/lib/logger');
