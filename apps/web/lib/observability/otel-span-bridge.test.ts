import { SpanStatusCode, context as otelContext, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import pino from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { logger } from '@/lib/logger';
import { runWithPhaseTimer, timePhase } from './phase-timer';
import { withSpan } from './span';
import { runWithTraceContext } from './trace-context';

const streamSym = pino.symbols.streamSym as unknown as symbol;
type Writable = { write(chunk: string): void };
type LogRecord = Record<string, unknown>;

let records: LogRecord[];
let originalStream: Writable;

beforeEach(() => {
  records = [];
  const holder = logger as unknown as Record<symbol, Writable>;
  originalStream = holder[streamSym]!;
  holder[streamSym] = {
    write(chunk: string) {
      for (const line of chunk.split('\n')) {
        if (line.trim()) records.push(JSON.parse(line) as LogRecord);
      }
    },
  };
});

afterEach(() => {
  (logger as unknown as Record<symbol, Writable>)[streamSym] = originalStream;
});

function spanRecord(name: string): LogRecord {
  const record = records.find((entry) => entry['span_name'] === name);
  if (!record) throw new Error(`no pino span record for ${name}`);
  return record;
}

describe('withSpan with no OpenTelemetry SDK installed', () => {
  it('keeps the hand-rolled ids and shares one trace id across nesting', async () => {
    let outerId = '';
    let innerId = '';
    let outerSpanId = '';
    let innerSpanId = '';

    await withSpan('outer', { domain: 'model' }, async (outer) => {
      outerId = outer.traceId;
      outerSpanId = outer.spanId;
      await withSpan('inner', { domain: 'tool' }, (inner) => {
        innerId = inner.traceId;
        innerSpanId = inner.spanId;
      });
    });

    expect(innerId).toBe(outerId);
    expect(innerSpanId).not.toBe(outerSpanId);
    expect(outerId).toMatch(/^[0-9a-f]{32}$/u);
    expect(spanRecord('inner')['parent_span_id']).toBe(outerSpanId);
    expect(spanRecord('outer')['trace_id']).toBe(outerId);
  });

  it('inherits the trace id from an ambient inbound context', async () => {
    const inbound = {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      sampled: true,
    };
    const seen = await runWithTraceContext(inbound, () =>
      withSpan('joined', { domain: 'http' }, (span) => span.traceId),
    );
    expect(seen).toBe(inbound.traceId);
    expect(spanRecord('joined')['parent_span_id']).toBe(inbound.spanId);
  });
});

describe('withSpan with an OpenTelemetry SDK installed', () => {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const contextManager = new AsyncLocalStorageContextManager();

  beforeAll(() => {
    trace.setGlobalTracerProvider(provider);
    otelContext.setGlobalContextManager(contextManager.enable());
  });

  afterAll(async () => {
    await provider.shutdown();
    trace.disable();
    otelContext.disable();
    contextManager.disable();
  });

  beforeEach(() => {
    exporter.reset();
  });

  function exported(name: string): ReadableSpan {
    const span = exporter.getFinishedSpans().find((entry) => entry.name === name);
    if (!span) throw new Error(`no exported span named ${name}`);
    return span;
  }

  it('takes its ids from the SDK and reports the same ones on every pino line', async () => {
    let reported = { traceId: '', spanId: '' };
    await withSpan('sdk.owned', { domain: 'model' }, (span) => {
      reported = { traceId: span.traceId, spanId: span.spanId };
      logger.info({ event: 'inside' }, 'inside the span');
    });

    const span = exported('sdk.owned');
    expect(reported.traceId).toBe(span.spanContext().traceId);
    expect(reported.spanId).toBe(span.spanContext().spanId);
    expect(spanRecord('sdk.owned')['trace_id']).toBe(span.spanContext().traceId);
    expect(spanRecord('sdk.owned')['span_id']).toBe(span.spanContext().spanId);

    const inside = records.find((entry) => entry['event'] === 'inside');
    expect(inside?.['trace_id']).toBe(span.spanContext().traceId);
    expect(inside?.['span_id']).toBe(span.spanContext().spanId);
  });

  it('nests real parent and child spans on one trace id', async () => {
    await withSpan('parent', { domain: 'model' }, async () => {
      await withSpan('child', { domain: 'tool' }, () => undefined);
    });

    const parent = exported('parent');
    const child = exported('child');
    expect(child.spanContext().traceId).toBe(parent.spanContext().traceId);
    expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
    expect(spanRecord('child')['parent_span_id']).toBe(parent.spanContext().spanId);
  });

  it('joins an ambient inbound context as the remote parent', async () => {
    const inbound = {
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      sampled: true,
    };
    await runWithTraceContext(inbound, () =>
      withSpan('joined.sdk', { domain: 'http' }, () => undefined),
    );

    const span = exported('joined.sdk');
    expect(span.spanContext().traceId).toBe(inbound.traceId);
    expect(span.parentSpanContext?.spanId).toBe(inbound.spanId);
  });

  it('redacts span attributes before they reach the exporter', async () => {
    await withSpan(
      'redacting',
      {
        domain: 'tool',
        attributes: { api_key: 'sk-live-0123456789abcdef', route_id: 'primary' },
      },
      (span) => {
        span.setAttributes({ contact: 'someone@example.com' });
      },
    );

    const span = exported('redacting');
    expect(span.attributes['api_key']).toBe('[redacted]');
    expect(span.attributes['contact']).toBe('[redacted]');
    expect(span.attributes['route_id']).toBe('primary');
    expect(span.attributes['span_domain']).toBe('tool');
  });

  it('sets an error status and a masked exception message', async () => {
    await expect(
      withSpan('failing', { domain: 'external' }, () => {
        throw new Error('upstream rejected sk-live-0123456789abcdef');
      }),
    ).rejects.toThrow();

    const span = exported('failing');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.attributes['exception.type']).toBe('Error');
    expect(String(span.attributes['exception.message'])).toContain('[redacted]');
    expect(String(span.attributes['exception.message'])).not.toContain('sk-live');
  });

  it('records each chat turn phase as an event on the surrounding span', async () => {
    await runWithPhaseTimer(() =>
      withSpan('chat.turn', { kind: 'server', domain: 'model' }, async () => {
        await timePhase('auth_gate', async () => undefined);
        await timePhase('provider_stream', async () => undefined);
      }),
    );

    const events = exported('chat.turn').events.map((event) => event.name);
    expect(events).toEqual(['auth_gate', 'provider_stream']);
    expect(exported('chat.turn').events[0]?.attributes?.['duration_ms']).toBeTypeOf('number');
  });
});
