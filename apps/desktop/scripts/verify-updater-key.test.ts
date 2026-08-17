import { generateKeyPairSync, randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  formatKeyId,
  parsePublicKey,
  readCommittedPublicKey,
  scryptParameters,
  verifyEscrowedUpdaterKey,
} from './verify-updater-key.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const desktopPackage = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, 'apps/desktop/package.json'), 'utf8'),
) as { scripts: Record<string, string> };
const macosRunbook = fs.readFileSync(
  path.join(repositoryRoot, 'apps/desktop/MACOS_RELEASE_RUNBOOK.md'),
  'utf8',
);

const DRILL_OPSLIMIT = 32768n;
const DRILL_MEMLIMIT = 1n << 30n;

function rawEd25519Pair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const seed = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  return { seed, publicKey: raw };
}

function publicKeyFile(keyId: Buffer, publicKey: Buffer) {
  const bytes = Buffer.concat([Buffer.from('Ed', 'utf8'), keyId, publicKey]);
  return `untrusted comment: minisign public key: ${formatKeyId(keyId)}\n${bytes.toString('base64')}\n`;
}

function secretKeyFile(keyId: Buffer, seed: Buffer, publicKey: Buffer, password: string) {
  const salt = randomBytes(32);
  const { N, r, p } = scryptParameters(DRILL_OPSLIMIT, DRILL_MEMLIMIT);
  const stream = scryptSync(Buffer.from(password, 'utf8'), salt, 104, {
    N,
    r,
    p,
    maxmem: 256 * N * r * p + (1 << 24),
  });
  const keynum = Buffer.concat([keyId, seed, publicKey, Buffer.alloc(32)]);
  const sealed = Buffer.alloc(104);
  for (let index = 0; index < 104; index += 1) {
    sealed[index] = keynum[index] ^ stream[index];
  }
  const opslimit = Buffer.alloc(8);
  opslimit.writeBigUInt64LE(DRILL_OPSLIMIT);
  const memlimit = Buffer.alloc(8);
  memlimit.writeBigUInt64LE(DRILL_MEMLIMIT);
  const bytes = Buffer.concat([Buffer.from('EdScB2', 'utf8'), salt, opslimit, memlimit, sealed]);
  return `untrusted comment: rsign encrypted secret key\n${bytes.toString('base64')}\n`;
}

describe('escrowed Tauri updater key restore drill', () => {
  const password = 'restore-drill-passphrase';
  const keyId = randomBytes(8);
  const { seed, publicKey } = rawEd25519Pair();
  const publicKeyText = publicKeyFile(keyId, publicKey);
  const secretKeyText = secretKeyFile(keyId, seed, publicKey, password);

  it('proves an escrow copy is the key behind the published updater public key', () => {
    expect(verifyEscrowedUpdaterKey({ secretKeyText, password, publicKeyText })).toEqual({
      keyId: formatKeyId(keyId),
    });
  });

  it('refuses an escrow copy whose passphrase is wrong', () => {
    expect(() =>
      verifyEscrowedUpdaterKey({ secretKeyText, password: 'not-the-passphrase', publicKeyText }),
    ).toThrow(/does not match the updater public key/u);
  });

  it('refuses an escrow copy of a different signing key', () => {
    const other = rawEd25519Pair();
    const otherKeyId = randomBytes(8);
    expect(() =>
      verifyEscrowedUpdaterKey({
        secretKeyText: secretKeyFile(otherKeyId, other.seed, other.publicKey, password),
        password,
        publicKeyText,
      }),
    ).toThrow(/does not match the updater public key/u);
  });

  it('derives the scrypt parameters rsign2 sealed the shipped key with', () => {
    expect(scryptParameters(0x2000000n, 0x40000000n)).toEqual({ N: 1048576, r: 8, p: 1 });
  });

  it('reads the updater public key the desktop binaries actually pin', () => {
    const committed = parsePublicKey(
      readCommittedPublicKey(path.join(repositoryRoot, 'apps/desktop/src-tauri/tauri.conf.json')),
    );
    expect(committed.publicKey).toHaveLength(32);
    expect(committed.keyId).toHaveLength(8);
  });
});

describe('updater key custody is reachable from the release procedure', () => {
  it('exposes the restore drill as a desktop script', () => {
    expect(desktopPackage.scripts['verify:updater-key']).toBe(
      'node scripts/verify-updater-key.mjs',
    );
  });

  it('points the macOS runbook at a custody document that exists', () => {
    const custodyPath = 'docs/security/tauri-updater-key-custody.md';
    expect(macosRunbook).toContain(custodyPath);
    const custody = fs.readFileSync(path.join(repositoryRoot, custodyPath), 'utf8');
    for (const requirement of [
      'verify:updater-key',
      'Escrow',
      'Compromise',
      'Rotation',
      'installed clients',
    ]) {
      expect(custody).toContain(requirement);
    }
  });
});
