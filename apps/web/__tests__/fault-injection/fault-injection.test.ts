import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { listCanonicalModels, modelsCatalogJson } from '@agiworkforce/types';
import {
  RetryStoppedError,
  createRetryBudget,
  runWithRetryPolicy,
} from '@agiworkforce/utils/retry-policy';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { withErrorHandler } from '@/lib/error-handler';
import { isDbUnavailableError } from '@/lib/db-error';
import { REDIS_OUTAGE_POLICY_ENV, checkRateLimit } from '@/lib/rate-limit';
import { checkIdempotency } from '@/app/api/stripe-webhook/lib/idempotency';
import { createFailoverPlan } from '@/app/api/llm/v1/chat/completions/lib/managed-failover';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { SANDBOX_MAX_AGE_MS, reclaimAbandonedE2BSandboxes } from '@/lib/e2b/reclaim';
import { trimMessagesToContextWindow } from '@/app/api/llm/v1/chat/completions/lib/context-window';
import { FAILURE_MODES } from './failure-modes';

const e2bSandboxApi = vi.hoisted(() => ({ list: vi.fn(), kill: vi.fn() }));
vi.mock('@e2b/code-interpreter', () => ({
  Sandbox: {
    list: (...args: unknown[]) => e2bSandboxApi.list(...args),
    kill: (...args: unknown[]) => e2bSandboxApi.kill(...args),
  },
}));

function httpFault(status: number, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status, ...extra });
}

function recordedSleep(): { waits: number[]; sleep: (ms: number) => Promise<void> } {
  const waits: number[] = [];
  return {
    waits,
    sleep: (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    },
  };
}

function catalogModels(): Record<string, { id: string; contextWindow?: number }> {
  return modelsCatalogJson.models as unknown as Record<
    string,
    { id: string; contextWindow?: number }
  >;
}

function smallestContextModelId(): string {
  const entries = Object.values(catalogModels()).filter(
    (model) => typeof model.contextWindow === 'number' && model.contextWindow > 0,
  );
  entries.sort((a, b) => (a.contextWindow ?? 0) - (b.contextWindow ?? 0));
  const smallest = entries[0];
  if (!smallest) throw new Error('model catalog exposes no model with a context window');
  return smallest.id;
}

function stubDatabase(
  handlers: { query: (sql: string) => Promise<unknown[]> } & { execute?: () => Promise<void> },
): DatabaseAdapter {
  return {
    query: (sql: string) => handlers.query(sql),
    execute: handlers.execute ?? (() => Promise.resolve()),
  } as unknown as DatabaseAdapter;
}

async function withEnv<T>(
  overrides: Record<string, string>,
  run: () => Promise<T> | T,
): Promise<T> {
  const previous = Object.keys(overrides).map((key) => [key, process.env[key]] as const);
  Object.assign(process.env, overrides);
  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function failoverFixture(): ProcessedRequest {
  const catalog = listCanonicalModels();
  const primary = catalog[0];
  const candidate = catalog.find((model) => model.id !== primary?.id);
  if (!primary || !candidate) throw new Error('model catalog exposes fewer than two models');
  return {
    requestId: 'fault-injection',
    provider: primary.provider,
    requestedModel: 'auto',
    originalModel: 'auto',
    usedFallback: false,
    fallbackModels: [candidate.id],
    chatRequest: { model: primary.id, messages: [{ role: 'user', content: 'hi' }] },
    llmRequest: { model: primary.id, messages: [{ role: 'user', content: 'hi' }] },
  } as unknown as ProcessedRequest;
}

function sandboxPage(items: Array<{ sandboxId: string; startedAt: Date }>) {
  let served = false;
  return {
    get hasNext() {
      return !served;
    },
    nextItems: async () => {
      served = true;
      return items.map((item) => ({ ...item, metadata: {} }));
    },
  };
}

const injections: Record<string, () => Promise<void> | void> = {
  'dependency-rate-limited-with-retry-after': async () => {
    const { waits, sleep } = recordedSleep();
    let attempts = 0;
    const value = await runWithRetryPolicy(
      async () => {
        attempts += 1;
        if (attempts === 1) throw httpFault(429, { retryAfterSeconds: 11 });
        return 'served';
      },
      { maxAttempts: 3, sleep },
    );
    expect(value).toBe('served');
    expect(waits).toEqual([11_000]);
  },

  'dependency-advertises-an-abusive-retry-after': async () => {
    const { waits, sleep } = recordedSleep();
    let attempts = 0;
    await runWithRetryPolicy(
      async () => {
        attempts += 1;
        if (attempts === 1) throw httpFault(503, { retryAfterSeconds: 3600 });
        return 'served';
      },
      { maxAttempts: 3, maxRetryAfterMs: 120_000, sleep },
    );
    expect(waits).toEqual([120_000]);
  },

  'dependency-overloaded': async () => {
    const { waits, sleep } = recordedSleep();
    const attempted = vi.fn(async () => {
      throw httpFault(500);
    });
    const failure = await runWithRetryPolicy(attempted, {
      maxAttempts: 4,
      baseDelayMs: 1000,
      sleep,
      random: () => 0.5,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RetryStoppedError);
    expect((failure as RetryStoppedError).reason).toBe('attempts-exhausted');
    expect((failure as RetryStoppedError).classification.reason).toBe('http_500');
    expect(attempted).toHaveBeenCalledTimes(4);
    expect(waits).toEqual([500, 1000, 2000]);
  },

  'retry-storm-against-a-failing-dependency': async () => {
    const budget = createRetryBudget({ capacity: 3, refillPerSecond: 0, now: () => 0 });
    const { sleep } = recordedSleep();
    const dead = async (): Promise<never> => {
      throw httpFault(502);
    };

    const reasons: string[] = [];
    const attemptCounts: number[] = [];
    for (let caller = 0; caller < 5; caller++) {
      let attempts = 0;
      const error = await runWithRetryPolicy(
        async () => {
          attempts += 1;
          return dead();
        },
        { maxAttempts: 3, budget, sleep },
      ).catch((thrown: unknown) => thrown as RetryStoppedError);
      reasons.push(error.reason);
      attemptCounts.push(attempts);
    }

    expect(reasons.at(-1)).toBe('budget-exhausted');
    expect(attemptCounts.at(-1)).toBe(1);
    expect(attemptCounts[0]).toBe(3);
  },

  'connection-lost-after-a-non-idempotent-write': async () => {
    const write = vi.fn(async () => {
      throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    });
    const error = await runWithRetryPolicy(write, {
      idempotent: false,
      maxAttempts: 5,
      sleep: () => Promise.resolve(),
    }).catch((thrown: unknown) => thrown as RetryStoppedError);

    expect(error.reason).toBe('not-idempotent');
    expect(write).toHaveBeenCalledTimes(1);
  },

  'caller-cancels-mid-retry': async () => {
    const controller = new AbortController();
    const operation = vi.fn(async () => {
      throw httpFault(503);
    });
    const error = await runWithRetryPolicy(operation, {
      maxAttempts: 5,
      signal: controller.signal,
      sleep: () => {
        controller.abort();
        return Promise.reject(new Error('aborted'));
      },
    }).catch((thrown: unknown) => thrown as RetryStoppedError);

    expect(error.reason).toBe('aborted');
    expect(operation).toHaveBeenCalledTimes(1);
  },

  'oversized-request-payload': async () => {
    const handler = vi.fn(async (_request: Request) => new Response('ok'));
    const response = await withErrorHandler(handler)(
      new Request('https://app.test/api/projects', {
        method: 'POST',
        headers: { 'content-length': String(128 * 1024 * 1024) },
      }),
    );

    expect(response.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  },

  'context-window-overflow': () => {
    const model = smallestContextModelId();
    const window = catalogModels()[model]!.contextWindow!;
    const filler = 'word '.repeat(Math.ceil(window / 2));
    const messages = [
      { role: 'system' as const, content: 'stay on task' },
      { role: 'user' as const, content: filler },
      { role: 'assistant' as const, content: filler },
      { role: 'user' as const, content: filler },
    ];

    const result = trimMessagesToContextWindow(messages, model, 1024);

    expect(result).not.toBeNull();
    expect(result!.estimatedTokensAfter).toBeLessThanOrEqual(result!.budgetTokens);
    expect(result!.droppedMessages + result!.truncatedMessages).toBeGreaterThan(0);
    expect(messages.some((message) => message.role === 'user')).toBe(true);
  },

  'stripe-webhook-replayed-after-success': async () => {
    const seen: string[] = [];
    const db = stubDatabase({
      query: async (sql: string) => {
        seen.push(sql);
        if (sql.includes('process_stripe_event_idempotent')) {
          return [{ process_stripe_event_idempotent: false }];
        }
        return [{ status: 'succeeded' }];
      },
    });

    const result = await checkIdempotency(db, 'evt_replayed');

    expect(result).toEqual({ shouldProcess: false, state: 'succeeded' });
    expect(seen.some((sql) => sql.includes('process_stripe_event_idempotent'))).toBe(true);
  },

  'database-outage-during-webhook-idempotency': async () => {
    const outage = Object.assign(new Error('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });
    expect(isDbUnavailableError(outage)).toBe(true);

    const claimed = vi.fn();
    const db = stubDatabase({
      query: async () => {
        claimed();
        throw outage;
      },
    });

    const result = await checkIdempotency(db, 'evt_during_outage');

    expect(claimed).toHaveBeenCalledTimes(1);
    expect('shouldProcess' in result).toBe(false);
    expect((result as { error: Response }).error.status).toBe(500);
  },

  'shared-rate-limiter-outage': async () => {
    await withEnv({ [REDIS_OUTAGE_POLICY_ENV]: 'fail-closed' }, async () => {
      const request = new NextRequest('https://app.test/api/auth/device');

      const sensitive = await checkRateLimit(request, 'device-link', 'ip:203.0.113.7');
      expect(sensitive.success).toBe(false);
      expect(sensitive.headers['X-RateLimit-Error']).toBe('rate-limiter-unavailable');
      expect(sensitive.headers['Retry-After']).toBe('60');

      const businessCritical = await checkRateLimit(request, 'checkout', 'ip:203.0.113.7');
      expect(businessCritical.success).toBe(true);
    });
  },

  'provider-availability-failure-mid-request': () => {
    const overloaded = Object.assign(new Error('upstream 503'), { status: 503 });
    const clientError = Object.assign(new Error('invalid request'), { status: 400 });

    const live = new AbortController();
    const rotated = createFailoverPlan(failoverFixture(), {
      signal: live.signal,
      isProviderDispatchable: () => true,
    }).next(overloaded);
    expect(rotated).not.toBeNull();
    expect(rotated!.processed.usedFallback).toBe(true);

    const onClientError = createFailoverPlan(failoverFixture(), {
      signal: new AbortController().signal,
      isProviderDispatchable: () => true,
    }).next(clientError);
    expect(onClientError).toBeNull();

    const aborted = new AbortController();
    aborted.abort();
    const afterAbort = createFailoverPlan(failoverFixture(), {
      signal: aborted.signal,
      isProviderDispatchable: () => true,
    }).next(overloaded);
    expect(afterAbort).toBeNull();
  },

  'abandoned-sandbox-outlives-its-ttl': async () => {
    const now = new Date('2026-08-17T00:00:00.000Z');
    e2bSandboxApi.list.mockReset();
    e2bSandboxApi.kill.mockReset();
    e2bSandboxApi.kill.mockResolvedValue(undefined);
    e2bSandboxApi.list.mockReturnValue(
      sandboxPage([
        { sandboxId: 'sbx-stale', startedAt: new Date(now.getTime() - SANDBOX_MAX_AGE_MS - 1) },
        { sandboxId: 'sbx-fresh', startedAt: new Date(now.getTime() - 60_000) },
      ]),
    );

    const report = await withEnv({ AGI_E2B_EXECUTION: '1' }, () =>
      reclaimAbandonedE2BSandboxes({ now }),
    );

    expect(report.skipped).toBe(false);
    expect(report.inspected).toBe(2);
    expect(report.reclaimed).toBe(1);
    expect(report.retained).toBe(1);
    expect(e2bSandboxApi.kill).toHaveBeenCalledTimes(1);
    expect(e2bSandboxApi.kill).toHaveBeenCalledWith('sbx-stale');
  },
};

describe('fault injection: every named failure mode is exercised against real code', () => {
  it('has an injection for every mode in the catalog and no orphan injections', () => {
    const catalogued = FAILURE_MODES.map((mode) => mode.id).sort();
    expect(Object.keys(injections).sort()).toEqual(catalogued);
  });

  for (const mode of FAILURE_MODES) {
    it(`${mode.id}: ${mode.injectedFault} → ${mode.expectedResponse}`, async () => {
      const injection = injections[mode.id];
      expect(injection, `no injection registered for ${mode.id}`).toBeTypeOf('function');
      await injection!();
    });
  }
});
