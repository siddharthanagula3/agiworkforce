#!/usr/bin/env node
/**
 * Apply (and verify) the browser-upload CORS policy on the R2 buckets.
 *
 * WHY THIS EXISTS
 *
 * Chat attachments, project knowledge files and avatars upload BROWSER-DIRECT
 * to R2 with a presigned PUT (`/api/uploads/presign` mints the URL; the bytes
 * never pass through the app server). A cross-origin PUT is not a simple
 * request, so the browser sends a CORS preflight first — and an R2 bucket has
 * NO CORS policy until one is set.
 *
 * Without it every attachment upload dies at the preflight:
 *
 *   Access to fetch at 'https://<bucket>.r2.cloudflarestorage.com/...'
 *   from origin 'http://localhost:3000' has been blocked by CORS policy
 *
 * Verified live on 2026-08-13: "+ → Add photos & files" accepted the files and
 * showed both chips, then lost the whole message on send. The private bucket
 * (`CLOUDFLARE_R2_PRIVATE_BUCKET_NAME`, which holds chat attachments) had no
 * CORS configuration at all, so this had never worked in a browser on any
 * origin — production included. Presigning is authorization; CORS is the
 * browser's separate, prior question.
 *
 * USAGE
 *
 *   node scripts/r2-apply-cors.mjs           # apply, then read back
 *   node scripts/r2-apply-cors.mjs --check   # read back only; exit 1 if wrong
 *
 * CREDENTIALS
 *
 * This talks to the Cloudflare REST API, NOT the S3 API, because bucket
 * CONFIGURATION is not an S3-token capability: the R2 access key pair in
 * `CLOUDFLARE_R2_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` is object-scoped and
 * `PutBucketCors` returns AccessDenied with it (confirmed). Set:
 *
 *   CLOUDFLARE_API_TOKEN     - token with "Workers R2 Storage: Edit"
 *   CLOUDFLARE_ACCOUNT_ID    - falls back to CLOUDFLARE_R2_ACCOUNT_ID
 *
 * Read from the environment or apps/web/.env.local.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Origins allowed to upload directly. Deliberately an explicit list rather
 * than `*`: a presigned URL is a bearer credential, and `*` would let any page
 * the user happens to visit replay one it obtained.
 */
const ALLOWED_ORIGINS = [
  'https://agiworkforce.com',
  'https://www.agiworkforce.com',
  'https://chat.agiworkforce.com',
  'https://agiworkforce-chat.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

/**
 * PUT is the upload. GET/HEAD let a presigned download be read back by script
 * (image previews re-fetch their own bytes). DELETE is deliberately absent:
 * nothing deletes browser-side, and object lifecycle is the server's job.
 *
 * `Content-Type` is what the upload client actually sends (see
 * `uploadHeaders` in app/api/uploads/presign/route.ts). The two `x-amz-*`
 * checksum headers are allowed so that switching the client to the AWS SDK's
 * own PUT — which signs them — does not silently reintroduce this outage.
 */
const CORS_RULES = [
  {
    id: 'browser-direct-upload',
    allowed: {
      origins: ALLOWED_ORIGINS,
      methods: ['PUT', 'GET', 'HEAD'],
      headers: [
        'Content-Type',
        'Content-Length',
        'x-amz-checksum-crc32',
        'x-amz-sdk-checksum-algorithm',
      ],
    },
    exposeHeaders: ['ETag'],
    maxAgeSeconds: 3600,
  },
];

function loadEnvLocal() {
  const envPath = path.join(repoRoot, 'apps/web/.env.local');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue; // ambient env wins
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function cloudflare(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, ok: res.ok, json };
}

function matchesExpected(rules) {
  const rule = rules?.[0];
  if (!rule) return false;
  const origins = rule.allowed?.origins ?? [];
  const methods = rule.allowed?.methods ?? [];
  return (
    origins.length === ALLOWED_ORIGINS.length &&
    ALLOWED_ORIGINS.every((origin) => origins.includes(origin)) &&
    CORS_RULES[0].allowed.methods.every((method) => methods.includes(method))
  );
}

async function main() {
  loadEnvLocal();
  const checkOnly = process.argv.includes('--check');

  const token = process.env['CLOUDFLARE_API_TOKEN'];
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'] ?? process.env['CLOUDFLARE_R2_ACCOUNT_ID'];

  if (!token) {
    console.error('✖ CLOUDFLARE_API_TOKEN is not set (needs "Workers R2 Storage: Edit").');
    console.error('  See FoundersAssistance.md — R2 CORS for browser uploads.');
    process.exit(2);
  }
  if (!accountId) {
    console.error('✖ CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_R2_ACCOUNT_ID is not set.');
    process.exit(2);
  }

  const buckets = [
    process.env['CLOUDFLARE_R2_BUCKET_NAME'],
    process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'],
  ].filter((name, index, all) => Boolean(name) && all.indexOf(name) === index);

  if (buckets.length === 0) {
    console.error(
      '✖ No bucket names configured (CLOUDFLARE_R2_BUCKET_NAME / _PRIVATE_BUCKET_NAME).',
    );
    process.exit(2);
  }

  let failed = false;

  for (const bucket of buckets) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/cors`;

    if (!checkOnly) {
      const put = await cloudflare('PUT', url, token, { rules: CORS_RULES });
      if (!put.ok || put.json?.success === false) {
        failed = true;
        const message = put.json?.errors?.map((e) => `${e.code}: ${e.message}`).join('; ');
        console.error(
          `✖ ${bucket}: PUT failed (HTTP ${put.status})${message ? ` — ${message}` : ''}`,
        );
        continue;
      }
      console.log(`✔ ${bucket}: CORS policy applied`);
    }

    // Read back. An apply that reports success without persisting is exactly
    // the failure worth catching, so this is not optional.
    const get = await cloudflare('GET', url, token);
    const rules = get.json?.result?.rules;
    if (matchesExpected(rules)) {
      console.log(
        `✔ ${bucket}: verified — ${rules[0].allowed.origins.length} origins, methods ${rules[0].allowed.methods.join('/')}`,
      );
    } else {
      failed = true;
      console.error(`✖ ${bucket}: read-back does not match the expected policy`);
      console.error(JSON.stringify(rules ?? get.json?.errors ?? null, null, 2));
    }
  }

  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
