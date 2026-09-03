#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(repoRoot, 'apps/web/.env.local');

const DEFAULTS = {
  appId: '4589673',
  slug: 'agi-workforce',
  clientId: 'Iv23liCj3iWpmOBCfBZH',
};

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(2);
}

function upsert(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.replace(/\n*$/, '')}\n${line}\n`;
}

function main() {
  const pemPath = arg('pem');
  const clientSecret = arg('client-secret');

  if (!pemPath) fail('--pem <path to the .pem private key> is required.');

  const resolvedPem = pemPath.startsWith('~')
    ? path.join(process.env['HOME'] ?? '', pemPath.slice(1))
    : path.resolve(pemPath);
  if (!existsSync(resolvedPem)) fail(`No file at ${resolvedPem}`);

  const pem = readFileSync(resolvedPem, 'utf8');
  if (!pem.includes('BEGIN RSA PRIVATE KEY') && !pem.includes('BEGIN PRIVATE KEY')) {
    fail(`${resolvedPem} is not a private key. A .certSigningRequest is a different file.`);
  }
  const pemBase64 = Buffer.from(pem, 'utf8').toString('base64');

  const webhookSecret = arg('webhook-secret') ?? randomBytes(32).toString('hex');
  const generatedWebhookSecret = !arg('webhook-secret');
  const tokenEncryptionKey = randomBytes(32).toString('hex');

  const values = {
    GITHUB_APP_ID: arg('app-id') ?? DEFAULTS.appId,
    GITHUB_APP_SLUG: arg('slug') ?? DEFAULTS.slug,
    GITHUB_APP_CLIENT_ID: arg('client-id') ?? DEFAULTS.clientId,
    GITHUB_APP_PRIVATE_KEY_BASE64: pemBase64,
    GITHUB_WEBHOOK_SECRET: webhookSecret,
    GITHUB_TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
  };
  if (clientSecret) values.GITHUB_APP_CLIENT_SECRET = clientSecret;

  const targets = [path.join(repoRoot, '.env.local'), envPath];

  const written = [];
  for (const target of targets) {
    let contents = existsSync(target) ? readFileSync(target, 'utf8') : '';
    if (existsSync(target)) copyFileSync(target, `${target}.bak`);

    const forThisTarget = { ...values };
    if (/^GITHUB_TOKEN_ENCRYPTION_KEY=.+$/m.test(contents)) {
      delete forThisTarget.GITHUB_TOKEN_ENCRYPTION_KEY;
      console.log(`• ${path.relative(repoRoot, target)}: GITHUB_TOKEN_ENCRYPTION_KEY already set`);
      console.log(', left as is (rotating it would orphan every stored installation token).');
    }

    for (const [key, value] of Object.entries(forThisTarget)) {
      contents = upsert(contents, key, value);
    }
    writeFileSync(target, contents, { mode: 0o600 });
    written.push({
      target: path.relative(repoRoot, target),
      count: Object.keys(forThisTarget).length,
    });
  }

  for (const { target, count } of written) {
    console.log(
      `✔ ${target}: wrote ${count} keys (previous file saved as ${path.basename(target)}.bak)`,
    );
  }
  console.log('\nKeys written:');
  for (const key of Object.keys(values)) console.log(`    ${key}`);

  console.log('\nNext:');
  let step = 1;
  if (!clientSecret) {
    console.log(`  ${step++}. Add GITHUB_APP_CLIENT_SECRET=<value> to BOTH files by hand.`);
    console.log('     The connector stays ABSENT (not broken) until it is present: all five of');
    console.log('     id/key/slug/client-id/client-secret are required together.');
  }
  if (generatedWebhookSecret) {
    console.log(`  ${step++}. Paste this generated webhook secret into the GitHub App form`);
    console.log('     (Webhook → Secret), or deliveries are rejected as unsigned:\n');
    console.log(`       ${webhookSecret}\n`);
  }
  console.log(`  ${step++}. Mirror the same values into Vercel (Production + Preview).`);
  console.log(`  ${step}. Restart the dev server, then GET /api/connectors should list "github".`);
}

main();
