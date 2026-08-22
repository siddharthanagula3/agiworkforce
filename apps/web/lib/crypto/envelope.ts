import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const ENVELOPE_VERSION = 'v1';

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ALGORITHM = 'aes-256-gcm';

const KEY_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const HEX_64_RE = /^[0-9a-fA-F]{64}$/;

export type EnvelopeLayout = 'versioned' | 'hex-triple' | 'b64-iv-ct-tag';

export type KeyEncoding = 'hex' | 'utf8';

export interface EnvelopeKey {
  id: string;
  material: Buffer;
}

export interface KeyRing {
  active: EnvelopeKey;
  retired: EnvelopeKey[];
}

export interface OpenedEnvelope {
  plaintext: string;
  keyId: string;
  layout: EnvelopeLayout;
  contextBound: boolean;
}

function decodeKeyMaterial(raw: string, encoding: KeyEncoding, label: string): Buffer {
  if (encoding === 'hex') {
    if (!HEX_64_RE.test(raw)) {
      throw new Error(`${label} must be 64 hex characters (32 bytes)`);
    }
    return Buffer.from(raw, 'hex');
  }

  const material = Buffer.from(raw.slice(0, KEY_LENGTH), 'utf8');
  if (material.length !== KEY_LENGTH) {
    throw new Error(`${label} must be at least 32 characters`);
  }
  return material;
}

function assertKeyId(id: string, label: string): string {
  if (!KEY_ID_RE.test(id)) {
    throw new Error(`${label} must match ${KEY_ID_RE.source}, got "${id}"`);
  }
  return id;
}

export function loadKeyRing(
  envName: string,
  options: { encoding?: KeyEncoding; env?: Record<string, string | undefined> } = {},
): KeyRing {
  const env = options.env ?? process.env;
  const encoding = options.encoding ?? 'hex';

  const activeRaw = env[envName];
  if (!activeRaw) {
    throw new Error(`${envName} is not set; cannot build a key ring`);
  }

  const active: EnvelopeKey = {
    id: assertKeyId(env[`${envName}_ID`] ?? '1', `${envName}_ID`),
    material: decodeKeyMaterial(activeRaw, encoding, envName),
  };

  const retired: EnvelopeKey[] = [];
  const retiredRaw = env[`${envName}_RETIRED`]?.trim();
  if (retiredRaw) {
    for (const entry of retiredRaw.split(',')) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const separator = trimmed.indexOf(':');
      if (separator <= 0) {
        throw new Error(`${envName}_RETIRED entries must be "<id>:<material>"`);
      }
      retired.push({
        id: assertKeyId(trimmed.slice(0, separator), `${envName}_RETIRED id`),
        material: decodeKeyMaterial(
          trimmed.slice(separator + 1),
          encoding,
          `${envName}_RETIRED entry`,
        ),
      });
    }
  }

  const seen = new Set<string>();
  for (const key of [active, ...retired]) {
    if (seen.has(key.id)) {
      throw new Error(`${envName} key ring declares id "${key.id}" twice`);
    }
    seen.add(key.id);
  }

  return { active, retired };
}

function resolveKey(ring: KeyRing, keyId: string): EnvelopeKey {
  if (ring.active.id === keyId) return ring.active;
  const retired = ring.retired.find((key) => key.id === keyId);
  if (!retired) {
    const known = [ring.active.id, ...ring.retired.map((key) => key.id)].join(', ');
    throw new Error(
      `Envelope names key "${keyId}" but the ring holds only [${known}]. ` +
        'Add the retired key to <ENV>_RETIRED before decrypting.',
    );
  }
  return retired;
}

export function envelopeKeyId(value: string): string | null {
  if (!value.startsWith(`${ENVELOPE_VERSION}.`)) return null;
  const parts = value.split('.');
  if (parts.length !== 5) return null;
  const keyId = parts[1];
  return keyId && KEY_ID_RE.test(keyId) ? keyId : null;
}

function encode(
  iv: Buffer,
  ciphertext: Buffer,
  tag: Buffer,
  layout: EnvelopeLayout,
  keyId: string,
) {
  switch (layout) {
    case 'versioned':
      return [
        ENVELOPE_VERSION,
        keyId,
        iv.toString('base64url'),
        ciphertext.toString('base64url'),
        tag.toString('base64url'),
      ].join('.');
    case 'hex-triple':
      return `${iv.toString('hex')}:${ciphertext.toString('hex')}:${tag.toString('hex')}`;
    case 'b64-iv-ct-tag':
      return Buffer.concat([iv, ciphertext, tag]).toString('base64');
  }
}

function decode(
  value: string,
  layout: EnvelopeLayout,
): { iv: Buffer; ciphertext: Buffer; tag: Buffer } {
  if (layout === 'versioned') {
    const parts = value.split('.');
    if (parts.length !== 5 || parts[0] !== ENVELOPE_VERSION) {
      throw new Error('Malformed versioned envelope');
    }
    return {
      iv: Buffer.from(parts[2] as string, 'base64url'),
      ciphertext: Buffer.from(parts[3] as string, 'base64url'),
      tag: Buffer.from(parts[4] as string, 'base64url'),
    };
  }

  if (layout === 'hex-triple') {
    const [ivHex, dataHex, tagHex] = value.split(':');
    if (!ivHex || !dataHex || !tagHex) {
      throw new Error('Malformed hex-triple envelope');
    }
    return {
      iv: Buffer.from(ivHex, 'hex'),
      ciphertext: Buffer.from(dataHex, 'hex'),
      tag: Buffer.from(tagHex, 'hex'),
    };
  }

  const combined = Buffer.from(value, 'base64');
  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Malformed envelope: shorter than IV + auth tag');
  }
  return {
    iv: combined.subarray(0, IV_LENGTH),
    ciphertext: combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH),
    tag: combined.subarray(combined.length - AUTH_TAG_LENGTH),
  };
}

function decrypt(
  key: EnvelopeKey,
  parts: ReturnType<typeof decode>,
  context: string | undefined,
): string {
  const decipher = createDecipheriv(ALGORITHM, key.material, parts.iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  if (context !== undefined) decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(parts.tag);
  return Buffer.concat([decipher.update(parts.ciphertext), decipher.final()]).toString('utf8');
}

// A context-bound open also accepts a ciphertext sealed before contexts existed, and reports
// that through `contextBound` so the caller can re-seal it; a ciphertext sealed under a
// DIFFERENT context never opens.
function decryptWithContext(
  key: EnvelopeKey,
  parts: ReturnType<typeof decode>,
  context: string | undefined,
): { plaintext: string; contextBound: boolean } {
  if (context === undefined)
    return { plaintext: decrypt(key, parts, undefined), contextBound: false };
  try {
    return { plaintext: decrypt(key, parts, context), contextBound: true };
  } catch (boundError) {
    try {
      return { plaintext: decrypt(key, parts, undefined), contextBound: false };
    } catch {
      throw boundError;
    }
  }
}

export function sealEnvelope(
  ring: KeyRing,
  plaintext: string,
  layout: EnvelopeLayout = 'versioned',
  context?: string,
): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, ring.active.material, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  if (context !== undefined) cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return encode(iv, ciphertext, cipher.getAuthTag(), layout, ring.active.id);
}

export function openEnvelope(
  ring: KeyRing,
  value: string,
  legacyLayout: Exclude<EnvelopeLayout, 'versioned'>,
  context?: string,
): OpenedEnvelope {
  const keyId = envelopeKeyId(value);
  if (keyId !== null) {
    const key = resolveKey(ring, keyId);
    return {
      ...decryptWithContext(key, decode(value, 'versioned'), context),
      keyId,
      layout: 'versioned',
    };
  }

  const parts = decode(value, legacyLayout);
  for (const key of [ring.active, ...ring.retired]) {
    try {
      return { ...decryptWithContext(key, parts, context), keyId: key.id, layout: legacyLayout };
    } catch {
      // Auth-tag failure means the wrong key; try the next one in the ring.
    }
  }

  const known = [ring.active.id, ...ring.retired.map((key) => key.id)].join(', ');
  throw new Error(
    `Unversioned ${legacyLayout} envelope could not be opened by any ring key [${known}]`,
  );
}
