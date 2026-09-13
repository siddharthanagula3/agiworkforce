import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { extensionIdFromLaunchOrigin, isValidExtensionId } from '@agiworkforce/types';

/**
 * The authenticated envelope the extension and a native host exchange, as the
 * frozen Rust host defines it: the first `connect` is unsigned and negotiates a
 * session secret, and every later request carries an HMAC over
 * `id|timestamp|JSON(message)`.
 *
 * The MAC covers the message re-serialized from the parsed object rather than
 * the bytes Chrome wrote, because Chrome's JSON writer escapes non-ASCII and
 * the extension signed its own `JSON.stringify` output.
 */

export const REQUEST_MAX_AGE_MS = 30_000;
export const REQUEST_MAX_FUTURE_SKEW_MS = 5_000;
export const REPLAY_CACHE_LIMIT = 4096;

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface NativeEnvelope {
  id: string;
  timestamp: number;
  mac?: string | null;
  message: Record<string, unknown>;
}

export class EnvelopeRejected extends Error {}

export function parseEnvelope(value: unknown): NativeEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EnvelopeRejected('Native request was not an object.');
  }
  const candidate = value as Record<string, unknown>;
  const id = candidate['id'];
  const timestamp = candidate['timestamp'];
  const message = candidate['message'];
  const mac = candidate['mac'];

  if (typeof id !== 'string' || !REQUEST_ID_RE.test(id)) {
    throw new EnvelopeRejected('Invalid native request ID.');
  }
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    throw new EnvelopeRejected('Native request is missing its timestamp.');
  }
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new EnvelopeRejected('Native request is missing its message.');
  }
  if (mac !== undefined && mac !== null && typeof mac !== 'string') {
    throw new EnvelopeRejected('Native request MAC is malformed.');
  }
  return {
    id,
    timestamp,
    mac: typeof mac === 'string' ? mac : null,
    message: message as Record<string, unknown>,
  };
}

export function signPayload(secret: Buffer, id: string, timestamp: number, body: unknown): string {
  return createHmac('sha256', secret)
    .update(`${id}|${timestamp}|${JSON.stringify(body)}`)
    .digest('hex');
}

function macMatches(expected: string, provided: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const providedBytes = Buffer.from(provided, 'utf8');
  return (
    expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes)
  );
}

export class NativeSession {
  readonly secret: Buffer;
  readonly secretHex: string;
  private established = false;
  private readonly seen = new Map<string, number>();
  private readonly expectedExtensionId: string | null;
  private connectedExtensionId: string | null = null;

  constructor(launchOrigin?: string, secret: Buffer = randomBytes(32)) {
    this.secret = secret;
    this.secretHex = secret.toString('hex');
    this.expectedExtensionId = extensionIdFromLaunchOrigin(launchOrigin);
  }

  get extensionId(): string | null {
    return this.connectedExtensionId;
  }

  get isEstablished(): boolean {
    return this.established;
  }

  authenticate(envelope: NativeEnvelope, nowMs: number): void {
    if (nowMs - envelope.timestamp > REQUEST_MAX_AGE_MS) {
      throw new EnvelopeRejected('Native request envelope expired.');
    }
    if (envelope.timestamp > nowMs + REQUEST_MAX_FUTURE_SKEW_MS) {
      throw new EnvelopeRejected('Native request timestamp is too far in the future.');
    }

    if (envelope.message['type'] === 'connect') {
      if (this.established) {
        throw new EnvelopeRejected('Native request replay: session is already established.');
      }
      const claimed = envelope.message['extension_id'];
      if (!isValidExtensionId(claimed)) {
        throw new EnvelopeRejected('Invalid Chrome extension destination.');
      }
      if (this.expectedExtensionId && claimed !== this.expectedExtensionId) {
        throw new EnvelopeRejected(
          'Chrome extension destination does not match the native host launch origin.',
        );
      }
      if (envelope.mac) {
        throw new EnvelopeRejected('Initial native connect request must be unsigned.');
      }
      this.established = true;
      this.connectedExtensionId = claimed;
      this.remember(envelope.id, envelope.timestamp, nowMs);
      return;
    }

    if (!this.established) {
      throw new EnvelopeRejected(
        'Native request rejected before the authenticated connect handshake.',
      );
    }
    if (!envelope.mac) {
      throw new EnvelopeRejected('Native request is missing its negotiated MAC.');
    }
    const expected = signPayload(this.secret, envelope.id, envelope.timestamp, envelope.message);
    if (!macMatches(expected, envelope.mac)) {
      throw new EnvelopeRejected('Native request MAC verification failed.');
    }
    if (this.seen.has(envelope.id)) {
      throw new EnvelopeRejected('Native request replay detected.');
    }
    this.remember(envelope.id, envelope.timestamp, nowMs);
  }

  signResponse(id: string, body: Record<string, unknown>, nowMs: number): Record<string, unknown> {
    return {
      ...body,
      id,
      timestamp: nowMs,
      mac: signPayload(this.secret, id, nowMs, body),
    };
  }

  private remember(id: string, timestamp: number, nowMs: number): void {
    for (const [seenId, seenAt] of this.seen) {
      if (nowMs - seenAt > REQUEST_MAX_AGE_MS) this.seen.delete(seenId);
    }
    if (this.seen.size >= REPLAY_CACHE_LIMIT) {
      throw new EnvelopeRejected('Native request replay cache capacity exceeded.');
    }
    this.seen.set(id, timestamp);
  }
}
