import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/e2b/runtime', () => ({ getE2BExecutor: vi.fn() }));
vi.mock('@/lib/e2b/session-store', () => ({
  managedCloudCodeSessionScope: vi.fn(() => ({ scope: 'test' })),
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: vi.fn(() => ({ stream: vi.fn() })),
  resolveProviderFromModel: vi.fn(() => 'anthropic'),
}));
vi.mock('@/lib/services/cloud-code-agent-runner', () => ({
  createCloudCodeToolRunner: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/cloud-code-agent-loop', () => ({ runCloudCodeAgentTurn: vi.fn() }));
vi.mock('@/lib/services/managed-usage-request-service', () => ({
  fingerprintManagedUsageRequest: vi.fn(() => 'request-hash'),
  reserveManagedUsageRequest: vi.fn(),
  reserveManagedUsageProviderStep: vi.fn(),
  finalizeManagedUsageRequest: vi.fn(),
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return { ...actual, getCloudCodeSession: vi.fn() };
});

import { SLOT_REGISTRY } from '@agiworkforce/types';
import { getE2BExecutor } from '@/lib/e2b/runtime';
import { getCloudCodeSession } from '@/lib/services/cloud-code-session-service';
import { runCloudCodeAgentTurn } from '@/lib/services/cloud-code-agent-loop';
import {
  finalizeManagedUsageRequest,
  reserveManagedUsageProviderStep,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';
import type { CloudCodeTurnUsage } from '@/lib/services/cloud-code-agent-loop';
import { startCloudCodeAgentTurn } from '@/lib/services/cloud-code-agent-service';

/** The turn cost that the flat-rate defect billed for every turn regardless of usage. */
const FLAT_RESERVATION_CENTS = 25;

/**
 * Real catalog IDs, read from the slot registry rather than typed in, so the
 * test fails when a model release moves the flagship slot instead of silently
 * asserting against a model the catalog no longer routes to.
 */
const FLAGSHIP_MODEL = SLOT_REGISTRY.flagship_coding.modelId;
const STANDARD_MODEL = SLOT_REGISTRY.coding_balanced.modelId;

const NO_USAGE: CloudCodeTurnUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

function usage(partial: Partial<CloudCodeTurnUsage>): CloudCodeTurnUsage {
  return { ...NO_USAGE, ...partial };
}

function dbStub() {
  return { query: vi.fn(async () => [{ id: 'turn-1' }]) };
}

async function runTurn(options: {
  model?: string;
  turnUsage?: CloudCodeTurnUsage;
  stopReason?: 'done' | 'error' | 'max_steps';
  steps?: number;
}) {
  vi.mocked(runCloudCodeAgentTurn).mockImplementation(async (input) => {
    // Exercise the lease extension the way the loop does, so the per-step
    // reservation is observable from these tests.
    await input.onStepCommitted?.(0);
    return {
      stopReason: options.stopReason ?? 'done',
      stepsUsed: options.steps ?? 1,
      usage: options.turnUsage ?? NO_USAGE,
      finalMessage: 'done',
      messages: [],
    };
  });

  await startCloudCodeAgentTurn({
    db: dbStub() as never,
    owner: { userId: 'user-1', organizationId: null },
    sessionId: 'session-1',
    goal: 'Fix the failing test',
    model: options.model ?? STANDARD_MODEL,
    planTier: 'pro',
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    signal: new AbortController().signal,
  });
}

function settledCostCents(): number {
  const call = vi.mocked(finalizeManagedUsageRequest).mock.calls.at(-1);
  return call?.[0].actualCostCents ?? Number.NaN;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCloudCodeSession).mockResolvedValue({
    state: 'ready',
    repositoryUrl: null,
    networkAccess: 'none',
    workspacePath: '/workspace',
  } as never);
  vi.mocked(getE2BExecutor).mockResolvedValue({
    dispose: vi.fn(),
    pause: vi.fn(),
  } as never);
  vi.mocked(reserveManagedUsageRequest).mockResolvedValue({
    db: dbStub(),
    userId: 'user-1',
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    requestHash: 'request-hash',
    leaseToken: 'lease-1',
    estimatedCostCents: FLAT_RESERVATION_CENTS,
  } as never);
  vi.mocked(reserveManagedUsageProviderStep).mockResolvedValue({} as never);
  vi.mocked(finalizeManagedUsageRequest).mockResolvedValue({} as never);
});

describe('Cloud Code turn settlement uses measured tokens', () => {
  it('settles a cheap turn well below the flat reservation', async () => {
    await runTurn({ turnUsage: usage({ inputTokens: 200, outputTokens: 40 }) });
    const settled = settledCostCents();
    expect(settled).toBeGreaterThan(0);
    expect(settled).toBeLessThan(FLAT_RESERVATION_CENTS);
  });

  it('settles an expensive turn well above the flat reservation', async () => {
    await runTurn({
      turnUsage: usage({ inputTokens: 4_000_000, outputTokens: 400_000 }),
      steps: 20,
    });
    expect(settledCostCents()).toBeGreaterThan(FLAT_RESERVATION_CENTS * 10);
  });

  it('prices two different turns differently, rather than at one flat rate', async () => {
    await runTurn({ turnUsage: usage({ inputTokens: 10_000, outputTokens: 1_000 }) });
    const cheap = settledCostCents();
    await runTurn({ turnUsage: usage({ inputTokens: 900_000, outputTokens: 90_000 }) });
    expect(settledCostCents()).toBeGreaterThan(cheap);
  });

  it('bills cache reads and writes the provider reported', async () => {
    await runTurn({ turnUsage: usage({ inputTokens: 1000, outputTokens: 100 }) });
    const withoutCache = settledCostCents();
    await runTurn({
      turnUsage: usage({
        inputTokens: 1000,
        outputTokens: 100,
        cacheReadTokens: 2_000_000,
        cacheWriteTokens: 2_000_000,
      }),
    });
    expect(settledCostCents()).toBeGreaterThan(withoutCache);
  });

  it('falls back to the reservation, not to zero, when the provider reported nothing', async () => {
    await runTurn({ turnUsage: NO_USAGE });
    expect(settledCostCents()).toBe(FLAT_RESERVATION_CENTS);
  });

  it('settles a failed turn at zero', async () => {
    await runTurn({
      stopReason: 'error',
      turnUsage: usage({ inputTokens: 900_000, outputTokens: 90_000 }),
    });
    expect(settledCostCents()).toBe(0);
  });
});

describe('Cloud Code flagship flag reflects the model actually called', () => {
  it('reserves a flagship model as flagship, so the weekly cap applies', async () => {
    await runTurn({ model: FLAGSHIP_MODEL });
    expect(vi.mocked(reserveManagedUsageRequest).mock.calls[0]?.[0].isFlagship).toBe(true);
  });

  it('carries the flagship flag onto every per-step lease extension', async () => {
    await runTurn({ model: FLAGSHIP_MODEL });
    expect(vi.mocked(reserveManagedUsageProviderStep).mock.calls[0]?.[0].isFlagship).toBe(true);
  });

  it('does not flag a standard model', async () => {
    await runTurn({ model: STANDARD_MODEL });
    expect(vi.mocked(reserveManagedUsageRequest).mock.calls[0]?.[0].isFlagship).toBe(false);
    expect(vi.mocked(reserveManagedUsageProviderStep).mock.calls[0]?.[0].isFlagship).toBe(false);
  });
});
