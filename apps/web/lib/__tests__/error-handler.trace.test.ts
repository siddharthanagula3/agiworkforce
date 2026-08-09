/**
 * SCALE-VER-006 — the request-level half, exercised through the real wrapper
 * that 150+ route files export their handlers through.
 *
 * The logger here is the real `lib/logger.ts` pino instance, not a stub: the
 * point of these assertions is that an ordinary `logger.info` written years
 * before tracing existed now carries the request's `trace_id`. Swapping the
 * pino destination is the only way to read what it actually wrote.
 */

import { NextResponse } from 'next/server';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { createError } from '@/lib/errors';
import { getTraceContext, parseTraceparent } from '@/lib/observability/trace-context';

const INBOUND = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
const INBOUND_TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';

const streamSym = pino.symbols.streamSym as unknown as symbol;
type Writable = { write(chunk: string): void };

let records: Array<Record<string, unknown>>;
let originalStream: Writable;

beforeEach(() => {
  records = [];
  const holder = logger as unknown as Record<symbol, Writable>;
  originalStream = holder[streamSym]!;
  holder[streamSym] = {
    write(chunk: string) {
      for (const line of chunk.split('\n')) {
        if (line.trim()) records.push(JSON.parse(line) as Record<string, unknown>);
      }
    },
  };
});

afterEach(() => {
  (logger as unknown as Record<symbol, Writable>)[streamSym] = originalStream;
});

function request(headers: Record<string, string> = {}): Request {
  return new Request('https://app.example.com/api/things?q=secret-search-term', {
    method: 'POST',
    headers,
  });
}

describe('withErrorHandler tracing', () => {
  it('joins an inbound traceparent and echoes it on the response', async () => {
    const handler = withErrorHandler(async (_request: Request) => NextResponse.json({ ok: true }));
    const response = await handler(request({ traceparent: INBOUND }));

    expect(response.headers.get('x-request-id')).toBe(INBOUND_TRACE_ID);
    const outbound = parseTraceparent(response.headers.get('traceparent'));
    expect(outbound?.traceId).toBe(INBOUND_TRACE_ID);
    // A fresh child span id, not the caller's.
    expect(outbound?.spanId).not.toBe('00f067aa0ba902b7');
  });

  it('echoes a token-safe inbound x-request-id and rejects a hostile one', async () => {
    const handler = withErrorHandler(async (_request: Request) => NextResponse.json({ ok: true }));

    const kept = await handler(request({ 'x-request-id': 'req_abc-123.def~4' }));
    expect(kept.headers.get('x-request-id')).toBe('req_abc-123.def~4');

    const rejected = await handler(
      request({ traceparent: INBOUND, 'x-request-id': 'a'.repeat(400) }),
    );
    expect(rejected.headers.get('x-request-id')).toBe(INBOUND_TRACE_ID);
  });

  it('starts a fresh trace when the inbound header is malformed', async () => {
    const handler = withErrorHandler(async (_request: Request) => NextResponse.json({ ok: true }));
    const response = await handler(request({ traceparent: 'not-a-traceparent' }));

    const outbound = parseTraceparent(response.headers.get('traceparent'));
    expect(outbound).not.toBeNull();
    expect(outbound?.traceId).not.toBe(INBOUND_TRACE_ID);
    expect(response.headers.get('x-request-id')).toBe(outbound?.traceId);
  });

  it('binds the trace context for the handler body', async () => {
    let seen: string | undefined;
    const handler = withErrorHandler(async (_request: Request) => {
      seen = getTraceContext()?.traceId;
      return NextResponse.json({ ok: true });
    });
    await handler(request({ traceparent: INBOUND }));
    expect(seen).toBe(INBOUND_TRACE_ID);
    expect(getTraceContext()).toBeNull();
  });

  it('stamps trace_id onto ordinary logger calls made inside the handler', async () => {
    const handler = withErrorHandler(async (_request: Request) => {
      logger.info({ event: 'thing_created' }, 'created');
      return NextResponse.json({ ok: true });
    });
    await handler(request({ traceparent: INBOUND }));

    const line = records.find((r) => r['event'] === 'thing_created');
    expect(line).toBeDefined();
    expect(line!['trace_id']).toBe(INBOUND_TRACE_ID);
    expect(line!['span_id']).toEqual(expect.stringMatching(/^[0-9a-f]{16}$/u));
  });

  it('emits an http.server span carrying the method, path and status', async () => {
    const handler = withErrorHandler(async (_request: Request) => NextResponse.json({ ok: true }));
    await handler(request({ traceparent: INBOUND }));

    const span = records.find((r) => r['span_name'] === 'http.server');
    expect(span).toBeDefined();
    expect(span!['event']).toBe('span');
    expect(span!['span_kind']).toBe('server');
    expect(span!['span_domain']).toBe('http');
    expect(span!['trace_id']).toBe(INBOUND_TRACE_ID);
    expect(span!['parent_span_id']).toBe('00f067aa0ba902b7');
    expect(span!['status']).toBe('ok');
    expect(span!['http.request.method']).toBe('POST');
    expect(span!['http.response.status_code']).toBe(200);
    expect(span!['url.path']).toBe('/api/things');
    // The query string is never recorded: it routinely carries search terms.
    expect(JSON.stringify(span)).not.toContain('secret-search-term');
  });

  it('records status error and still returns the mapped error response', async () => {
    const handler = withErrorHandler(async (_request: Request) => {
      throw createError.notFound('no such thing');
    });
    const response = await handler(request({ traceparent: INBOUND }));

    expect(response.status).toBe(404);
    expect(response.headers.get('x-request-id')).toBe(INBOUND_TRACE_ID);

    const span = records.find((r) => r['span_name'] === 'http.server');
    expect(span!['status']).toBe('error');
    expect(span!['http.response.status_code']).toBe(404);

    // The error log the handler already produced is correlated with the span.
    const errorLine = records.find((r) => r['span_name'] === undefined && r['level'] === 50);
    expect(errorLine?.['trace_id']).toBe(INBOUND_TRACE_ID);
  });

  it('survives a response whose headers cannot be written', async () => {
    const frozen = NextResponse.json({ ok: true });
    Object.defineProperty(frozen, 'headers', {
      value: {
        set() {
          throw new TypeError('immutable headers');
        },
        get: () => null,
      },
    });
    const handler = withErrorHandler(async (_request: Request) => frozen);
    await expect(handler(request())).resolves.toBe(frozen);
    expect(records.find((r) => r['span_name'] === 'http.server')).toBeDefined();
  });
});
