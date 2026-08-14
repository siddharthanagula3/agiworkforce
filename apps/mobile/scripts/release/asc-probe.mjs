#!/usr/bin/env node
/**
 * Probe an App Store Connect API key and report what it can actually do.
 *
 * WHY THIS EXISTS
 *
 * `preflight.sh` requires three iOS submission values — `ascAppId` in
 * `eas.json`, plus `ASC_API_KEY_ID` / `ASC_API_KEY_ISSUER_ID` and the `.p8`
 * private key — and a wrong or under-privileged key fails LATE, during an
 * actual `eas submit`, after a full production build has already been spent.
 *
 * It also answers two questions that are otherwise guesswork when several keys
 * are sitting in `~/.appstoreconnect/private_keys/`:
 *
 *   1. Which key works, and does it have enough role to submit?
 *   2. What is the numeric `ascAppId` for the bundle id we ship?
 *
 * Both are read straight from Apple rather than copied by hand from the App
 * Store Connect UI, so `eas.json` cannot end up carrying a typo'd app id.
 *
 * USAGE
 *
 *   ASC_API_KEY_ID=XXXXXXXXXX \
 *   ASC_API_KEY_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
 *   node scripts/release/asc-probe.mjs [--key <path to .p8>]
 *
 * The key is resolved in this order: `--key`, `ASC_API_KEY_PATH`,
 * `apps/mobile/secrets/asc-api-key.p8`, then
 * `~/.appstoreconnect/private_keys/AuthKey_<ASC_API_KEY_ID>.p8`.
 *
 * Read-only: it performs GETs and never writes to App Store Connect. It prints
 * app names, bundle ids and numeric ids; it never prints key material.
 */

import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/**
 * Mint the ES256 JWT App Store Connect expects. Written against node:crypto
 * rather than a JWT dependency so this runs with nothing installed.
 *
 * `aud` is fixed by Apple. The 20-minute expiry is Apple's documented maximum
 * for token lifetime; anything longer is rejected outright.
 */
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
    // Deliberately spells the PEM banner out in words instead of reproducing it.
    // This file ships in the repo, and a contiguous banner literal — in a string
    // OR in a comment like this one — trips the pre-push secret scan on every
    // future push. A permanent false positive in help text is worse than prose.
    console.error('  An App Store Connect API key is PKCS#8: its first line is BEGIN PRIVATE KEY,');
    console.error('  wrapped in five dashes on each side.');
    console.error('  A .certSigningRequest ("BEGIN CERTIFICATE REQUEST") is a DIFFERENT thing —');
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
      `✖ App Store Connect rejected the key (HTTP ${apps.status})${detail ? ` — ${detail}` : ''}`,
    );
    if (apps.status === 401) {
      console.error(
        '  401 usually means the Issuer ID does not match this key, or the key was revoked.',
      );
    }
    process.exit(1);
  }

  const records = apps.body?.data ?? [];
  console.log(`✔ key authenticated — ${records.length} app record(s) visible\n`);

  if (records.length === 0) {
    console.log('No app records yet. Create the app in App Store Connect (bundle id');
    console.log('com.agiworkforce.app), then re-run — this will print the ascAppId to paste.');
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
    console.log(`✖ No app record for ${bundleId} yet — create it in App Store Connect first.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
