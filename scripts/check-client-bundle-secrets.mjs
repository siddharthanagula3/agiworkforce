#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const BUNDLE_ROOT = path.join(repoRoot, 'apps/web/.next/static');
const SOURCE_ROOTS = ['apps/web/app', 'apps/web/features', 'apps/web/shared', 'apps/web/lib'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const BUNDLE_EXTENSIONS = new Set(['.js', '.mjs', '.json', '.css']);

const SECRET_VALUE_PATTERNS = [
  {
    name: 'Stripe or Anthropic style secret key',
    re: /\b(?:sk|rk|whsec)_(?:live|test)_[A-Za-z0-9]{16,}/g,
  },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{32,}/g },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{40,}/g },
  { name: 'Google API key', re: /\bAIza[A-Za-z0-9_-]{35}/g },
  { name: 'Slack token', re: /\bxox[abposr]-[A-Za-z0-9-]{20,}/g },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'OpenAI style project key', re: /\bsk-(?:proj|ant|or)-[A-Za-z0-9_-]{20,}/g },
  {
    name: 'private key block',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s"'\\rn]*[A-Za-z0-9+/]{40,}/g,
  },
];

const SECRET_ENV_NAME =
  /\bNEXT_PUBLIC_[A-Z0-9_]*(SECRET|PRIVATE|PASSWORD|CREDENTIAL|SERVICE_ROLE|ACCESS_TOKEN|REFRESH_TOKEN|API_KEY|_KEY)[A-Z0-9_]*/g;

// A publishable key is meant to ship to the browser; naming it here keeps the
// name-shaped rule from flagging the values that are public by design.
const PUBLISHABLE_ENV_NAMES = new Set([
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_SENTRY_KEY',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
]);

function walk(root, extensions, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, extensions, out);
      continue;
    }
    if (!extensions.has(path.extname(entry.name))) continue;
    if (/\.(?:test|spec)\.[jt]sx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function scanValues(files, label, findings) {
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const { name, re } of SECRET_VALUE_PATTERNS) {
      re.lastIndex = 0;
      const match = re.exec(source);
      if (!match) continue;
      const line = source.slice(0, match.index).split('\n').length;
      findings.push({
        file: path.relative(repoRoot, file),
        line,
        detail: `${label}: ${name}`,
      });
    }
  }
}

function scanEnvNames(files, findings) {
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    SECRET_ENV_NAME.lastIndex = 0;
    for (const match of source.matchAll(SECRET_ENV_NAME)) {
      const name = match[0];
      if (PUBLISHABLE_ENV_NAMES.has(name)) continue;
      const line = source.slice(0, match.index).split('\n').length;
      findings.push({
        file: path.relative(repoRoot, file),
        line,
        detail: `client env var named like a secret: ${name}`,
      });
    }
  }
}

function main() {
  const findings = [];

  const sourceFiles = SOURCE_ROOTS.flatMap((root) =>
    walk(path.join(repoRoot, root), SOURCE_EXTENSIONS),
  );
  scanValues(sourceFiles, 'secret literal in web source', findings);
  scanEnvNames(sourceFiles, findings);

  const bundleFiles = walk(BUNDLE_ROOT, BUNDLE_EXTENSIONS);
  scanValues(bundleFiles, 'secret literal in the built client bundle', findings);

  if (findings.length > 0) {
    console.error('check:client-bundle-secrets FAILED\n');
    for (const finding of findings) {
      console.error(`  ${finding.file}:${finding.line}  ${finding.detail}`);
    }
    console.error(
      '\nA secret must never reach the browser. Move the value to a server-only env var' +
        ' and read it in a server component, a route handler or a server action. A key that' +
        ' is publishable by design belongs in PUBLISHABLE_ENV_NAMES in this script.',
    );
    process.exit(1);
  }

  const scanned = sourceFiles.length + bundleFiles.length;
  const bundleNote =
    bundleFiles.length > 0
      ? `${bundleFiles.length} built client files`
      : 'no built client bundle present (run next build first to scan it)';
  console.log(
    `check:client-bundle-secrets passed: ${scanned} files scanned, ${bundleNote}, no secret` +
      ' literal and no client env var named like a secret.',
  );
  process.exit(0);
}

main();
