#!/usr/bin/env node
/**
 * Write the seven GitHub App environment variables into apps/web/.env.local.
 *
 * WHY THIS EXISTS
 *
 * The GitHub connector is gated on all five of `GITHUB_APP_ID`,
 * `GITHUB_APP_PRIVATE_KEY_BASE64`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`
 * and `GITHUB_APP_CLIENT_SECRET` being present (`github-app.ts:97-101`), plus
 * `GITHUB_WEBHOOK_SECRET` to accept webhooks and `GITHUB_TOKEN_ENCRYPTION_KEY`
 * to store installation tokens at all. A partial set makes the connector
 * silently ABSENT rather than visibly broken, which is the hardest failure to
 * diagnose by hand — so this sets them together or not at all.
 *
 * It also removes the two transcription hazards: base64-encoding the `.pem`
 * (a hand-run `base64` without `tr -d '\n'` embeds newlines and every JWT
 * signature then fails), and generating the two self-chosen secrets at the
 * exact widths their validators demand (`GITHUB_TOKEN_ENCRYPTION_KEY` must be
 * 64 hex characters or `HEX_64_RE` rejects it).
 *
 * USAGE
 *
 *   node scripts/github-app-env.mjs \
 *     --pem ~/Downloads/agi-workforce.<date>.private-key.pem \
 *     --client-secret <the client secret> \
 *     [--webhook-secret <value>]     # omit to generate one
 *
 * `--app-id`, `--slug` and `--client-id` default to this app's published,
 * non-secret identity and can be overridden.
 *
 * Existing keys are replaced in place; every other line is left untouched, and
 * the previous file is copied to `.env.local.bak` first. Secrets are never
 * printed — only which keys were written.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(repoRoot, 'apps/web/.env.local');

/** Published, non-secret identity confirmed via GET https://api.github.com/apps/agi-workforce. */
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
  // `--client-secret` is optional so the operator can add that one value by
  // hand and never route it through a shell history or a chat transcript. The
  // remaining six are written either way, and the summary states plainly that
  // the connector stays absent until the secret lands (all five of the gate
  // must be present — github-app.ts:97-101).

  const resolvedPem = pemPath.startsWith('~')
    ? path.join(process.env['HOME'] ?? '', pemPath.slice(1))
    : path.resolve(pemPath);
  if (!existsSync(resolvedPem)) fail(`No file at ${resolvedPem}`);

  const pem = readFileSync(resolvedPem, 'utf8');
  if (!pem.includes('BEGIN RSA PRIVATE KEY') && !pem.includes('BEGIN PRIVATE KEY')) {
    fail(`${resolvedPem} is not a private key. A .certSigningRequest is a different file.`);
  }
  // No trailing newline: a base64 value with embedded newlines breaks the JWT.
  const pemBase64 = Buffer.from(pem, 'utf8').toString('base64');

  const webhookSecret = arg('webhook-secret') ?? randomBytes(32).toString('hex');
  const generatedWebhookSecret = !arg('webhook-secret');
  const tokenEncryptionKey = randomBytes(32).toString('hex'); // 64 hex chars, HEX_64_RE

  const values = {
    GITHUB_APP_ID: arg('app-id') ?? DEFAULTS.appId,
    GITHUB_APP_SLUG: arg('slug') ?? DEFAULTS.slug,
    GITHUB_APP_CLIENT_ID: arg('client-id') ?? DEFAULTS.clientId,
    GITHUB_APP_PRIVATE_KEY_BASE64: pemBase64,
    GITHUB_WEBHOOK_SECRET: webhookSecret,
    GITHUB_TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
  };
  if (clientSecret) values.GITHUB_APP_CLIENT_SECRET = clientSecret;

  // Every target that the local runtimes read. `.env.local` at the repo root is
  // the workspace-wide file some tooling loads; `apps/web/.env.local` is what
  // the web dev server reads. Writing one and not the other produces a
  // connector that works under `next dev` and not under a workspace script (or
  // the reverse), which is a miserable thing to debug.
  const targets = [path.join(repoRoot, '.env.local'), envPath];

  const written = [];
  for (const target of targets) {
    let contents = existsSync(target) ? readFileSync(target, 'utf8') : '';
    if (existsSync(target)) copyFileSync(target, `${target}.bak`);

    const forThisTarget = { ...values };
    // Never clobber an existing encryption key: rotating it orphans every
    // already-sealed installation token. Rotation is a deliberate, separate act
    // (see the key-ring note in github-app.ts).
    if (/^GITHUB_TOKEN_ENCRYPTION_KEY=.+$/m.test(contents)) {
      delete forThisTarget.GITHUB_TOKEN_ENCRYPTION_KEY;
      console.log(`• ${path.relative(repoRoot, target)}: GITHUB_TOKEN_ENCRYPTION_KEY already set`);
      console.log('  — left as is (rotating it would orphan every stored installation token).');
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
