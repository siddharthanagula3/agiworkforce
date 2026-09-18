import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { logger } from '@/lib/logger';
import { assertResolvedPublicHostname, pinnedPublicFetch } from '@/lib/egress-policy';

export const AUDIT_TIMESTAMP_HEADER = 'X-AGI-Audit-Timestamp';
export const AUDIT_SIGNATURE_HEADER = 'X-AGI-Audit-Signature';

/**
 * One delivery's serialized ceiling. A workspace that writes large metadata can
 * make a hundred events enormous, and a receiver that refuses the oversize POST
 * fails the whole batch forever; the batch shrinks instead.
 */
export const AUDIT_STREAM_MAX_BODY_BYTES = 1_000_000;

export const AUDIT_STREAM_DELIVERY_TIMEOUT_MS = 10_000;

const PRINTABLE_HEADER_VALUE = /^[ -~]+$/;

export class AuditDeliveryRefused extends Error {}

/**
 * Signs a payload the way the receiver verifies it.
 *
 * The timestamp is inside the signed material, not merely alongside it, so a
 * captured delivery cannot be replayed later with a fresh header. Receivers
 * should reject a timestamp outside their tolerance.
 */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Constant-time, so a receiver's own verification cannot leak the secret by timing. */
export function verifySignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const expected = signPayload(secret, timestamp, body);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * A carriage return in a header value splits the request at some proxies, so a
 * value that is not printable ASCII refuses the delivery instead of sending it.
 */
export function auditDeliveryHeaders(timestamp: string, signature: string): Record<string, string> {
  for (const value of [timestamp, signature]) {
    if (!PRINTABLE_HEADER_VALUE.test(value)) {
      throw new AuditDeliveryRefused('Audit delivery header value is not printable ASCII');
    }
  }
  return {
    'Content-Type': 'application/json',
    [AUDIT_TIMESTAMP_HEADER]: timestamp,
    [AUDIT_SIGNATURE_HEADER]: `sha256=${signature}`,
  };
}

export interface AuditDeliveryEnvelope<E> {
  schema: string;
  schemaVersion: number;
  organizationId: string;
  deliveredAt: string;
  events: readonly E[];
}

/**
 * The longest prefix of the batch that fits under the ceiling, never fewer than
 * one event: an event dropped for being large is data loss, an event deferred
 * to the next drain is not.
 */
export function buildBoundedDeliveryBody<E>(
  envelope: AuditDeliveryEnvelope<E>,
  maxBytes: number = AUDIT_STREAM_MAX_BODY_BYTES,
): { body: string; sent: E[] } {
  const overhead = Buffer.byteLength(JSON.stringify({ ...envelope, events: [] }), 'utf8');
  let used = overhead;
  let count = 0;
  for (const event of envelope.events) {
    const size = Buffer.byteLength(JSON.stringify(event), 'utf8') + (count > 0 ? 1 : 0);
    if (count > 0 && used + size > maxBytes) break;
    used += size;
    count += 1;
  }

  const sent = envelope.events.slice(0, count);
  if (count === 1 && used > maxBytes) {
    logger.warn(
      { organizationId: envelope.organizationId, bytes: used, maxBytes },
      '[audit-stream] a single event exceeds the delivery ceiling; sent alone rather than dropped',
    );
  }
  return { body: JSON.stringify({ ...envelope, events: sent }), sent };
}

export interface AuditDeliveryOutcome {
  status: number | null;
  error: string | null;
  succeeded: boolean;
}

/**
 * Posts one signed batch. The endpoint is re-resolved on every send because a
 * destination saved months ago may point at a hostname that now resolves
 * inward, and the response body is never read: a receiver cannot make the
 * sender buffer what it answers with.
 */
export async function deliverAuditBatch(input: {
  endpointUrl: string;
  secret: string;
  timestamp: string;
  body: string;
  fetchImpl?: typeof fetch;
}): Promise<AuditDeliveryOutcome> {
  const send = input.fetchImpl ?? pinnedPublicFetch;
  try {
    const headers = auditDeliveryHeaders(
      input.timestamp,
      signPayload(input.secret, input.timestamp, input.body),
    );
    await assertResolvedPublicHostname(input.endpointUrl);

    const response = await send(input.endpointUrl, {
      method: 'POST',
      headers,
      body: input.body,
      signal: AbortSignal.timeout(AUDIT_STREAM_DELIVERY_TIMEOUT_MS),
    });
    const succeeded = response.status >= 200 && response.status < 300;
    return {
      status: response.status,
      error: succeeded ? null : `Endpoint answered ${response.status}.`,
      succeeded,
    };
  } catch (caught) {
    return {
      status: null,
      error: caught instanceof Error ? caught.message : String(caught),
      succeeded: false,
    };
  }
}
