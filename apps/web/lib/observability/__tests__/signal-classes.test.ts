import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import pino from 'pino';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AUDIT_EVENT_SCHEMA_VERSION,
  AUDIT_RETENTION_CLASSES,
  AUDIT_RETENTION_RULES,
  createAuditEvent,
  defaultRetentionClassForAction,
} from '@agiworkforce/types';
import {
  PRODUCT_ANALYTICS_CONSENT_PURPOSE,
  PRODUCT_ANALYTICS_EVENT_NAMES,
  PRODUCT_ANALYTICS_PROPERTY_KEYS,
  PRODUCT_ANALYTICS_PROPERTY_MAX_LENGTH,
} from '@agiworkforce/types';
import { FIELDS_NEVER_LOGGED } from '@/lib/identity/log-hygiene';
import { logger } from '@/lib/logger';
import { REDACTED, redactAttributes, redactLogRecord } from '../redact';
import { METRIC_NAME, recordToolOutcome } from '../metrics';
import { withSpan } from '../span';

const SECRET = 'sk_live_9f8a7b6c5d4e3f2a1b0c';
const EMAIL = 'someone@example.com';
const BEARER = 'Bearer abcdefghijklmnop';

const streamSym = pino.symbols.streamSym as unknown as symbol;
type Writable = { write(chunk: string): void };

let records: Array<Record<string, unknown>>;
let originalStream: Writable;
let reader: PeriodicExportingMetricReader;
let provider: MeterProvider;

afterAll(() => {
  metrics.disable();
});

beforeEach(() => {
  records = [];
  const holder = logger as unknown as Record<symbol, Writable>;
  originalStream = holder[streamSym] as Writable;
  holder[streamSym] = {
    write(chunk: string) {
      for (const line of chunk.split('\n')) {
        if (line.trim()) records.push(JSON.parse(line) as Record<string, unknown>);
      }
    },
  };
  metrics.disable();
  reader = new PeriodicExportingMetricReader({
    exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
    exportIntervalMillis: 60_000,
  });
  provider = new MeterProvider({ readers: [reader] });
  metrics.setGlobalMeterProvider(provider);
});

afterEach(async () => {
  (logger as unknown as Record<symbol, Writable>)[streamSym] = originalStream;
  await provider.shutdown();
});

describe('audit keeps a promise the other two signals do not make', () => {
  it('outlives the operational window in every class it defines', () => {
    expect(AUDIT_RETENTION_CLASSES.length).toBeGreaterThan(0);
    for (const retentionClass of AUDIT_RETENTION_CLASSES) {
      const rule = AUDIT_RETENTION_RULES[retentionClass];
      expect(rule.minimumDays, retentionClass).toBeGreaterThanOrEqual(90);
      expect(rule.anonymizeOnSubjectDeletion, retentionClass).toBe(true);
    }
  });

  it('refuses to let a sweep shorten a security or compliance record', () => {
    expect(AUDIT_RETENTION_RULES.security.purgeable).toBe(false);
    expect(AUDIT_RETENTION_RULES.compliance.purgeable).toBe(false);
    expect(AUDIT_RETENTION_RULES.security.minimumDays).toBeGreaterThan(
      AUDIT_RETENTION_RULES.operational.minimumDays,
    );
    expect(AUDIT_RETENTION_RULES.compliance.minimumDays).toBeGreaterThan(
      AUDIT_RETENTION_RULES.security.minimumDays,
    );
  });

  it('puts an integrity class on every record without asking the caller', () => {
    const event = createAuditEvent({
      userId: 'usr_1',
      surface: 'web',
      action: 'data_deleted',
      resource: 'conversation',
      outcome: 'success',
    });
    expect(event.schemaVersion).toBe(AUDIT_EVENT_SCHEMA_VERSION);
    expect(event.eventId.length).toBeGreaterThan(0);
    expect(event.retentionClass).toBe(defaultRetentionClassForAction('data_deleted'));
    expect(AUDIT_RETENTION_RULES[event.retentionClass].purgeable).toBe(false);
  });

  it('carries no field whose name says it holds customer text', () => {
    const event = createAuditEvent({
      userId: 'usr_1',
      surface: 'web',
      action: 'tool_approved',
      resource: 'tool',
      outcome: 'success',
    });
    for (const field of FIELDS_NEVER_LOGGED) {
      expect(Object.keys(event), field).not.toContain(field);
    }
  });

  it('scrubs what a caller pushes into metadata rather than storing it', () => {
    const scrubbed = redactLogRecord({
      metadata: { prompt: 'the user asked about X', note: `contact ${EMAIL}`, apiKey: SECRET },
    }) as { metadata: Record<string, unknown> };

    expect(scrubbed.metadata['prompt']).toBe(REDACTED);
    expect(scrubbed.metadata['apiKey']).toBe(REDACTED);
    expect(scrubbed.metadata['note']).not.toContain(EMAIL);
  });
});

describe('analytics cannot stand in for audit', () => {
  it('is consent-gated, which an audit record never is', () => {
    expect(PRODUCT_ANALYTICS_CONSENT_PURPOSE.length).toBeGreaterThan(0);
    const audit = createAuditEvent({
      userId: null,
      surface: 'web',
      action: 'auth_login',
      resource: 'session',
      outcome: 'denied',
    });
    expect(Object.keys(audit)).not.toContain('consent');
    expect(audit.retentionClass).toBe('security');
  });

  it('names no event that an audit action already names', () => {
    const auditActions = new Set(
      (
        [
          'auth_login',
          'auth_logout',
          'tool_approved',
          'tool_denied',
          'tool_timeout',
          'agent_started',
          'agent_completed',
          'agent_failed',
          'agent_paused',
          'agent_cancelled',
          'settings_changed',
          'data_exported',
          'data_deleted',
        ] as const
      ).map((action) => action),
    );
    for (const name of PRODUCT_ANALYTICS_EVENT_NAMES) {
      expect(auditActions.has(name as never), name).toBe(false);
    }
  });

  it('allows only low-cardinality dimensions, none of which is a sensitive key', () => {
    expect(PRODUCT_ANALYTICS_PROPERTY_KEYS.length).toBeGreaterThan(0);
    expect(PRODUCT_ANALYTICS_PROPERTY_MAX_LENGTH).toBeLessThanOrEqual(200);
    for (const key of PRODUCT_ANALYTICS_PROPERTY_KEYS) {
      const [masked] = Object.values(redactAttributes({ [key]: 'value' }));
      expect(masked, `${key} is a key the redactor refuses`).toBe('value');
      expect(FIELDS_NEVER_LOGGED as readonly string[], key).not.toContain(key);
    }
  });

  it('carries no actor or resource identity, so it cannot answer who did what', () => {
    for (const forbidden of ['userId', 'actor', 'resource', 'resourceId', 'organizationId']) {
      expect(PRODUCT_ANALYTICS_PROPERTY_KEYS as readonly string[], forbidden).not.toContain(
        forbidden,
      );
    }
  });
});

describe('telemetry is redacted before it leaves the process', () => {
  it('keeps a secret out of the span log and the exported metric', async () => {
    await withSpan(
      'tool.execute',
      {
        domain: 'tool',
        attributes: {
          'gen_ai.tool.name': 'search',
          authorization: BEARER,
          note: `key ${SECRET} for ${EMAIL}`,
        },
      },
      () => 'done',
    );

    const line = records.find((entry) => entry['span_name'] === 'tool.execute');
    expect(line).toBeDefined();
    const serialised = JSON.stringify(line);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain(EMAIL);
    expect(line?.['authorization']).toBe(REDACTED);
  });

  it('never lets an unbounded value open a metric series', async () => {
    recordToolOutcome({
      category: 'mcp',
      status: 'failed',
      surface: 'web',
      errorType: `failed calling ${SECRET} at handler.ts:214`,
    });

    const { resourceMetrics } = await reader.collect();
    const exported = JSON.stringify(
      resourceMetrics.scopeMetrics.flatMap((scope) =>
        scope.metrics
          .filter((metric) => metric.descriptor.name === METRIC_NAME.failures)
          .flatMap((metric) => metric.dataPoints as readonly unknown[]),
      ),
    );
    expect(exported.length).toBeGreaterThan(2);
    expect(exported).not.toContain(SECRET);
    expect(exported).not.toContain('handler.ts');
  });

  it('drops a structure a caller tried to attach to a span', () => {
    const attributes = redactAttributes({
      payload: { messages: ['hello'] },
      list: [1, 2, 3],
      count: 4,
      ok: true,
    });
    expect(attributes).toEqual({ payload: REDACTED, count: 4, ok: true });
  });
});
