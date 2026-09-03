#!/usr/bin/env node

import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function mintToken({ keyId, issuerId, privateKey }) {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 20 * 60,
    aud: 'appstoreconnect-v1',
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${signature.toString('base64url')}`;
}

function resolveKeyPath(keyId) {
  const flagIndex = process.argv.indexOf('--key');
  const candidates = [
    flagIndex >= 0 ? process.argv[flagIndex + 1] : null,
    process.env['ASC_API_KEY_PATH'],
    path.join(mobileDir, 'secrets/asc-api-key.p8'),
    keyId ? path.join(homedir(), '.appstoreconnect/private_keys', `AuthKey_${keyId}.p8`) : null,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function asc(token, endpoint) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, ok: res.ok, body };
}

async function main() {
  const keyId = process.env['ASC_API_KEY_ID'];
  const issuerId = process.env['ASC_API_KEY_ISSUER_ID'];

  if (!keyId || !issuerId) {
    console.error('✖ ASC_API_KEY_ID and ASC_API_KEY_ISSUER_ID must both be set.');
    console.error('  App Store Connect → Users and Access → Integrations → App Store Connect API.');
    console.error('  The Issuer ID is the UUID shown above the key list; the Key ID is the');
    console.error('  10-character column next to your key (it is also in the .p8 filename).');
    process.exit(2);
  }

  const keyPath = resolveKeyPath(keyId);
  if (!keyPath) {
    console.error(`✖ No .p8 found for key ${keyId}. Pass --key <path> or set ASC_API_KEY_PATH.`);
    process.exit(2);
  }

  const privateKey = readFileSync(keyPath, 'utf8');
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    console.error(`✖ ${keyPath} is not a PKCS#8 private key.`);
    console.error('  An App Store Connect API key is PKCS#8: its first line is BEGIN PRIVATE KEY,');
    console.error('  wrapped in five dashes on each side.');
    console.error('  A .certSigningRequest ("BEGIN CERTIFICATE REQUEST") is a DIFFERENT thing, ');
    console.error('  that requests a signing certificate and cannot authenticate the API.');
    process.exit(2);
  }

  console.log(`key      : ${keyId}`);
  console.log(`key file : ${keyPath}`);

  const token = mintToken({ keyId, issuerId, privateKey });

  const apps = await asc(token, 'apps?limit=200');
  if (!apps.ok) {
    const detail = apps.body?.errors?.map((e) => `${e.status} ${e.title}: ${e.detail}`).join('; ');
    console.error(
      `✖ App Store Connect rejected the key (HTTP ${apps.status})${detail ? `, ${detail}` : ''}`,
    );
    if (apps.status === 401) {
      console.error(
        '  401 usually means the Issuer ID does not match this key, or the key was revoked.',
      );
    }
    process.exit(1);
  }

  const records = apps.body?.data ?? [];
  console.log(`✔ key authenticated, ${records.length} app record(s) visible\n`);

  if (records.length === 0) {
    console.log('No app records yet. Create the app in App Store Connect (bundle id');
    console.log('com.agiworkforce.app), then re-run, this will print the ascAppId to paste.');
    return;
  }

  const bundleId = 'com.agiworkforce.app';
  for (const record of records) {
    const attrs = record.attributes ?? {};
    const marker = attrs.bundleId === bundleId ? '  <-- ours' : '';
    console.log(
      `  ${record.id}  ${String(attrs.bundleId ?? '?').padEnd(34)} ${attrs.name ?? ''}${marker}`,
    );
  }

  const ours = records.find((record) => record.attributes?.bundleId === bundleId);
  console.log('');
  if (ours) {
    console.log(`✔ ascAppId for ${bundleId}: ${ours.id}`);
    console.log('  Put it in apps/mobile/eas.json → submit.production.ios.ascAppId');
  } else {
    console.log(`✖ No app record for ${bundleId} yet, create it in App Store Connect first.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
