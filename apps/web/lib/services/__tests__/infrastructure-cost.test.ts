import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const recorded = vi.fn(async (_input: unknown) => undefined);
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  recordInfrastructureCostEvent: (input: unknown) => recorded(input),
}));

import {
  recordEgressBytes,
  recordNotificationDeliveries,
} from '@/lib/services/infrastructure-cost';

interface Accrual {
  capability: string;
  units: number;
  provider: string;
  userId: string | null;
  sourceRef: string;
}

function accruals(): Accrual[] {
  return recorded.mock.calls.map((call) => call[0] as Accrual);
}

beforeEach(() => {
  recorded.mockClear();
});

describe('infrastructure accruals', () => {
  it('meters served bytes in gibibytes', async () => {
    recordEgressBytes({ userId: 'user_1', bytes: 1024 ** 3 * 2, provider: 'object_storage' });
    await vi.waitFor(() => expect(recorded).toHaveBeenCalledTimes(1));
    expect(accruals()[0]).toMatchObject({ capability: 'egress', units: 2, userId: 'user_1' });
  });

  it('meters one unit per delivered notification', async () => {
    recordNotificationDeliveries({ userId: 'user_1', provider: 'web_push', deliveries: 3 });
    await vi.waitFor(() => expect(recorded).toHaveBeenCalledTimes(1));
    expect(accruals()[0]).toMatchObject({
      capability: 'notification',
      units: 3,
      userId: 'user_1',
    });
  });

  it('accrues nothing when nothing was delivered or served', () => {
    recordEgressBytes({ bytes: 0, provider: 'object_storage' });
    recordEgressBytes({ bytes: Number.NaN, provider: 'object_storage' });
    recordNotificationDeliveries({ provider: 'web_push', deliveries: 0 });
    recordNotificationDeliveries({ provider: 'web_push', deliveries: -1 });
    recordNotificationDeliveries({ provider: 'web_push', deliveries: 1.5 });
    expect(recorded).not.toHaveBeenCalled();
  });

  it('keys each accrual so two sends are two rows, not one deduplicated row', async () => {
    recordNotificationDeliveries({ provider: 'web_push', deliveries: 1 });
    recordNotificationDeliveries({ provider: 'web_push', deliveries: 1 });
    await vi.waitFor(() => expect(recorded).toHaveBeenCalledTimes(2), { timeout: 5_000 });
    const [first, second] = accruals();
    expect(first?.sourceRef).toMatch(/^notification:/);
    expect(first?.sourceRef).not.toBe(second?.sourceRef);
  });
});
