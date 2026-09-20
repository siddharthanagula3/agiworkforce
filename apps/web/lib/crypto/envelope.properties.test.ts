import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  deriveTenantKeyRing,
  envelopeKeyId,
  openEnvelope,
  sealEnvelope,
  type EnvelopeLayout,
  type KeyRing,
} from './envelope';

const LEGACY_LAYOUTS = ['hex-triple', 'b64-iv-ct-tag'] as const;
const LAYOUTS: readonly EnvelopeLayout[] = ['versioned', ...LEGACY_LAYOUTS];
const PLAINTEXT = 'the value this envelope exists to keep';
const CONTEXT = 'resource:one';

function ring(id = 'k1'): KeyRing {
  return { active: { id, material: randomBytes(32) }, retired: [] };
}

function flipOneBit(value: string, alphabet: string): string {
  const index = Math.floor(value.length / 2);
  const current = value[index] as string;
  const next = alphabet[(alphabet.indexOf(current) + 1) % alphabet.length] as string;
  return `${value.slice(0, index)}${next}${value.slice(index + 1)}`;
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const HEX = '0123456789abcdef';

describe('envelope · round trip', () => {
  it('returns exactly what was sealed, in every layout, bound and unbound', () => {
    for (const layout of LAYOUTS) {
      for (const context of [undefined, CONTEXT]) {
        const key = ring();
        const legacy = layout === 'versioned' ? 'hex-triple' : layout;
        const sealed = sealEnvelope(key, PLAINTEXT, layout, context);
        const opened = openEnvelope(
          key,
          sealed,
          legacy,
          context === undefined ? undefined : { value: context, acceptUnbound: false },
        );

        expect(opened.plaintext).toBe(PLAINTEXT);
        expect(opened.layout).toBe(layout);
        expect(opened.contextBound).toBe(context !== undefined);
      }
    }
  });

  it('refuses an unversioned envelope read as the wrong legacy layout', () => {
    const key = ring();
    expect(() =>
      openEnvelope(key, sealEnvelope(key, PLAINTEXT, 'b64-iv-ct-tag'), 'hex-triple'),
    ).toThrow(/Malformed hex-triple/u);
  });

  it('round trips an empty string and multibyte text without truncating either', () => {
    const key = ring();
    for (const value of ['', '🔐 ключ 键', 'a'.repeat(10_000)]) {
      expect(openEnvelope(key, sealEnvelope(key, value), 'hex-triple').plaintext).toBe(value);
    }
  });

  it('opens a value sealed under a key that has since been retired', () => {
    const retired = ring('k1');
    const sealed = sealEnvelope(retired, PLAINTEXT);
    const rotated: KeyRing = {
      active: { id: 'k2', material: randomBytes(32) },
      retired: [retired.active],
    };

    const opened = openEnvelope(rotated, sealed, 'hex-triple');
    expect(opened.plaintext).toBe(PLAINTEXT);
    expect(opened.keyId).toBe('k1');
  });
});

describe('envelope · every corruption fails closed', () => {
  it('refuses the wrong key and yields no plaintext', () => {
    for (const layout of LAYOUTS) {
      const sealed = sealEnvelope(ring(), PLAINTEXT, layout);
      let thrown: unknown;
      try {
        openEnvelope(ring(), sealed, 'hex-triple');
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect(String((thrown as Error).message)).not.toContain(PLAINTEXT);
    }
  });

  it('refuses a truncated ciphertext rather than returning the prefix it could decrypt', () => {
    const key = ring();
    const sealed = sealEnvelope(key, PLAINTEXT, 'hex-triple');
    const [iv, body, tag] = sealed.split(':') as [string, string, string];

    for (const cut of [2, 10, body.length - 2]) {
      expect(() => openEnvelope(key, `${iv}:${body.slice(0, cut)}:${tag}`, 'hex-triple')).toThrow();
    }
  });

  it('refuses a flipped bit in the ciphertext, the tag or the nonce', () => {
    const key = ring();
    const sealed = sealEnvelope(key, PLAINTEXT, 'hex-triple');
    const [iv, body, tag] = sealed.split(':') as [string, string, string];

    const corrupted = [
      `${flipOneBit(iv, HEX)}:${body}:${tag}`,
      `${iv}:${flipOneBit(body, HEX)}:${tag}`,
      `${iv}:${body}:${flipOneBit(tag, HEX)}`,
    ];
    for (const value of corrupted) {
      expect(() => openEnvelope(key, value, 'hex-triple')).toThrow();
    }
  });

  it('refuses a flipped bit in a versioned envelope, whichever field carries it', () => {
    const key = ring();
    const sealed = sealEnvelope(key, PLAINTEXT, 'versioned');
    const parts = sealed.split('.');

    for (const field of [2, 3, 4]) {
      const corrupted = [...parts];
      corrupted[field] = flipOneBit(parts[field] as string, BASE64URL);
      expect(() => openEnvelope(key, corrupted.join('.'), 'hex-triple')).toThrow();
    }
  });

  it('refuses a ciphertext sealed under a different associated context', () => {
    const key = ring();
    const sealed = sealEnvelope(key, PLAINTEXT, 'hex-triple', CONTEXT);

    for (const acceptUnbound of [false, true]) {
      expect(() =>
        openEnvelope(key, sealed, 'hex-triple', { value: 'resource:two', acceptUnbound }),
      ).toThrow();
    }
    expect(() => openEnvelope(key, sealed, 'hex-triple')).toThrow();
  });
});

describe('envelope · a ciphertext with no associated data', () => {
  const TENANT_A = 'organization-audit-destination:a';
  const TENANT_B = 'organization-audit-destination:b';

  it('is refused by a bound open that does not admit one', () => {
    const key = ring();
    const sealed = sealEnvelope(key, PLAINTEXT, 'hex-triple');

    expect(() =>
      openEnvelope(key, sealed, 'hex-triple', { value: TENANT_A, acceptUnbound: false }),
    ).toThrow();
  });

  it('would otherwise open under any context, which is why admitting one is stated', () => {
    const key = ring();
    const sealed = sealEnvelope(key, PLAINTEXT, 'hex-triple');

    for (const value of [TENANT_A, TENANT_B]) {
      const opened = openEnvelope(key, sealed, 'hex-triple', { value, acceptUnbound: true });
      expect(opened.plaintext).toBe(PLAINTEXT);
      expect(opened.contextBound).toBe(false);
    }
  });

  it('reports a bound open as bound, so an admitted one is distinguishable', () => {
    const key = ring();
    const sealed = sealEnvelope(key, PLAINTEXT, 'hex-triple', TENANT_A);

    expect(
      openEnvelope(key, sealed, 'hex-triple', { value: TENANT_A, acceptUnbound: true })
        .contextBound,
    ).toBe(true);
  });
});

describe('envelope · nonces', () => {
  it('draws a distinct nonce for every encryption under one key', () => {
    const key = ring();
    const nonces = new Set<string>();
    for (let index = 0; index < 500; index += 1) {
      nonces.add(sealEnvelope(key, PLAINTEXT, 'hex-triple').split(':')[0] as string);
    }
    expect(nonces.size).toBe(500);
  });

  it('never reuses a nonce across the layouts or across a rotation of the same ring', () => {
    const material = randomBytes(32);
    const before: KeyRing = { active: { id: 'k1', material }, retired: [] };
    const after: KeyRing = { active: { id: 'k2', material }, retired: [before.active] };
    const nonces = new Set<string>();

    for (const key of [before, after]) {
      for (let index = 0; index < 100; index += 1) {
        nonces.add(sealEnvelope(key, PLAINTEXT, 'hex-triple').split(':')[0] as string);
      }
    }
    expect(nonces.size).toBe(200);
  });

  it('produces a different ciphertext every time the same value is sealed', () => {
    const key = ring();
    const sealed = new Set<string>();
    for (let index = 0; index < 100; index += 1) sealed.add(sealEnvelope(key, PLAINTEXT));
    expect(sealed.size).toBe(100);
  });
});

describe('envelope · a ciphertext belongs to one tenant and one key version', () => {
  const ORG_A = 'organization-a';
  const ORG_B = 'organization-b';

  it('does not open one tenant ciphertext under another tenant derived ring', () => {
    const root = ring();
    const a = deriveTenantKeyRing(root, ORG_A);
    const b = deriveTenantKeyRing(root, ORG_B);
    const sealed = sealEnvelope(a, PLAINTEXT);

    expect(openEnvelope(a, sealed, 'hex-triple').plaintext).toBe(PLAINTEXT);
    expect(() => openEnvelope(b, sealed, 'hex-triple')).toThrow();
  });

  it('does not open a tenant ciphertext under the root it was derived from', () => {
    const root = ring();
    const sealed = sealEnvelope(deriveTenantKeyRing(root, ORG_A), PLAINTEXT);

    expect(() => openEnvelope(root, sealed, 'hex-triple')).toThrow();
  });

  it('refuses a ciphertext whose key id has been relabelled to another version in the ring', () => {
    const material = randomBytes(32);
    const ring2: KeyRing = {
      active: { id: 'k2', material: randomBytes(32) },
      retired: [{ id: 'k1', material }],
    };
    const sealed = sealEnvelope({ active: { id: 'k1', material }, retired: [] }, PLAINTEXT);
    const relabelled = sealed.replace(/^v1\.k1\./u, 'v1.k2.');

    expect(envelopeKeyId(sealed)).toBe('k1');
    expect(envelopeKeyId(relabelled)).toBe('k2');
    expect(openEnvelope(ring2, sealed, 'hex-triple').plaintext).toBe(PLAINTEXT);
    expect(() => openEnvelope(ring2, relabelled, 'hex-triple')).toThrow();
  });
});

describe('envelope · nothing secret reaches a message', () => {
  it('names key ids and layouts in its refusals, never key material or plaintext', () => {
    const secretPlaintext = 'correct-horse-battery-staple';
    const key = ring();
    const material = key.active.material.toString('hex');
    const sealed = sealEnvelope(key, secretPlaintext, 'hex-triple');
    const messages: string[] = [];

    for (const attempt of [
      () => openEnvelope(ring(), sealed, 'hex-triple'),
      () => openEnvelope(key, 'not-an-envelope', 'hex-triple'),
      () => openEnvelope(key, 'v1.missing.a.b.c', 'hex-triple'),
      () => openEnvelope(key, sealed, 'hex-triple', { value: CONTEXT, acceptUnbound: false }),
    ]) {
      try {
        attempt();
      } catch (error) {
        messages.push(error instanceof Error ? error.message : String(error));
      }
    }

    expect(messages).toHaveLength(4);
    for (const message of messages) {
      expect(message).not.toContain(secretPlaintext);
      expect(message).not.toContain(material);
      expect(message).not.toContain(key.active.material.toString('base64'));
    }
  });
});
