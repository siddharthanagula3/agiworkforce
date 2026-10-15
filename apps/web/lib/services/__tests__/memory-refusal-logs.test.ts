// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const harness = vi.hoisted(() => ({
  lines: [] as string[],
  userId: 'user_2refusalprobe',
}));

vi.mock('@/lib/logger', async (importOriginal) => {
  const actual = await importOriginal<LoggerModule>();
  const { default: pino } = await import('pino');
  return {
    ...actual,
    logger: pino(actual.loggerOptions, {
      write: (line: string) => {
        harness.lines.push(line);
      },
    }),
  };
});

vi.mock('@/lib/observability/metrics', async (importOriginal) => {
  const actual = await importOriginal<MetricsModule>();
  return { ...actual, recordDenial: vi.fn(actual.recordDenial) };
});

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/server/rls-db', async (importOriginal) => {
  const actual = await importOriginal<RlsDbModule>();
  const { setTenantScope } = await import('@/lib/observability/trace-context');
  const { answerMemoryPolicyQuery } = await import('./memory-policy-stub');
  return {
    ...actual,
    getUserScopedDb: vi.fn(async () => {
      setTenantScope({ userId: harness.userId });
      return {
        db: { query: async (sql: string) => answerMemoryPolicyQuery(sql) ?? [] },
        userId: harness.userId,
        organizationId: null,
      };
    }),
  };
});

import { POST } from '@/app/api/memory/route';
import { PUT } from '@/app/api/memory/[id]/route';
import { recordDenial } from '@/lib/observability/metrics';
import {
  newSpanId,
  newTraceId,
  runWithTraceContext,
  setTenantScope,
} from '@/lib/observability/trace-context';
import { prohibitedMemoryMessage, sensitiveMemoryMessage } from '@agiworkforce/context';
import { persistManagedAutoMemoryFacts } from '../managed-memory-context-service';
import { answerMemoryPolicyQuery } from './memory-policy-stub';

type RlsDbModule = typeof import('@/lib/server/rls-db');

type RateLimitModule = typeof import('@/lib/rate-limit');

type LoggerModule = typeof import('@/lib/logger');
type MetricsModule = typeof import('@/lib/observability/metrics');

const CONTENT_REASONS = ['sensitive_topic_not_opted_in', 'prohibited_content_category'];
const REFUSALS = [
  sensitiveMemoryMessage('health'),
  sensitiveMemoryMessage('religious_belief'),
  prohibitedMemoryMessage('criminal_history'),
];
const ACCOUNT_FIELDS = ['user_id', 'userId', 'request_id', 'requestId', 'trace_id', 'span_id'];

function loggedLines(): Record<string, unknown>[] {
  return harness.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function accountLinkedDisclosures(): Record<string, unknown>[] {
  return loggedLines().filter((line) => {
    const text = JSON.stringify(line);
    const linked = ACCOUNT_FIELDS.some((field) => field in line);
    const discloses =
      CONTENT_REASONS.some((reason) => text.includes(reason)) ||
      REFUSALS.some((refusal) => text.includes(refusal));
    return linked && discloses;
  });
}

function insideRequest<T>(work: () => Promise<T>): Promise<T> {
  return runWithTraceContext(
    { traceId: newTraceId(), spanId: newSpanId(), sampled: true, requestId: 'req-42' },
    async () => {
      setTenantScope({ userId: harness.userId });
      return work();
    },
  );
}

function jsonRequest(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  harness.lines.length = 0;
  vi.mocked(recordDenial).mockClear();
});

describe('a memory refusal that reveals a disclosure', () => {
  it('leaves no log line that ties the account to what an automatic fact disclosed', async () => {
    const db = { query: async (sql: string) => answerMemoryPolicyQuery(sql) ?? [] };

    await insideRequest(() =>
      persistManagedAutoMemoryFacts(db as never, {
        userId: harness.userId,
        candidates: ['User is a practicing Catholic', 'User has a criminal record'],
      }),
    );

    expect(accountLinkedDisclosures()).toEqual([]);
    expect(vi.mocked(recordDenial).mock.calls.map(([denial]) => denial)).toEqual([
      expect.objectContaining({ layer: 'policy', reason: 'sensitive_topic_not_opted_in' }),
      expect.objectContaining({ layer: 'policy', reason: 'prohibited_content_category' }),
    ]);
  });

  it('still names the account for a refusal that says nothing about the content', async () => {
    const db = { query: async (sql: string) => answerMemoryPolicyQuery(sql) ?? [] };

    await insideRequest(() =>
      persistManagedAutoMemoryFacts(db as never, {
        userId: harness.userId,
        candidates: ['User prefers concise answers'],
        trustMode: 'local',
      }),
    );

    expect(loggedLines()).toContainEqual(
      expect.objectContaining({
        user_id: harness.userId,
        request_id: 'req-42',
        reason: 'trust_mode_outside_managed_storage',
      }),
    );
  });

  it('answers a refused Settings write with the reason, and logs neither the reason nor the account', async () => {
    const sensitive = await POST(
      jsonRequest('http://localhost/api/memory', 'POST', {
        content: 'User has type 2 diabetes',
        source: 'auto',
      }),
    );
    const prohibited = await POST(
      jsonRequest('http://localhost/api/memory', 'POST', { content: 'User has a criminal record' }),
    );

    expect(sensitive.status).toBe(403);
    await expect(sensitive.json()).resolves.toMatchObject({
      error: { code: 'FORBIDDEN', message: sensitiveMemoryMessage('health') },
    });
    expect(prohibited.status).toBe(403);
    await expect(prohibited.json()).resolves.toMatchObject({
      error: { code: 'FORBIDDEN', message: prohibitedMemoryMessage('criminal_history') },
    });
    expect(loggedLines().some((line) => line['user_id'] === harness.userId)).toBe(true);
    expect(accountLinkedDisclosures()).toEqual([]);
  });

  it('answers a refused edit with the reason, and logs neither the reason nor the account', async () => {
    const response = await PUT(
      jsonRequest('http://localhost/api/memory/m1', 'PUT', {
        content: 'User has a criminal record',
      }),
      { params: Promise.resolve({ id: 'm1' }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'FORBIDDEN', message: prohibitedMemoryMessage('criminal_history') },
    });
    expect(loggedLines().some((line) => line['user_id'] === harness.userId)).toBe(true);
    expect(accountLinkedDisclosures()).toEqual([]);
  });
});
