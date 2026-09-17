import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DISPATCH_MAX_MESSAGE_AGE_MS, DISPATCH_NONCE_CACHE_TTL_MS } from '@agiworkforce/types';

export const DISPATCH_ENVELOPE_VERSION = 3;

const HKDF_INFO = 'dispatch-hmac-v3';
const PAIRING_SECRET_PATTERN = /^[0-9a-f]{64}$/i;
const PAIRING_SECRET_BYTES = 32;

export interface SignedDispatchEnvelope {
  hmac: string;
  nonce: string;
  payload: unknown;
  ts: number;
  type: string;
  v: number;
}

export interface DispatchSession {
  key: Buffer;
  nonces: Map<string, number>;
}

export type DispatchVerifyOutcome =
  | { ok: true; envelope: SignedDispatchEnvelope }
  | {
      ok: false;
      reason:
        | 'malformed'
        | 'unsigned'
        | 'update_required'
        | 'timestamp_expired'
        | 'nonce_replay'
        | 'hmac_mismatch';
    };

export function generatePairingSecret(): string {
  return randomBytes(PAIRING_SECRET_BYTES).toString('hex');
}

export function deriveDispatchKey(
  pairingCode: string,
  sessionSalt: string,
  pairingSecret: string,
): Buffer {
  if (!PAIRING_SECRET_PATTERN.test(pairingSecret)) {
    throw new Error('dispatch pairing secret must be 64 hex characters');
  }
  if (sessionSalt.length === 0) throw new Error('dispatch session salt is empty');
  const prk = createHmac('sha256', Buffer.from(`${pairingCode}:${sessionSalt}`, 'utf8'))
    .update(Buffer.from(pairingSecret.toLowerCase(), 'hex'))
    .digest();
  return createHmac('sha256', prk)
    .update(Buffer.concat([Buffer.from(HKDF_INFO, 'utf8'), Buffer.from([0x01])]))
    .digest();
}

export function createDispatchSession(key: Buffer): DispatchSession {
  return { key, nonces: new Map() };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : canonicalize(item)));
  }
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const child = source[key];
    if (child !== undefined) sorted[key] = canonicalize(child);
  }
  return sorted;
}

function mac(key: Buffer, type: string, payload: unknown, ts: number, nonce: string): string {
  const input = JSON.stringify(
    canonicalize({ nonce, payload, ts, type, v: DISPATCH_ENVELOPE_VERSION }),
  );
  return createHmac('sha256', key).update(input, 'utf8').digest('hex');
}

export function signDispatchEnvelope(
  session: DispatchSession,
  type: string,
  payload: unknown,
  now = Date.now(),
): SignedDispatchEnvelope {
  const nonce = randomBytes(16).toString('base64');
  return {
    hmac: mac(session.key, type, payload, now, nonce),
    nonce,
    payload,
    ts: now,
    type,
    v: DISPATCH_ENVELOPE_VERSION,
  };
}

export function verifyDispatchEnvelope(
  session: DispatchSession,
  message: unknown,
  now = Date.now(),
): DispatchVerifyOutcome {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return { ok: false, reason: 'malformed' };
  }
  const envelope = message as Record<string, unknown>;
  if (typeof envelope['hmac'] !== 'string') return { ok: false, reason: 'unsigned' };
  if (envelope['v'] !== DISPATCH_ENVELOPE_VERSION) return { ok: false, reason: 'update_required' };
  const { hmac, nonce, ts, type, payload } = envelope;
  if (typeof nonce !== 'string' || typeof ts !== 'number' || typeof type !== 'string') {
    return { ok: false, reason: 'malformed' };
  }
  if (Math.abs(now - ts) > DISPATCH_MAX_MESSAGE_AGE_MS) {
    return { ok: false, reason: 'timestamp_expired' };
  }
  for (const [seen, seenAt] of session.nonces) {
    if (seenAt < now - DISPATCH_NONCE_CACHE_TTL_MS) session.nonces.delete(seen);
  }
  if (session.nonces.has(nonce)) return { ok: false, reason: 'nonce_replay' };

  const expected = Buffer.from(mac(session.key, type, payload, ts, nonce), 'utf8');
  const claimed = Buffer.from(hmac as string, 'utf8');
  if (expected.length !== claimed.length || !timingSafeEqual(expected, claimed)) {
    return { ok: false, reason: 'hmac_mismatch' };
  }
  session.nonces.set(nonce, now);
  return {
    ok: true,
    envelope: { hmac: hmac as string, nonce, payload, ts, type, v: DISPATCH_ENVELOPE_VERSION },
  };
}
