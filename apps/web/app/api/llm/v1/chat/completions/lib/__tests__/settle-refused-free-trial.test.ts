import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settle: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/services/free-trial-service', () => ({
  settleFreeTrialRequest: mocks.settle,
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import type { FreeTrialReservation } from '@/lib/services/free-trial-service';
import { settleRefusedFreeTrial } from '../settle-refused-free-trial';

const reservation = {
  userId: 'user-1',
  requestId: 'resume-request-1',
  reservedMicrousd: 5_000_000,
} as FreeTrialReservation;

describe('settleRefusedFreeTrial', () => {
  beforeEach(() => {
    mocks.settle.mockResolvedValue(0);
  });

  it('settles the turn failed with the refusal class and no charge input', async () => {
    await settleRefusedFreeTrial(
      { freeTrial: reservation, requestId: 'resume-request-1' },
      'workflow_start_failed',
    );

    expect(mocks.settle).toHaveBeenCalledExactlyOnceWith({
      reservation,
      outcome: 'failed',
      attempt: { outcome: 'failed', errorClass: 'workflow_start_failed' },
    });
  });

  it('does nothing for a turn that holds no Free reservation', async () => {
    await settleRefusedFreeTrial({ requestId: 'resume-request-1' }, 'workflow_start_failed');

    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('logs and returns when settlement throws, so the caller still releases its claim', async () => {
    mocks.settle.mockRejectedValue(new Error('ledger unavailable'));

    await expect(
      settleRefusedFreeTrial(
        { freeTrial: reservation, requestId: 'resume-request-1' },
        'tool_discovery_failed',
      ),
    ).resolves.toBeUndefined();
    expect(mocks.logError).toHaveBeenCalledOnce();
  });
});
