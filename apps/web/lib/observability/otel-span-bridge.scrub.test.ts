import { context as otelContext, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { recordSpanEvent, startBridgedSpan } from './otel-span-bridge';

const SENSITIVE_PATH = '/Users/alice/secrets/notes.txt';
const SENSITIVE_URL = 'https://internal.example.com/accounts/42';
const SENSITIVE_TOKEN = 'sk-live-0123456789abcdef';
const SENSITIVE_MESSAGE = `failed reading ${SENSITIVE_PATH} via ${SENSITIVE_URL} using ${SENSITIVE_TOKEN}`;

describe('otel-span-bridge scrubbing', () => {
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

  it('scrubs an attribute string carrying a path, a url and a token shape', () => {
    const bridged = startBridgedSpan('attrs.scrub', 'internal', null);
    bridged.setAttributes({ detail: SENSITIVE_MESSAGE, count: 3, ready: true });
    bridged.end();

    const span = exported('attrs.scrub');
    const detail = String(span.attributes['detail']);
    expect(detail).not.toContain(SENSITIVE_PATH);
    expect(detail).not.toContain(SENSITIVE_URL);
    expect(detail).not.toContain(SENSITIVE_TOKEN);
    expect(span.attributes['count']).toBe(3);
    expect(span.attributes['ready']).toBe(true);
  });

  it('scrubs the exception type and message set on the span', () => {
    const bridged = startBridgedSpan('error.scrub', 'internal', null);
    bridged.setError(SENSITIVE_URL, SENSITIVE_MESSAGE);
    bridged.end();

    const span = exported('error.scrub');
    const type = String(span.attributes['exception.type']);
    const message = String(span.attributes['exception.message']);
    expect(type).not.toContain(SENSITIVE_URL);
    expect(message).not.toContain(SENSITIVE_PATH);
    expect(message).not.toContain(SENSITIVE_URL);
    expect(message).not.toContain(SENSITIVE_TOKEN);
    expect(span.status.message).not.toContain(SENSITIVE_TOKEN);
  });

  it('scrubs event attributes recorded on the active span', () => {
    const bridged = startBridgedSpan('event.scrub', 'internal', null);
    bridged.runWith(() => {
      recordSpanEvent('phase', { detail: SENSITIVE_MESSAGE, duration_ms: 12 });
    });
    bridged.end();

    const span = exported('event.scrub');
    const event = span.events.find((entry) => entry.name === 'phase');
    if (!event) throw new Error('expected a phase event');
    const detail = String(event.attributes?.['detail']);
    expect(detail).not.toContain(SENSITIVE_PATH);
    expect(detail).not.toContain(SENSITIVE_URL);
    expect(detail).not.toContain(SENSITIVE_TOKEN);
    expect(event.attributes?.['duration_ms']).toBe(12);
  });
});
