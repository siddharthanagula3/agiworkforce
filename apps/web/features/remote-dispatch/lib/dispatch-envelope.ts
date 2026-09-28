import { DISPATCH_MAX_MESSAGE_AGE_MS, DISPATCH_NONCE_CACHE_TTL_MS } from '@agiworkforce/types';

const DISPATCH_ENVELOPE_VERSION = 3;

const HKDF_INFO = 'dispatch-hmac-v3';
const SALT_BYTES = 16;
const NONCE_BYTES = 16;
const HMAC_HEX = /^[0-9a-f]{64}$/;

interface SignedDispatchEnvelope {
  hmac: string;
  nonce: string;
  payload: unknown;
  ts: number;
  type: string;
  v: number;
}

interface BrowserDispatchSession {
  key: CryptoKey;
  nonces: Map<string, number>;
}

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(length)));
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function hmac(keyBytes: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

export function newDispatchSalt(): string {
  return bytesToHex(randomBytes(SALT_BYTES));
}

export async function createDispatchSession(
  pairingCode: string,
  sessionSalt: string,
  pairingSecret: string,
): Promise<BrowserDispatchSession> {
  const prk = await hmac(
    encoder.encode(`${pairingCode}:${sessionSalt}`),
    hexToBytes(pairingSecret.toLowerCase()),
  );
  const info = encoder.encode(HKDF_INFO);
  const block = new Uint8Array(new ArrayBuffer(info.length + 1));
  block.set(info);
  block[info.length] = 1;
  const okm = await hmac(prk, block);
  const key = await crypto.subtle.importKey('raw', okm, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
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

function macInput(type: string, payload: unknown, ts: number, nonce: string) {
  return encoder.encode(
    JSON.stringify(canonicalize({ nonce, payload, ts, type, v: DISPATCH_ENVELOPE_VERSION })),
  );
}

export async function signDispatchEnvelope(
  session: BrowserDispatchSession,
  type: string,
  payload: unknown,
  now = Date.now(),
): Promise<SignedDispatchEnvelope> {
  const nonce = toBase64(randomBytes(NONCE_BYTES));
  const signature = await crypto.subtle.sign(
    'HMAC',
    session.key,
    macInput(type, payload, now, nonce),
  );
  return {
    hmac: bytesToHex(new Uint8Array(signature)),
    nonce,
    payload,
    ts: now,
    type,
    v: DISPATCH_ENVELOPE_VERSION,
  };
}

export async function openDispatchEnvelope(
  session: BrowserDispatchSession,
  message: unknown,
  now = Date.now(),
): Promise<unknown | null> {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return null;
  const envelope = message as Record<string, unknown>;
  const { hmac: claimed, nonce, ts, type, payload } = envelope;
  if (typeof claimed !== 'string' || !HMAC_HEX.test(claimed)) return null;
  if (envelope['v'] !== DISPATCH_ENVELOPE_VERSION) return null;
  if (typeof nonce !== 'string' || typeof ts !== 'number' || typeof type !== 'string') {
    return null;
  }
  if (Math.abs(now - ts) > DISPATCH_MAX_MESSAGE_AGE_MS) return null;
  for (const [seen, seenAt] of session.nonces) {
    if (seenAt < now - DISPATCH_NONCE_CACHE_TTL_MS) session.nonces.delete(seen);
  }
  if (session.nonces.has(nonce)) return null;
  const authentic = await crypto.subtle.verify(
    'HMAC',
    session.key,
    hexToBytes(claimed),
    macInput(type, payload, ts, nonce),
  );
  if (!authentic) return null;
  session.nonces.set(nonce, now);
  return payload;
}
