
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { deriveKeyPairFromSeed, makeSignedContainer } from '../test-support';
import { LICENSE_CONTAINER_FORMAT, verifyLicense } from '../verify';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

interface LicenseManifest {
  rootPublicKeys: string[];
  referenceNowMs: number;
  cases: Array<{
    file: string;
    nowMs: number;
    expect: { ok: true; graceActive: boolean } | { ok: false; code: string };
    note: string;
  }>;
}

const manifest = JSON.parse(
  readFileSync(join(fixturesDir, 'manifest.json'), 'utf8'),
) as LicenseManifest;

function readFixture(file: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixturesDir, file)));
}

describe('verifyLicense — fixture corpus replay', () => {
  it('covers accept, every error variant, and grace/rotation', () => {
    const codes = new Set(manifest.cases.map((c) => ('code' in c.expect ? c.expect.code : 'ok')));
    for (const code of ['ok', 'bad_signature', 'expired', 'not_yet_valid', 'malformed']) {
      expect(codes.has(code)).toBe(true);
    }
  });

  for (const testCase of manifest.cases) {
    it(`${testCase.file} → ${'code' in testCase.expect ? testCase.expect.code : 'ok'} (${testCase.note})`, () => {
      const result = verifyLicense(
        readFixture(testCase.file),
        manifest.rootPublicKeys,
        testCase.nowMs,
      );
      if (testCase.expect.ok) {
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.graceActive).toBe(testCase.expect.graceActive);
          expect(result.claims.orgId).toBeTruthy();
        }
      } else {
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe(testCase.expect.code);
        }
      }
    });
  }
});

describe('verifyLicense — expiry and grace boundaries', () => {
  const root = deriveKeyPairFromSeed('boundary-root');
  const issuedAt = 1_000_000_000_000;
  const expiresAt = issuedAt + 30 * 86_400_000;
  const graceDays = 7;
  const graceCutoff = expiresAt + graceDays * 86_400_000;
  const claims = {
    licenseId: 'lic_b',
    orgId: 'org_b',
    orgName: 'Boundary Co',
    edition: 'team' as const,
    seats: 1,
    issuedAt,
    expiresAt,
    graceDays,
    features: [],
    policyKeys: [],
  };
  const file = makeSignedContainer(claims, root.privateKey, LICENSE_CONTAINER_FORMAT);
  const roots = [root.publicKeyB64];

  it('is not-yet-valid one ms before issuedAt', () => {
    const r = verifyLicense(file, roots, issuedAt - 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_yet_valid');
  });

  it('is valid exactly at issuedAt', () => {
    const r = verifyLicense(file, roots, issuedAt);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.graceActive).toBe(false);
  });

  it('is valid (no grace) exactly at expiresAt', () => {
    const r = verifyLicense(file, roots, expiresAt);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.graceActive).toBe(false);
  });

  it('is valid-in-grace one ms after expiresAt', () => {
    const r = verifyLicense(file, roots, expiresAt + 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.graceActive).toBe(true);
  });

  it('is valid-in-grace exactly at the grace cutoff', () => {
    const r = verifyLicense(file, roots, graceCutoff);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.graceActive).toBe(true);
  });

  it('is expired one ms past the grace cutoff', () => {
    const r = verifyLicense(file, roots, graceCutoff + 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('expired');
  });
});

describe('verifyLicense — key rotation', () => {
  const oldKey = deriveKeyPairFromSeed('rotate-old');
  const newKey = deriveKeyPairFromSeed('rotate-new');
  const claims = {
    licenseId: 'lic_r',
    orgId: 'org_r',
    orgName: 'Rotate Co',
    edition: 'enterprise' as const,
    seats: 10,
    issuedAt: 1_000_000_000_000,
    expiresAt: 2_000_000_000_000,
    graceDays: 0,
    features: [],
    policyKeys: [],
  };
  const now = 1_500_000_000_000;

  it('accepts a license signed by any key in the rotatable root list', () => {
    const signedByNew = makeSignedContainer(claims, newKey.privateKey, LICENSE_CONTAINER_FORMAT);
    const r = verifyLicense(signedByNew, [oldKey.publicKeyB64, newKey.publicKeyB64], now);
    expect(r.ok).toBe(true);
  });

  it('rejects once the signing key is dropped from the root list', () => {
    const signedByOld = makeSignedContainer(claims, oldKey.privateKey, LICENSE_CONTAINER_FORMAT);
    const r = verifyLicense(signedByOld, [newKey.publicKeyB64], now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('bad_signature');
  });

  it('never throws — returns a structured verdict for garbage input', () => {
    const r = verifyLicense(new Uint8Array([0, 1, 2, 3, 255]), [newKey.publicKeyB64], now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('malformed');
  });
});
