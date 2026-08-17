#!/usr/bin/env node
/* global console */
import { Buffer } from 'node:buffer';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SIGNATURE_ALGORITHM = 'Ed';
const KDF_ALGORITHM = 'Sc';
const PUBLIC_KEY_BYTES = 42;
const SECRET_KEY_BYTES = 158;
const KEYNUM_BYTES = 104;
const COMMENT_PREFIX = 'untrusted comment:';

export function decodeKeyBlock(text, expectedBytes, label) {
  const payload = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(COMMENT_PREFIX))
    .at(-1);
  if (!payload) {
    throw new Error(`${label} contains no base64 key payload`);
  }
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length !== expectedBytes) {
    throw new Error(`${label} must decode to ${expectedBytes} bytes, got ${bytes.length}`);
  }
  if (bytes.subarray(0, 2).toString('utf8') !== SIGNATURE_ALGORITHM) {
    throw new Error(`${label} is not a minisign Ed25519 key`);
  }
  return bytes;
}

export function formatKeyId(keyId) {
  return Buffer.from(keyId).reverse().toString('hex').toUpperCase();
}

export function parsePublicKey(text) {
  const bytes = decodeKeyBlock(text, PUBLIC_KEY_BYTES, 'updater public key');
  return { keyId: bytes.subarray(2, 10), publicKey: bytes.subarray(10, 42) };
}

// libsodium crypto_pwhash_scryptsalsa208sha256 pickparams, reproduced by rsign2
// when it seals the Tauri updater key. Deriving different N/r/p yields a
// different stream and silently reports a valid escrow copy as a mismatch.
export function scryptParameters(opslimit, memlimit) {
  const ops = opslimit < 32768n ? 32768n : opslimit;
  const r = 8n;
  let nLog2 = 1n;
  let p;
  if (ops < memlimit / 32n) {
    p = 1n;
    const maxN = ops / (r * 4n);
    while (nLog2 < 63n && 1n << nLog2 <= maxN / 2n) {
      nLog2 += 1n;
    }
  } else {
    const maxN = memlimit / (r * 128n);
    while (nLog2 < 63n && 1n << nLog2 <= maxN / 2n) {
      nLog2 += 1n;
    }
    let maxrp = ops / 4n / (1n << nLog2);
    if (maxrp > 0x3fffffffn) {
      maxrp = 0x3fffffffn;
    }
    p = maxrp / r;
  }
  return { N: Number(1n << nLog2), r: Number(r), p: Number(p) };
}

export function parseSecretKey(text, password) {
  const bytes = decodeKeyBlock(text, SECRET_KEY_BYTES, 'escrowed updater secret key');
  if (bytes.subarray(2, 4).toString('utf8') !== KDF_ALGORITHM) {
    throw new Error('escrowed updater secret key is not scrypt-protected');
  }
  const salt = bytes.subarray(6, 38);
  const { N, r, p } = scryptParameters(bytes.readBigUInt64LE(38), bytes.readBigUInt64LE(46));
  const sealed = bytes.subarray(54, 54 + KEYNUM_BYTES);
  const stream = scryptSync(Buffer.from(password, 'utf8'), salt, KEYNUM_BYTES, {
    N,
    r,
    p,
    maxmem: 256 * N * r * p + (1 << 24),
  });
  const keynum = Buffer.alloc(KEYNUM_BYTES);
  for (let index = 0; index < KEYNUM_BYTES; index += 1) {
    keynum[index] = sealed[index] ^ stream[index];
  }
  return { keyId: keynum.subarray(0, 8), publicKey: keynum.subarray(40, 72) };
}

export function readCommittedPublicKey(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const encoded = config?.plugins?.updater?.pubkey;
  if (typeof encoded !== 'string' || encoded.length === 0) {
    throw new Error(`${configPath} has no plugins.updater.pubkey`);
  }
  return Buffer.from(encoded, 'base64').toString('utf8');
}

export function readSecretKeyFile(keyPath) {
  const raw = readFileSync(keyPath, 'utf8');
  if (raw.includes(COMMENT_PREFIX)) {
    return raw;
  }
  return Buffer.from(raw.trim(), 'base64').toString('utf8');
}

export function verifyEscrowedUpdaterKey({ secretKeyText, password, publicKeyText }) {
  const published = parsePublicKey(publicKeyText);
  const escrowed = parseSecretKey(secretKeyText, password);
  const matches =
    timingSafeEqual(published.keyId, escrowed.keyId) &&
    timingSafeEqual(published.publicKey, escrowed.publicKey);
  if (!matches) {
    throw new Error(
      'escrowed updater key does not match the updater public key shipped in every binary: wrong key file or wrong password',
    );
  }
  return { keyId: formatKeyId(published.keyId) };
}

const configPath = path.resolve(import.meta.dirname, '../src-tauri/tauri.conf.json');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const keyPath = process.argv[2];
  if (!keyPath) {
    console.error('usage: verify-updater-key.mjs <escrowed-key-file>');
    console.error('password is read from TAURI_SIGNING_PRIVATE_KEY_PASSWORD');
    process.exit(2);
  }
  try {
    const { keyId } = verifyEscrowedUpdaterKey({
      secretKeyText: readSecretKeyFile(keyPath),
      password: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '',
      publicKeyText: readCommittedPublicKey(configPath),
    });
    console.log(`escrowed updater key ${keyId} matches the committed updater public key`);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}
