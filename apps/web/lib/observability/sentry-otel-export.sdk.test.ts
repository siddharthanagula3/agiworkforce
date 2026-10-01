// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { context, metrics, SpanStatusCode, trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/nextjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { commonInitOptions } from '../sentry-shared';
import { tagRequestOrganization } from '../../instrumentation';
import { recordSpanEvent, startBridgedSpan } from './otel-span-bridge';
import { withSpan } from './span';
import {
  installTraceStorage,
  runWithTraceContext,
  setTenantScope,
  type TraceContext,
} from './trace-context';
import { AsyncLocalStorage } from 'node:async_hooks';
import { runWithPhaseTimer, timePhase } from './phase-timer';
import { takeSpanEvents } from './span-events';
import { PrivacyFilteredSpanExporter, readableSentrySpan } from './sentry-otel-export';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ExportResultCode } from '@opentelemetry/core';
import { resolveOtelExportConfig } from './otel-config';
import { startOtelSdk, type OtelTracing } from './otel-sdk';

type SdkEnvelope = Parameters<NonNullable<ReturnType<typeof Sentry.getClient>>['sendEnvelope']>[0];
type OtlpSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  attributes: unknown[];
};
type OtlpPayload = { resourceSpans: { scopeSpans: { spans: OtlpSpan[] }[] }[] };
const receipts: { path: string; payload: OtlpPayload }[] = [];
const envelopes: SdkEnvelope[] = [];
let server: Server;
let endpoint: string;
let client: NonNullable<ReturnType<typeof Sentry.init>>;
let tracing: OtelTracing | undefined;
let privateBoundary = false;
let collectorFailure = false;
let policyFailure = false;
let deferredPolicy: Promise<void> | undefined;

function spans(path: string): OtlpSpan[] {
  return receipts
    .filter((receipt) => receipt.path === path)
    .flatMap((receipt) => receipt.payload.resourceSpans)
    .flatMap((resource) => resource.scopeSpans)
    .flatMap((scope) => scope.spans);
}

function start() {
  const config = resolveOtelExportConfig({
    AGI_OTEL_EXPORTER_ENDPOINT: endpoint,
    AGI_OTEL_SAMPLE_RATIO: '0',
    AGI_OTEL_SLOW_SPAN_MS: '100',
  });
  expect(config).not.toBeNull();
  tracing = startOtelSdk(config!, client);
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      receipts.push({
        path: request.url!,
        payload: JSON.parse(Buffer.concat(chunks).toString()) as OtlpPayload,
      });
      response.statusCode = collectorFailure && request.url === '/v1/traces' ? 400 : 200;
      response.setHeader('content-type', 'application/json');
      response.end('{}');
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Owned collector unavailable');
  endpoint = `http://127.0.0.1:${address.port}`;
  const options = commonInitOptions({
    tracesSampleRate: 1,
    enableOpenTelemetrySetup: true,
    tenantTagHook: tagRequestOrganization,
  });
  client = Sentry.init({
    ...options,
    dsn: `${endpoint.replace('://', '://publickey@')}/1`,
    enabled: true,
    defaultIntegrations: [],
    beforeSendTransaction: (event, hint) => {
      if (policyFailure) throw new Error('Synthetic policy refusal');
      if (deferredPolicy)
        return deferredPolicy.then(() => options.beforeSendTransaction(event, hint));
      return privateBoundary ? null : options.beforeSendTransaction(event, hint);
    },
    transport: () => ({
      send(envelope: SdkEnvelope) {
        envelopes.push(envelope);
        return Promise.resolve({ statusCode: 200 });
      },
      flush: () => Promise.resolve(true),
    }),
  })!;
  expect(client).toBeDefined();
  installTraceStorage(new AsyncLocalStorage<TraceContext>());
});

beforeEach(() => {
  receipts.length = 0;
  envelopes.length = 0;
  privateBoundary = false;
  collectorFailure = false;
  policyFailure = false;
  deferredPolicy = undefined;
});

afterEach(async () => {
  await tracing?.shutdown();
  tracing = undefined;
  metrics.disable();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await client.close();
  trace.disable();
  context.disable();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('installed dual trace exporters', () => {
  it('joins canonical bridged and native spans in both nesting directions', async () => {
    start();
    const expected: { traceId: string; spanId: string; parentSpanId?: string }[] = [];
    Sentry.startSpan({ name: 'native-mixed-root' }, (root) => {
      root.setStatus({ code: SpanStatusCode.ERROR });
      expected.push({ traceId: root.spanContext().traceId, spanId: root.spanContext().spanId });
      const bridged = startBridgedSpan('bridged-child', 'internal', null);
      bridged.setError('synthetic', 'Synthetic refusal');
      expected.push({
        traceId: bridged.traceId,
        spanId: bridged.spanId,
        parentSpanId: root.spanContext().spanId,
      });
      bridged.runWith(() =>
        Sentry.startSpan({ name: 'native-grandchild' }, (child) => {
          child.setStatus({ code: SpanStatusCode.ERROR });
          expected.push({
            traceId: child.spanContext().traceId,
            spanId: child.spanContext().spanId,
            parentSpanId: bridged.spanId,
          });
        }),
      );
      bridged.end();
    });
    const bridgedRoot = startBridgedSpan('bridged-mixed-root', 'internal', null);
    bridgedRoot.setError('synthetic', 'Synthetic refusal');
    expected.push({ traceId: bridgedRoot.traceId, spanId: bridgedRoot.spanId });
    bridgedRoot.runWith(() =>
      Sentry.startSpan({ name: 'native-child' }, (native) => {
        native.setStatus({ code: SpanStatusCode.ERROR });
        expected.push({
          traceId: native.spanContext().traceId,
          spanId: native.spanContext().spanId,
          parentSpanId: bridgedRoot.spanId,
        });
        const child = startBridgedSpan('bridged-grandchild', 'internal', null);
        child.setError('synthetic', 'Synthetic refusal');
        expected.push({
          traceId: child.traceId,
          spanId: child.spanId,
          parentSpanId: native.spanContext().spanId,
        });
        child.end();
      }),
    );
    bridgedRoot.end();
    await tracing!.shutdown();
    tracing = undefined;
    await expect(client.flush()).resolves.toBe(true);
    const exported = spans('/v1/traces');
    expect(exported).toHaveLength(6);
    expect(new Set(exported.map((span) => span.spanId)).size).toBe(6);
    for (const span of expected) {
      expect(exported.find((entry) => entry.spanId === span.spanId)).toMatchObject(span);
    }
    const transactions = envelopes
      .flatMap<SdkEnvelope[1][number]>((envelope) => envelope[1])
      .filter(([header]) => header.type === 'transaction');
    expect(transactions).toHaveLength(2);
    for (const span of expected) expect(JSON.stringify(transactions)).toContain(span.spanId);
  });

  it('retains the actual tenant hook for two concurrent canonical span owners after batching', async () => {
    start();
    const expected = new Map<string, string>();
    await Promise.all(
      ['first', 'second'].map((organization, index) =>
        runWithTraceContext(
          {
            traceId: String(index + 1).repeat(32),
            spanId: String(index + 1).repeat(16),
            sampled: true,
          },
          () =>
            withSpan(
              `tenant-${organization}`,
              { domain: 'database', attributes: { organization_id: 'synthetic-spoof' } },
              async (span) => {
                await Promise.resolve();
                setTenantScope({ organizationId: `synthetic-${organization}` });
                expected.set(span.spanId, `synthetic-${organization}`);
                span.refuse('synthetic', 'Synthetic refusal');
              },
            ),
        ),
      ),
    );
    await runWithTraceContext(
      {
        traceId: '3'.repeat(32),
        spanId: '3'.repeat(16),
        sampled: true,
        organizationId: 'synthetic-outside',
      },
      () => tracing!.shutdown(),
    );
    tracing = undefined;
    await expect(client.flush()).resolves.toBe(true);
    const exported = spans('/v1/traces');
    expect(exported).toHaveLength(2);
    for (const [spanId, organization] of expected) {
      const span = exported.find((entry) => entry.spanId === spanId);
      expect(span).toBeDefined();
      expect(span!.attributes).toContainEqual({
        key: 'organization_id',
        value: { stringValue: organization },
      });
    }
    const transactions = envelopes
      .flatMap<SdkEnvelope[1][number]>((envelope) => envelope[1])
      .filter(([header]) => header.type === 'transaction');
    expect(transactions).toHaveLength(2);
    for (const [spanId, organization] of expected) {
      const transaction = transactions.find(([, payload]) =>
        JSON.stringify(payload).includes(spanId),
      );
      expect(transaction).toBeDefined();
      expect(transaction![1]).toMatchObject({ tags: { organization_id: organization } });
    }
    expect(JSON.stringify(receipts)).not.toContain('synthetic-outside');
    expect(JSON.stringify(transactions)).not.toContain('synthetic-outside');
  });

  it('keeps nested canonical tenant scopes separate through inherited SDK processors', async () => {
    start();
    let parentId = '';
    let childId = '';
    await withSpan('tenant-parent', { domain: 'database' }, async (parent) => {
      parentId = parent.spanId;
      setTenantScope({ organizationId: 'synthetic-parent' });
      await withSpan('tenant-child', { domain: 'database' }, (child) => {
        childId = child.spanId;
        setTenantScope({ organizationId: 'synthetic-child' });
        child.refuse('synthetic', 'Synthetic refusal');
      });
      parent.refuse('synthetic', 'Synthetic refusal');
    });
    await tracing!.shutdown();
    tracing = undefined;
    await expect(client.flush()).resolves.toBe(true);
    const exported = spans('/v1/traces');
    expect(exported).toHaveLength(2);
    expect(exported.find((span) => span.spanId === childId)).toMatchObject({
      parentSpanId: parentId,
    });
    for (const [spanId, organization] of [
      [parentId, 'synthetic-parent'],
      [childId, 'synthetic-child'],
    ]) {
      expect(exported.find((span) => span.spanId === spanId)!.attributes).toContainEqual({
        key: 'organization_id',
        value: { stringValue: organization },
      });
    }
    const transactions = envelopes
      .flatMap<SdkEnvelope[1][number]>((envelope) => envelope[1])
      .filter(([header]) => header.type === 'transaction');
    expect(transactions).toHaveLength(1);
    expect(transactions[0]![1]).toMatchObject({ tags: { organization_id: 'synthetic-parent' } });
    expect(JSON.stringify(transactions[0]![1])).toContain(childId);
  });

  it('does not promote caller attributes or later tenant scopes when the canonical owner is absent or invalid', async () => {
    start();
    const expected: string[] = [];
    for (const organizationId of [undefined, '', 42 as unknown as string]) {
      await runWithTraceContext(
        {
          traceId: '4'.repeat(32),
          spanId: '4'.repeat(16),
          sampled: true,
          organizationId,
        },
        () =>
          withSpan(
            'tenant-unowned',
            {
              domain: 'database',
              attributes: { organization_id: 'synthetic-spoof' },
            },
            (span) => {
              expected.push(span.spanId);
              span.refuse('synthetic', 'Synthetic refusal');
            },
          ),
      );
    }
    Sentry.startSpan(
      { name: 'native-unowned', attributes: { organization_id: 'synthetic-spoof' } },
      (span) => {
        expected.push(span.spanContext().spanId);
        span.setStatus({ code: SpanStatusCode.ERROR });
      },
    );
    await runWithTraceContext(
      {
        traceId: '5'.repeat(32),
        spanId: '5'.repeat(16),
        sampled: true,
        organizationId: 'synthetic-unrelated',
      },
      () => tracing!.shutdown(),
    );
    tracing = undefined;
    await expect(client.flush()).resolves.toBe(true);
    const exported = spans('/v1/traces');
    expect(exported).toHaveLength(4);
    const transactions = envelopes
      .flatMap<SdkEnvelope[1][number]>((envelope) => envelope[1])
      .filter(([header]) => header.type === 'transaction');
    expect(transactions).toHaveLength(4);
    for (const spanId of expected) {
      const span = exported.find((entry) => entry.spanId === spanId);
      expect(span).toBeDefined();
      expect(
        span!.attributes.some(
          (attribute) => (attribute as { key: string }).key === 'organization_id',
        ),
      ).toBe(false);
      const transaction = transactions.find(([, payload]) =>
        JSON.stringify(payload).includes(spanId),
      );
      expect(transaction).toBeDefined();
      expect(transaction![1]).not.toHaveProperty('tags.organization_id');
    }
    expect(JSON.stringify(receipts)).not.toContain('synthetic-unrelated');
    expect(JSON.stringify(transactions)).not.toContain('synthetic-unrelated');
  });

  it('retains native trace hierarchy and only exports sampled, failed or slow spans to the collector', async () => {
    start();
    const now = Date.now() / 1000;
    let rootId = '';
    let childId = '';
    let traceId = '';
    Sentry.startSpan({ name: 'native-root', startTime: now - 1 }, (root) => {
      ({ spanId: rootId, traceId } = root.spanContext());
      const child = Sentry.startInactiveSpan({
        name: 'GET https://provider.example.com/path?code=private-query',
        startTime: now - 0.5,
        attributes: {
          'http.request.body.content': 'private-body',
          detail: '/Users/synthetic/private/file.txt',
        },
      });
      childId = child.spanContext().spanId;
      child.setStatus({ code: SpanStatusCode.ERROR });
      child.end(now);
      root.end(now);
    });
    const fast = Sentry.startInactiveSpan({ name: 'fast-control', startTime: now });
    const fastId = fast.spanContext().spanId;
    fast.end(now + 0.001);
    await tracing!.shutdown();
    tracing = undefined;
    await expect(client.flush()).resolves.toBe(true);
    const exported = spans('/v1/traces');
    expect(exported).toHaveLength(2);
    expect(exported.find((span) => span.spanId === rootId)?.traceId).toBe(traceId);
    expect(exported.find((span) => span.spanId === childId)).toMatchObject({
      traceId,
      parentSpanId: rootId,
    });
    expect(exported.some((span) => span.spanId === fastId)).toBe(false);
    expect(spans('/api/1/integration/otlp/v1/traces/')).toHaveLength(0);
    const transactions = envelopes
      .flatMap<SdkEnvelope[1][number]>((envelope) => envelope[1])
      .filter(([header]) => header.type === 'transaction');
    expect(transactions).toHaveLength(2);
    expect(JSON.stringify(transactions)).toContain(childId);
    const wire = JSON.stringify(receipts);
    expect(wire).not.toContain('private-query');
    expect(wire).not.toContain('private-body');
    expect(wire).not.toContain('/Users/synthetic/private/file.txt');
  });

  it('sends the same OTel parent tree once to both sinks and links an actual error to its active child', async () => {
    start();
    const tracer = trace.getTracer('synthetic-dual-control');
    const root = tracer.startSpan('otel-root');
    root.setStatus({ code: SpanStatusCode.ERROR });
    const child = tracer.startSpan('otel-child', {}, trace.setSpan(context.active(), root));
    child.setStatus({ code: SpanStatusCode.ERROR });
    child.setAttribute('url.full', 'https://provider.example.com/path?code=private-query');
    child.setAttribute('http.request.body.content', 'private-body');
    child.setAttribute('detail', '/Users/synthetic/private/file.txt');
    child.setAttribute('safe_tags', ['first', 'second']);
    await context.with(trace.setSpan(context.active(), child), async () => {
      await runWithPhaseTimer(() => timePhase('provider_stream', async () => undefined));
      recordSpanEvent('phase', { duration_ms: 12, content: 'private-event-body' });
      Sentry.captureException(new Error('synthetic-linked-error'));
    });
    child.end();
    root.end();
    await tracing!.shutdown();
    tracing = undefined;
    await expect(client.flush()).resolves.toBe(true);
    for (const path of ['/v1/traces']) {
      const exported = spans(path);
      expect(exported).toHaveLength(2);
      expect(exported.find((span) => span.spanId === root.spanContext().spanId)?.traceId).toBe(
        root.spanContext().traceId,
      );
      expect(exported.find((span) => span.spanId === child.spanContext().spanId)).toMatchObject({
        traceId: root.spanContext().traceId,
        parentSpanId: root.spanContext().spanId,
      });
      expect(exported.find((span) => span.spanId === child.spanContext().spanId)).toMatchObject({
        events: [
          {
            name: 'provider_stream',
            attributes: expect.arrayContaining([
              { key: 'duration_ms', value: { intValue: expect.any(Number) } },
            ]),
          },
          {
            name: 'phase',
            attributes: expect.arrayContaining([{ key: 'duration_ms', value: { intValue: 12 } }]),
          },
        ],
      });
    }
    const items = envelopes.flatMap<SdkEnvelope[1][number]>((envelope) => envelope[1]);
    expect(
      items.filter(([header]) => header.type === 'transaction' || header.type === 'span'),
    ).toHaveLength(1);
    expect(JSON.stringify(items.filter(([header]) => header.type === 'transaction'))).toContain(
      child.spanContext().spanId,
    );
    expect(spans('/api/1/integration/otlp/v1/traces/')).toHaveLength(0);
    const errors = items.filter(([header]) => header.type === 'event');
    expect(errors).toHaveLength(1);
    expect(errors[0]![1]).toMatchObject({
      contexts: {
        trace: { trace_id: child.spanContext().traceId, span_id: child.spanContext().spanId },
      },
    });
    const wire = JSON.stringify(receipts);
    for (const value of [
      'private-query',
      'private-body',
      'private-event-body',
      '/Users/synthetic/private/file.txt',
    ]) {
      expect(wire).not.toContain(value);
    }
  });

  it('applies the current transaction refusal to both OTel sinks and native forwarding', async () => {
    start();
    const native = Sentry.startInactiveSpan({
      name: 'refused-native',
      startTime: Date.now() / 1000 - 1,
    });
    const otel = trace.getTracer('synthetic-refusal').startSpan('refused-otel');
    otel.setStatus({ code: SpanStatusCode.ERROR });
    privateBoundary = true;
    native.end();
    otel.end();
    await tracing!.shutdown();
    tracing = undefined;
    await expect(client.flush()).resolves.toBe(true);
    expect(receipts).toHaveLength(0);
    expect(
      envelopes
        .flatMap<SdkEnvelope[1][number]>((envelope) => envelope[1])
        .filter(([header]) => header.type === 'transaction' || header.type === 'span'),
    ).toHaveLength(0);
  });

  it('contains a failed collector without suppressing or duplicating the Sentry sink', async () => {
    start();
    collectorFailure = true;
    const span = trace.getTracer('synthetic-failure').startSpan('collector-failure');
    expect(span.isRecording()).toBe(true);
    span.setStatus({ code: SpanStatusCode.ERROR });
    expect(() => span.end()).not.toThrow();
    await tracing!.shutdown().catch(() => undefined);
    tracing = undefined;
    await expect(client.flush()).resolves.toBe(true);
    const transactions = envelopes
      .flatMap<SdkEnvelope[1][number]>((envelope) => envelope[1])
      .filter(([header]) => header.type === 'transaction');
    expect(transactions).toHaveLength(1);
    expect(JSON.stringify(transactions)).toContain(span.spanContext().spanId);
    expect(spans('/api/1/integration/otlp/v1/traces/')).toHaveLength(0);
    const attempts = spans('/v1/traces');
    expect(attempts.length).toBeGreaterThan(0);
    expect(new Set(attempts.map((attempt) => attempt.spanId))).toEqual(
      new Set([span.spanContext().spanId]),
    );
  });

  it('fails closed in both sinks when the current transaction policy throws', async () => {
    start();
    const span = startBridgedSpan('policy-throw', 'internal', null);
    expect(span.sampled).toBe(true);
    span.setError('synthetic', 'Synthetic refusal');
    policyFailure = true;
    expect(() => span.end()).not.toThrow();
    await tracing!.shutdown().catch(() => undefined);
    tracing = undefined;
    await expect(client.flush()).resolves.toBe(true);
    expect(receipts).toHaveLength(0);
    expect(
      envelopes
        .flatMap<SdkEnvelope[1][number]>((envelope) => envelope[1])
        .filter(([header]) => header.type === 'transaction' || header.type === 'span'),
    ).toHaveLength(0);
  });

  it('bounds canonical phase events using SDK limits and releases them on the actual native end', async () => {
    vi.stubEnv('OTEL_SPAN_EVENT_COUNT_LIMIT', '2');
    vi.stubEnv('OTEL_SPAN_ATTRIBUTE_PER_EVENT_COUNT_LIMIT', '1');
    start();
    const span = trace.getTracer('synthetic-event-limit').startSpan('event-limit');
    span.setStatus({ code: SpanStatusCode.ERROR });
    context.with(trace.setSpan(context.active(), span), () => {
      for (const name of ['first', 'second', 'third'])
        recordSpanEvent(name, { duration_ms: 12, detail: 'safe-detail' });
    });
    span.end();
    expect(takeSpanEvents(span).events).toHaveLength(0);
    vi.stubEnv('OTEL_SPAN_EVENT_COUNT_LIMIT', '0');
    const zero = trace.getTracer('synthetic-event-limit').startSpan('zero-event-limit');
    zero.setStatus({ code: SpanStatusCode.ERROR });
    context.with(trace.setSpan(context.active(), zero), () =>
      recordSpanEvent('refused-event', { duration_ms: 12 }),
    );
    zero.end();
    expect(takeSpanEvents(zero).events).toHaveLength(0);
    await tracing!.shutdown();
    tracing = undefined;
    const exported = spans('/v1/traces');
    expect(exported).toHaveLength(2);
    expect(exported.find((entry) => entry.spanId === span.spanContext().spanId)).toMatchObject({
      droppedEventsCount: 1,
      events: [
        {
          name: 'second',
          droppedAttributesCount: 1,
          attributes: [{ key: 'duration_ms', value: { intValue: 12 } }],
        },
        {
          name: 'third',
          droppedAttributesCount: 1,
          attributes: [{ key: 'duration_ms', value: { intValue: 12 } }],
        },
      ],
    });
    expect(exported.find((entry) => entry.spanId === zero.spanContext().spanId)).toMatchObject({
      droppedEventsCount: 1,
    });
    expect(JSON.stringify(exported)).not.toContain('refused-event');
  });

  it('refuses a delayed policy completion after the exporter owner has shut down', async () => {
    let release!: () => void;
    deferredPolicy = new Promise<void>((resolve) => {
      release = resolve;
    });
    const span = Sentry.startInactiveSpan({ name: 'delayed-policy' });
    expect(span.isRecording()).toBe(true);
    span.end();
    const readable = readableSentrySpan(span, resourceFromAttributes({}));
    expect(readable).not.toBeNull();
    const inner = { export: vi.fn(), shutdown: vi.fn(async () => undefined) };
    const exporter = new PrivacyFilteredSpanExporter(inner, client);
    const completed = new Promise<{ code: ExportResultCode }>((resolve) =>
      exporter.export([readable!], resolve),
    );
    await exporter.shutdown();
    release();
    await expect(completed).resolves.toMatchObject({ code: ExportResultCode.FAILED });
    expect(inner.export).not.toHaveBeenCalled();
    expect(inner.shutdown).toHaveBeenCalledTimes(1);
    await expect(client.flush()).resolves.toBe(true);
  });
});
