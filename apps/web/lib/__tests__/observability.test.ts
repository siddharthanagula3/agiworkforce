/**
 * SCALE-VER-006 — span emission, trace correlation, and attribute redaction.
 *
 * These assert the three properties the ledger item is about:
 *   1. a span record exists at all, with the OTel-shaped fields;
 *   2. everything inside one request shares a `trace_id`, including plain
 *      `logger.*` lines that were never edited to know about tracing;
 *   3. nothing sensitive rides along in a span attribute.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  MAX_ATTRIBUTE_LENGTH,
  REDACTED,
  redactAttributes,
  redactValue,
} from '@/lib/observability/redact';
import {
  formatTraceparent,
  getTraceContext,
  newSpanId,
  newTraceId,
  parseTraceparent,
  runWithTraceContext,
  traceLogFields,
} from '@/lib/observability/trace-context';

describe('trace-context', () => {
  it('generates ids in the W3C shapes', () => {
    expect(newTraceId()).toMatch(/^[0-9a-f]{32}$/u);
    expect(newSpanId()).toMatch(/^[0-9a-f]{16}$/u);
    expect(newTraceId()).not.toBe(newTraceId());
  });

  it('joins a well-formed inbound traceparent', () => {
    const parsed = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    expect(parsed).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      sampled: true,
    });
  });

  it('reads the sampled flag as the low bit', () => {
    expect(
      parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00')?.sampled,
    ).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['null', null],
    ['too few fields', '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7'],
    ['forbidden version ff', 'ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'],
    ['all-zero trace id', `00-${'0'.repeat(32)}-00f067aa0ba902b7-01`],
    ['all-zero span id', `00-4bf92f3577b34da6a3ce929d0e0e4736-${'0'.repeat(16)}-01`],
    ['short trace id', '00-4bf92f35-00f067aa0ba902b7-01'],
    ['non-hex', '00-zzf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'],
    ['injection attempt', '00-abc\n{"level":50}-00f067aa0ba902b7-01'],
  ])('rejects %s', (_label, header) => {
    expect(parseTraceparent(header)).toBeNull();
  });

  it('round-trips through formatTraceparent', () => {
    const header = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const parsed = parseTraceparent(header);
    expect(parsed).not.toBeNull();
    expect(formatTraceparent(parsed!)).toBe(header);
  });

  it('binds context across await points and unbinds after', async () => {
    const context = { traceId: newTraceId(), spanId: newSpanId(), sampled: true };
    const seen = await runWithTraceContext(context, async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));
      return getTraceContext();
    });
    expect(seen).toEqual(context);
    expect(getTraceContext()).toBeNull();
  });

  it('exposes correlation fields only inside a context', () => {
    expect(traceLogFields()).toEqual({});
    const context = { traceId: newTraceId(), spanId: newSpanId(), sampled: true };
    runWithTraceContext(context, () => {
      expect(traceLogFields()).toEqual({
        trace_id: context.traceId,
        span_id: context.spanId,
      });
    });
  });
});

describe('redactAttributes', () => {
  it('keeps token-count attributes while redacting credential attributes', () => {
    const out = redactAttributes({
      'gen_ai.usage.input_tokens': 1200,
      'gen_ai.usage.output_tokens': 40,
      'gen_ai.request.model': 'claude-sonnet-5',
      'gen_ai.request.access_token': 'sk-ant-api03-abcdefghijklmnop',
      'http.request.header.authorization': 'Bearer abcdefghijklmnop',
      api_key: 'whatever',
      'user.email': 'someone@example.com',
      'db.query': 'select * from users where id = 7',
      'tool.arguments': 'rm -rf /',
      'gen_ai.prompt': 'my social security number is 000-00-0000',
    });

    expect(out['gen_ai.usage.input_tokens']).toBe(1200);
    expect(out['gen_ai.usage.output_tokens']).toBe(40);
    expect(out['gen_ai.request.model']).toBe('claude-sonnet-5');
    for (const key of [
      'gen_ai.request.access_token',
      'http.request.header.authorization',
      'api_key',
      'user.email',
      'db.query',
      'tool.arguments',
      'gen_ai.prompt',
    ]) {
      expect(out[key]).toBe(REDACTED);
    }
  });

  it('drops non-scalar and non-finite values instead of serializing them', () => {
    const out = redactAttributes({
      'request.state': { messages: [{ role: 'user', content: 'secret plans' }] },
      'request.list': ['a', 'b'],
      'request.fn': () => 'nope',
      'request.nan': Number.NaN,
      'request.count': 3,
    });
    expect(out).toEqual({ 'request.count': 3 });
  });

  it('masks secret-shaped substrings inside allowed string values', () => {
    const out = redactAttributes({
      'error.message': 'auth failed for sk-ant-api03-AAAAAAAAAAAAAAAAAAAA on user a@b.com',
    });
    const message = String(out['error.message']);
    expect(message).not.toContain('sk-ant-api03-AAAAAAAAAAAAAAAAAAAA');
    expect(message).not.toContain('a@b.com');
    expect(message).toContain(REDACTED);
  });

  it('truncates long strings', () => {
    const out = redactAttributes({ 'http.route': 'x'.repeat(5000) });
    expect(String(out['http.route']).length).toBe(MAX_ATTRIBUTE_LENGTH + 1);
  });

  it('masks GitHub, Stripe, Google and Slack key shapes', () => {
    expect(redactValue('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')).toBe(REDACTED);
    expect(redactValue('whsec_ABCDEFGHIJKLMNOPQRSTUV')).toBe(REDACTED);
    expect(redactValue('AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ01234')).toBe(REDACTED);
    expect(redactValue('xoxb-1234567890-abcdefghij')).toBe(REDACTED);
  });
});

// --- span emission -----------------------------------------------------------

const emitted: Array<Record<string, unknown>> = [];

vi.mock('@/lib/logger', () => ({
  logger: {
    info: (record: Record<string, unknown>) => emitted.push(record),
    error: (record: Record<string, unknown>) => emitted.push(record),
    warn: (record: Record<string, unknown>) => emitted.push(record),
    debug: (record: Record<string, unknown>) => emitted.push(record),
  },
}));

describe('withSpan', () => {
  beforeEach(() => {
    emitted.length = 0;
  });

  it('emits one completion record with OTel-shaped fields', async () => {
    const { withSpan } = await import('@/lib/observability/span');
    const result = await withSpan(
      'gen_ai.stream.start',
      { kind: 'client', domain: 'model', attributes: { 'gen_ai.request.model': 'm' } },
      () => 'value',
    );

    expect(result).toBe('value');
    expect(emitted).toHaveLength(1);
    const record = emitted[0]!;
    expect(record['event']).toBe('span');
    expect(record['span_name']).toBe('gen_ai.stream.start');
    expect(record['span_kind']).toBe('client');
    expect(record['span_domain']).toBe('model');
    expect(record['status']).toBe('ok');
    expect(record['trace_id']).toMatch(/^[0-9a-f]{32}$/u);
    expect(record['span_id']).toMatch(/^[0-9a-f]{16}$/u);
    expect(record['parent_span_id']).toBeUndefined();
    expect(typeof record['duration_ms']).toBe('number');
    expect(record['gen_ai.request.model']).toBe('m');
  });

  it('shares one trace_id across nested spans and links parent to child', async () => {
    const { withSpan } = await import('@/lib/observability/span');
    await withSpan('outer', { domain: 'task' }, async () => {
      await withSpan('inner', { domain: 'tool' }, async () => {
        await withSpan('leaf', { domain: 'external' }, () => undefined);
      });
    });

    expect(emitted.map((r) => r['span_name'])).toEqual(['leaf', 'inner', 'outer']);
    const traceIds = new Set(emitted.map((r) => r['trace_id']));
    expect(traceIds.size).toBe(1);

    const byName = new Map(emitted.map((r) => [r['span_name'], r]));
    expect(byName.get('leaf')!['parent_span_id']).toBe(byName.get('inner')!['span_id']);
    expect(byName.get('inner')!['parent_span_id']).toBe(byName.get('outer')!['span_id']);
    expect(byName.get('outer')!['parent_span_id']).toBeUndefined();
  });

  it('joins an ambient trace context rather than starting a new trace', async () => {
    const { withSpan } = await import('@/lib/observability/span');
    const traceId = newTraceId();
    const spanId = newSpanId();
    await runWithTraceContext({ traceId, spanId, sampled: true }, () =>
      withSpan('child', { domain: 'billing' }, () => undefined),
    );
    expect(emitted[0]!['trace_id']).toBe(traceId);
    expect(emitted[0]!['parent_span_id']).toBe(spanId);
  });

  it('records failure and re-throws the original error unchanged', async () => {
    const { withSpan } = await import('@/lib/observability/span');
    const boom = new TypeError('upstream refused');
    await expect(
      withSpan('failing', { domain: 'model' }, () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!['status']).toBe('error');
    expect(emitted[0]!['error.type']).toBe('TypeError');
    expect(emitted[0]!['error.message']).toBe('upstream refused');
  });

  it('redacts the error message it records', async () => {
    const { withSpan } = await import('@/lib/observability/span');
    await expect(
      withSpan('failing', { domain: 'model' }, () => {
        throw new Error('401 from key sk-ant-api03-AAAAAAAAAAAAAAAAAAAA');
      }),
    ).rejects.toThrow();
    expect(String(emitted[0]!['error.message'])).not.toContain('sk-ant-api03');
  });

  it('redacts attributes added mid-span via setAttributes', async () => {
    const { withSpan } = await import('@/lib/observability/span');
    await withSpan('tool', { domain: 'tool' }, (span) => {
      span.setAttributes({ 'tool.arguments': 'delete everything', 'tool.result_count': 2 });
    });
    expect(emitted[0]!['tool.arguments']).toBe(REDACTED);
    expect(emitted[0]!['tool.result_count']).toBe(2);
  });
});
