import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codeActionSpanName } from '@/lib/observability/code-actions';
import { OBSERVABILITY_ATTRIBUTE } from '@/lib/observability/attributes';

import { E2B_UNAVAILABLE_CAUSES, codeExecutionUnavailableMessage } from '../unavailability';

process.env['CSRF_SECRET'] ||= 'a'.repeat(40);
process.env['NEXT_PUBLIC_APP_URL'] ||= 'https://app.agiworkforce.test';

const emitted: Array<Record<string, unknown>> = [];

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: {
    info: (record: Record<string, unknown>, msg?: string) => emitted.push({ ...record, msg }),
    error: (record: Record<string, unknown>, msg?: string) => emitted.push({ ...record, msg }),
    warn: (record: Record<string, unknown>, msg?: string) => emitted.push({ ...record, msg }),
    debug: (record: Record<string, unknown>, msg?: string) => emitted.push({ ...record, msg }),
  },
}));

const e2bExecutionEnabled = vi.fn(() => true);
vi.mock('../gate', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  e2bExecutionEnabled: () => e2bExecutionEnabled(),
}));

const sandboxComputeIsPriceable = vi.fn(() => true);
const reserveSandboxComputeInterval = vi.fn(async (_input: unknown) => ({
  outcome: 'reserved' as const,
  reservation: {
    idempotencyKey: 'agi.e2b.compute.res-1',
    requestHash: 'hash-1',
    leaseToken: 'lease-1',
    estimatedCostMicrousd: 1_000_000,
    provider: 'e2b',
    model: 'e2b',
  },
}));
vi.mock('../compute-metering', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sandboxComputeIsPriceable: () => sandboxComputeIsPriceable(),
  getSandboxComputeMicrousdPerSecond: () => 46,
  meterSandboxComputeInterval: async () => 0,
  reserveSandboxComputeInterval: (input: unknown) => reserveSandboxComputeInterval(input),
  releaseSandboxComputeReservation: async () => {},
}));

vi.mock('../templates', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  templateComputeShape: async () => ({ vcpuCount: null, memoryGib: null }),
}));

vi.mock('@/lib/services/effective-subscription-service', () => ({
  resolveEffectiveSubscription: async () => ({ plan_tier: 'pro' }),
}));

const withUserSandboxLock = vi.fn(async (_scope: unknown, critical: () => Promise<unknown>) => ({
  locked: true,
  result: await critical(),
}));
vi.mock('../session-store', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CHAT_SANDBOX_NETWORK_ACCESS: 'trusted',
  getE2BSession: async () => null,
  saveE2BSession: async () => {},
  deleteE2BSession: async () => {},
  withUserSandboxLock: (scope: unknown, critical: () => Promise<unknown>) =>
    withUserSandboxLock(scope, critical),
}));

function sandboxInstance(sandboxId: string) {
  return {
    sandboxId,
    createCodeContext: async () => ({ id: 'ctx', language: 'python', cwd: '/home/user' }),
    runCode: async () => ({ logs: { stdout: [], stderr: [] } }),
    files: { write: async () => {}, makeDir: async () => {} },
    commands: { run: async () => ({ stdout: '', stderr: '', exitCode: 0 }) },
    updateNetwork: async () => {},
    kill: async () => true,
  };
}

const create = vi.fn(async (): Promise<ReturnType<typeof sandboxInstance>> => {
  throw new Error('the provider said no');
});
vi.mock('@e2b/code-interpreter', () => ({
  Sandbox: {
    create,
    connect: vi.fn(),
    kill: vi.fn(async () => true),
    pause: vi.fn(async () => true),
    list: vi.fn(() => ({ hasNext: false, nextItems: async () => [] })),
  },
}));

interface RefusalDrive {
  readonly arrange: () => void;
  readonly scope: () => Record<string, unknown> | undefined;
}

const PLAN_TIER = 'pro';

function chatScope(userId: string): Record<string, unknown> {
  return {
    tenantId: 'managed-cloud',
    userId,
    conversationId: `conv-${userId}`,
    planTier: PLAN_TIER,
  };
}

// One drive per member of the closed cause set, so a cause added without a way
// to reach it, or reached without settling its span, fails here.
const DRIVES: Readonly<Record<string, RefusalDrive>> = {
  'not-configured': {
    arrange: () => e2bExecutionEnabled.mockReturnValueOnce(false),
    scope: () => chatScope('user-unconfigured'),
  },
  'no-capacity': {
    arrange: () => {},
    scope: () => ({ ...chatScope('user-capped'), planTier: 'no-such-plan' }),
  },
  policy: {
    arrange: () => {
      create.mockImplementationOnce(async () => ({
        ...sandboxInstance('sbx-policy'),
        updateNetwork: async () => {
          throw new Error('the network policy could not be applied');
        },
      }));
    },
    scope: () => ({
      tenantId: 'managed-cloud',
      userId: 'user-policy',
      resource: { kind: 'code_session', id: 'cs-policy' },
      networkAccess: 'none',
      planTier: PLAN_TIER,
    }),
  },
  'over-quota': {
    arrange: () =>
      reserveSandboxComputeInterval.mockResolvedValueOnce({
        outcome: 'refused',
        error: { status: 402, code: 'insufficient_credits' },
      } as never),
    scope: () => chatScope('user-broke'),
  },
  'provider-error': {
    arrange: () => {},
    scope: () => chatScope('user-outage'),
  },
};

function provisionSpans(): Array<Record<string, unknown>> {
  return emitted.filter(
    (record) =>
      record['event'] === 'span' && record['span_name'] === codeActionSpanName('sandbox_provision'),
  );
}

beforeEach(() => {
  emitted.length = 0;
  vi.clearAllMocks();
  e2bExecutionEnabled.mockReturnValue(true);
  sandboxComputeIsPriceable.mockReturnValue(true);
  withUserSandboxLock.mockImplementation(async (_scope, critical) => ({
    locked: true,
    result: await critical(),
  }));
});

describe('a refused sandbox provision is countable as a provision that failed', () => {
  it('settles the span as a failure naming the cause, for every cause there is', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const wrong: string[] = [];

    for (const cause of E2B_UNAVAILABLE_CAUSES) {
      const drive = DRIVES[cause];
      if (!drive) {
        wrong.push(`${cause} has no way to be reached`);
        continue;
      }
      emitted.length = 0;
      drive.arrange();
      const reported: string[] = [];
      const executor = await getE2BExecutor(drive.scope() as never, (reason) =>
        reported.push(reason),
      );

      if (executor !== null) {
        wrong.push(`${cause} handed the caller an executor`);
        continue;
      }
      if (reported[0] !== cause) {
        wrong.push(`${cause} reported ${reported[0] ?? 'nothing'} to its caller`);
        continue;
      }
      const span = provisionSpans().at(-1);
      if (span?.['status'] !== 'error') {
        wrong.push(`${cause} closed its span ${String(span?.['status'] ?? 'not at all')}`);
        continue;
      }
      if (span['error.type'] !== cause) {
        wrong.push(`${cause} recorded the failure as ${String(span['error.type'])}`);
      }
      if (span['span_domain'] !== 'sandbox') {
        wrong.push(`${cause} recorded the failure under ${String(span['span_domain'])}`);
      }
      if (span[OBSERVABILITY_ATTRIBUTE.codeAction] !== 'sandbox_provision') {
        wrong.push(`${cause} did not carry its own name on the failure`);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('closes the span ok only when a sandbox was actually handed back', async () => {
    create.mockImplementationOnce(async () => sandboxInstance('sbx-ok'));
    const { getE2BExecutor } = await import('../runtime');

    const executor = await getE2BExecutor(chatScope('user-ok') as never);

    expect(executor).not.toBeNull();
    expect(provisionSpans().at(-1)?.['status']).toBe('ok');
  });

  it('never tells a reader an outage was their account running out of room', () => {
    const outage = codeExecutionUnavailableMessage('provider-error');
    const ownLimit = codeExecutionUnavailableMessage('no-capacity');
    const budget = codeExecutionUnavailableMessage('over-quota');

    expect(new Set([outage, ownLimit, budget]).size).toBe(3);
    expect(outage).toContain('not a limit on this account');
  });
});
