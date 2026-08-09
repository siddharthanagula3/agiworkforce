/**
 * Keyed AES-256-GCM envelope codec.
 *
 * Every secret column in this app (`connector_oauth_grants.access_token_enc`,
 * `user_custom_connectors.auth_header_enc`,
 * `github_installations.access_token_enc`,
 * `user_two_factor.totp_secret_enc`) stored raw IV/ciphertext/tag with nothing
 * that said WHICH key produced it, and every reader decrypted with one key read
 * straight from the environment. That made rotating a key an unrecoverable
 * event: the new key cannot open the old rows and nothing said it should stop
 * trying.
 *
 * This module fixes the missing half in two steps:
 *
 *  1. `openEnvelope` decrypts against a whole key ring — the embedded id when
 *     the value carries one, otherwise every key in turn, active first. That is
 *     what lets a rotation run at all: rows still on the retired key stay
 *     readable while `scripts/reencrypt.mjs` walks them onto the new one.
 *  2. `sealEnvelope` can write a self-describing `v1.<keyId>.<iv>.<ct>.<tag>`
 *     envelope, so a value resolves its exact key instead of being guessed.
 *
 * PRODUCTION READERS. `lib/custom-connector-crypto.ts` (connector OAuth grants
 * and user MCP bearer tokens) and `lib/github-app.ts` (installation tokens)
 * decrypt through `openEnvelope`, so those three columns survive a rotation as
 * long as the retired key is in `<NAME>_RETIRED`. They still SEAL in their
 * historical `hex-triple` layout, so a half-rolled deploy running the previous
 * build can read what the new build wrote; `--format=versioned` in the sweep is
 * what moves them to the versioned layout once the reader is fully deployed.
 * `user_two_factor.totp_secret_enc` is NOT wired — see docs/security/key-rotation.md.
 *
 * Deliberately no `import 'server-only'`: `scripts/reencrypt.mjs` imports this
 * file directly under plain Node (type stripping), and `server-only` throws
 * outside a React server build. The boundary is held by the callers instead —
 * both production importers carry `server-only` themselves, and the `node:crypto`
 * import here fails a client build loudly rather than silently shipping.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Envelope format tag. Bump only for a breaking layout change. */
export const ENVELOPE_VERSION = 'v1';

const IV_LENGTH = 12; // 96-bit IV, the GCM-recommended size
const AUTH_TAG_LENGTH = 16; // 128-bit tag
const KEY_LENGTH = 32; // AES-256
const ALGORITHM = 'aes-256-gcm';

/**
 * Key ids travel inside the envelope and inside a `*_key_version` column whose
 * CHECK constraint uses this same shape, so keep the two in step.
 */
const KEY_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const HEX_64_RE = /^[0-9a-fA-F]{64}$/;

/**
 * Layouts of the durable secret columns, plus the versioned one this module
 * writes. A legacy value carries no marker (both forms are opaque blobs), so
 * the caller must name the layout its column uses — it is a property of the
 * column, not of the value.
 *
 * - `hex-triple`    `iv:ciphertext:tag`, all hex (github-app.ts,
 *                   custom-connector-crypto.ts)
 * - `b64-iv-ct-tag` base64 of IV || ciphertext || tag (the WebCrypto TOTP
 *                   output, which appends the tag; device-token-crypto.ts
 *                   writes the same shape)
 *
 * Only layouts a rotation target actually stores belong here. The desktop-token
 * route's base64url IV||tag||ciphertext is not one: that value is handed to the
 * client and never written to a column, so there is nothing to rotate.
 */
export type EnvelopeLayout = 'versioned' | 'hex-triple' | 'b64-iv-ct-tag';

/**
 * How an env var encodes its key. `hex` is 64 hex characters decoded to 32
 * bytes. `utf8` takes the first 32 characters as raw bytes — that is what
 * `features/settings/services/user-preferences.ts` does with
 * `TOTP_ENCRYPTION_KEY`, and changing it would orphan every enrolled secret.
 */
export type KeyEncoding = 'hex' | 'utf8';

export interface EnvelopeKey {
  /** Value written to the row's `*_key_version` column. */
  id: string;
  material: Buffer;
}

export interface KeyRing {
  /** Key new ciphertext is sealed with. */
  active: EnvelopeKey;
  /** Keys kept only so existing ciphertext stays readable, newest first. */
  retired: EnvelopeKey[];
}

export interface OpenedEnvelope {
  plaintext: string;
  /** Id of the key that actually opened the value. */
  keyId: string;
  layout: EnvelopeLayout;
}

function decodeKeyMaterial(raw: string, encoding: KeyEncoding, label: string): Buffer {
  if (encoding === 'hex') {
    if (!HEX_64_RE.test(raw)) {
      // A length check is not enough: Buffer.from(_, 'hex') silently truncates
      // at the first non-hex pair, which yields a short key and a ciphertext
      // nobody can open later.
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

/**
 * Builds a ring from the environment.
 *
 * - `<envName>`          active key material (unchanged contract, so an
 *                        untouched deployment keeps working)
 * - `<envName>_ID`       id for that key, default `1` — which is also the
 *                        default of every `*_key_version` column, so rows
 *                        written before this module are labelled correctly
 *                        without a backfill
 * - `<envName>_RETIRED`  comma-separated `id:material` pairs, newest first
 */
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

  // A duplicated id makes `v1.<keyId>` ambiguous, which would reintroduce the
  // guessing this module exists to remove.
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

/** Key id embedded in a versioned envelope, or null for a legacy value. */
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

function decrypt(key: EnvelopeKey, parts: ReturnType<typeof decode>): string {
  const decipher = createDecipheriv(ALGORITHM, key.material, parts.iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(parts.tag);
  return Buffer.concat([decipher.update(parts.ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Encrypts under the ring's active key. Defaults to the versioned layout; the
 * production writers pass `hex-triple` so a value written by a new instance is
 * still readable by an instance of the previous build during a rolling deploy.
 */
export function sealEnvelope(
  ring: KeyRing,
  plaintext: string,
  layout: EnvelopeLayout = 'versioned',
): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, ring.active.material, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return encode(iv, ciphertext, cipher.getAuthTag(), layout, ring.active.id);
}

/**
 * Decrypts a value. A versioned envelope resolves its key by the embedded id
 * and fails loudly if the ring does not hold it — no silent fallback, because
 * a wrong-key success is impossible under GCM but a wrong-key *guess* hides
 * which key is actually missing. A legacy value has no id, so every key in the
 * ring is tried, active first.
 */
export function openEnvelope(
  ring: KeyRing,
  value: string,
  legacyLayout: Exclude<EnvelopeLayout, 'versioned'>,
): OpenedEnvelope {
  const keyId = envelopeKeyId(value);
  if (keyId !== null) {
    const key = resolveKey(ring, keyId);
    return { plaintext: decrypt(key, decode(value, 'versioned')), keyId, layout: 'versioned' };
  }

  const parts = decode(value, legacyLayout);
  for (const key of [ring.active, ...ring.retired]) {
    try {
      return { plaintext: decrypt(key, parts), keyId: key.id, layout: legacyLayout };
    } catch {
      // Auth-tag failure means the wrong key; try the next one in the ring.
    }
  }

  const known = [ring.active.id, ...ring.retired.map((key) => key.id)].join(', ');
  throw new Error(
    `Unversioned ${legacyLayout} envelope could not be opened by any ring key [${known}]`,
  );
}
