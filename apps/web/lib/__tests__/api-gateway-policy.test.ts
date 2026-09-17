import { NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCircuitBreakers } from '@agiworkforce/utils';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { API_CONTRACT_VERSION } from '@/lib/api-gateway-policy';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';

function request(method = 'POST', headers: Record<string, string> = {}): Request {
  return new Request('https://app.example.com/api/things', { method, headers });
}

async function errorOf(response: Response) {
  return ((await response.json()) as { error: { code: string; message: string } }).error;
}

beforeEach(() => {
  resetCircuitBreakers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('gateway versioning', () => {
  it('stamps the API contract version on every wrapped response', async () => {
    const handler = withErrorHandler(async (_request: Request) => NextResponse.json({ ok: true }));
    const response = await handler(request('GET'));
    expect(response.headers.get('x-agi-api-version')).toBe(API_CONTRACT_VERSION);
  });

  it('refuses a version the server does not speak before running the handler', async () => {
    const inner = vi.fn(async (_request: Request) => NextResponse.json({ ok: true }));
    const handler = withErrorHandler(inner);

    const response = await handler(request('GET', { 'x-agi-api-version': '1999-01-01' }));

    expect(response.status).toBe(400);
    expect((await errorOf(response)).message).toContain('1999-01-01');
    expect(inner).not.toHaveBeenCalled();
    expect(response.headers.get('x-agi-api-version')).toBe(API_CONTRACT_VERSION);
  });
});

describe('gateway idempotency keys', () => {
  const ok = async (_request: Request) => NextResponse.json({ ok: true });

  it('requires a key where the route declares one', async () => {
    const handler = withErrorHandler(ok, { idempotencyKey: 'required' });

    expect((await handler(request('POST'))).status).toBe(400);
    expect((await handler(request('POST', { 'idempotency-key': 'retry-key-0001' }))).status).toBe(
      200,
    );
  });

  it('rejects a malformed key and ignores reads', async () => {
    const handler = withErrorHandler(ok, { idempotencyKey: 'optional' });

    expect((await handler(request('POST', { 'idempotency-key': 'bad key!' }))).status).toBe(400);
    expect((await handler(request('POST'))).status).toBe(200);
    expect((await handler(request('GET', { 'idempotency-key': 'bad key!' }))).status).toBe(200);
  });

  it('leaves the key alone on routes that declare no idempotency policy', async () => {
    const handler = withErrorHandler(ok);
    expect((await handler(request('POST', { 'idempotency-key': 'webhook+key=' }))).status).toBe(
      200,
    );
  });
});

describe('gateway deadlines', () => {
  it('answers 504 with a readable message when the handler overruns its deadline', async () => {
    vi.useFakeTimers();
    const handler = withErrorHandler(
      (_request: Request) => new Promise<Response>(() => undefined),
      { deadlineMs: 50 },
    );

    const pending = handler(request('GET'));
    await vi.advanceTimersByTimeAsync(60);
    const response = await pending;

    expect(response.status).toBe(504);
    expect((await errorOf(response)).message).toBe(
      'This request took too long and was stopped. Try again in a moment.',
    );
  });
});

describe('gateway inbound circuit breaking', () => {
  it('opens after repeated server faults and sheds without running the handler', async () => {
    const inner = vi.fn(async (_request: Request): Promise<Response> => {
      throw new Error('database connection reset');
    });
    const handler = withErrorHandler(inner, { deadlineMs: 1_000, circuit: 'test.faulty' });

    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await handler(request('GET'))).status).toBe(500);
    }
    const callsBeforeOpen = inner.mock.calls.length;

    const shed = await handler(request('GET'));

    expect(shed.status).toBe(503);
    expect(Number(shed.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(inner.mock.calls.length).toBe(callsBeforeOpen);
  });

  it('does not open on client errors or deliberate refusals', async () => {
    let call = 0;
    const handler = withErrorHandler(
      async (_request: Request): Promise<Response> => {
        call += 1;
        if (call % 2 === 0) throw createError.notFound('Conversation not found');
        throw createError.serviceUnavailable('Workspace policy unreadable.').asUserSafe();
      },
      { deadlineMs: 1_000, circuit: 'test.deliberate' },
    );

    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await handler(request('GET'));
      expect([404, 503]).toContain(response.status);
      expect(response.headers.get('retry-after')).toBeNull();
    }
    expect(call).toBe(20);
  });
});
