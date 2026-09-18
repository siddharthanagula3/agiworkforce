import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { mockAssertPublic } = vi.hoisted(() => ({ mockAssertPublic: vi.fn(async () => undefined) }));
vi.mock('@/lib/egress-policy', () => ({
  assertResolvedPublicHostname: mockAssertPublic,
  pinnedPublicFetch: vi.fn(),
}));

import {
  AUDIT_SIGNATURE_HEADER,
  AUDIT_STREAM_DELIVERY_TIMEOUT_MS,
  AUDIT_STREAM_MAX_BODY_BYTES,
  AUDIT_TIMESTAMP_HEADER,
  AuditDeliveryRefused,
  auditDeliveryHeaders,
  buildBoundedDeliveryBody,
  deliverAuditBatch,
  signPayload,
  verifySignature,
} from '../audit-streaming-proxy';

const TIMESTAMP = '2026-08-23T12:00:00.000Z';

function envelope(events: unknown[]) {
  return {
    schema: 'agiworkforce.enterprise-audit',
    schemaVersion: 1,
    organizationId: '11111111-1111-4111-8111-111111111111',
    deliveredAt: TIMESTAMP,
    events,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertPublic.mockResolvedValue(undefined);
});

describe('delivery headers', () => {
  it('signs with the timestamp bound into the material', () => {
    const headers = auditDeliveryHeaders(TIMESTAMP, signPayload('secret', TIMESTAMP, '{}'));

    expect(headers[AUDIT_TIMESTAMP_HEADER]).toBe(TIMESTAMP);
    expect(headers[AUDIT_SIGNATURE_HEADER]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySignature('secret', TIMESTAMP, '{}', signPayload('secret', TIMESTAMP, '{}'))).toBe(
      true,
    );
  });

  it('refuses a header value carrying a newline rather than splitting the request', () => {
    expect(() => auditDeliveryHeaders(`${TIMESTAMP}\r\nX-Forged: 1`, 'abc')).toThrow(
      AuditDeliveryRefused,
    );
    expect(() => auditDeliveryHeaders(TIMESTAMP, 'abc\ndef')).toThrow(AuditDeliveryRefused);
  });
});

describe('body bounds', () => {
  it('sends the whole batch when it fits', () => {
    const { sent, body } = buildBoundedDeliveryBody(envelope([{ id: 'a' }, { id: 'b' }]));

    expect(sent).toHaveLength(2);
    expect(JSON.parse(body).events).toHaveLength(2);
  });

  it('shortens an oversized batch instead of dropping its tail', () => {
    const events = Array.from({ length: 10 }, (_, index) => ({
      id: String(index),
      metadata: { blob: 'x'.repeat(200) },
    }));

    const { sent, body } = buildBoundedDeliveryBody(envelope(events), 1_000);

    expect(sent.length).toBeGreaterThan(0);
    expect(sent.length).toBeLessThan(events.length);
    expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(1_000);
    expect(sent).toEqual(events.slice(0, sent.length));
  });

  it('sends a single event that exceeds the ceiling rather than losing it', () => {
    const huge = { id: 'a', metadata: { blob: 'x'.repeat(2_000) } };

    const { sent } = buildBoundedDeliveryBody(envelope([huge, { id: 'b' }]), 500);

    expect(sent).toEqual([huge]);
  });

  it('defaults to the published ceiling', () => {
    expect(AUDIT_STREAM_MAX_BODY_BYTES).toBe(1_000_000);
    const events = Array.from({ length: 200 }, (_, index) => ({
      id: String(index),
      metadata: { blob: 'x'.repeat(20_000) },
    }));

    const { body } = buildBoundedDeliveryBody(envelope(events));

    expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(AUDIT_STREAM_MAX_BODY_BYTES);
  });
});

describe('delivery', () => {
  function response(status: number) {
    return vi.fn(async () => ({ status, ok: status < 300 }) as Response) as unknown as typeof fetch;
  }

  it('re-resolves the endpoint on every send', async () => {
    const fetchImpl = response(202);

    const outcome = await deliverAuditBatch({
      endpointUrl: 'https://siem.example.test/hook',
      secret: 'secret',
      timestamp: TIMESTAMP,
      body: '{}',
      fetchImpl,
    });

    expect(mockAssertPublic).toHaveBeenCalledWith('https://siem.example.test/hook');
    expect(outcome.succeeded).toBe(true);
    expect(outcome.status).toBe(202);
  });

  it('never sends when the endpoint now resolves inward', async () => {
    mockAssertPublic.mockRejectedValue(new Error('Refusing to fetch a private address'));
    const fetchImpl = response(202);

    const outcome = await deliverAuditBatch({
      endpointUrl: 'https://siem.example.test/hook',
      secret: 'secret',
      timestamp: TIMESTAMP,
      body: '{}',
      fetchImpl,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(outcome.succeeded).toBe(false);
    expect(outcome.error).toContain('private address');
  });

  it('bounds the attempt and reports a non-2xx as a failure', async () => {
    const fetchImpl = response(500);

    const outcome = await deliverAuditBatch({
      endpointUrl: 'https://siem.example.test/hook',
      secret: 'secret',
      timestamp: TIMESTAMP,
      body: '{}',
      fetchImpl,
    });

    expect(outcome.succeeded).toBe(false);
    expect(outcome.error).toBe('Endpoint answered 500.');
    const init = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]![1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(AUDIT_STREAM_DELIVERY_TIMEOUT_MS).toBe(10_000);
  });

  it('turns a transport failure into an outcome rather than throwing at the caller', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const outcome = await deliverAuditBatch({
      endpointUrl: 'https://siem.example.test/hook',
      secret: 'secret',
      timestamp: TIMESTAMP,
      body: '{}',
      fetchImpl,
    });

    expect(outcome).toEqual({ status: null, error: 'ECONNREFUSED', succeeded: false });
  });
});
