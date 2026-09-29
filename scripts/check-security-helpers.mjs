#!/usr/bin/env node

// Security-sensitive helpers are written once. Secret redaction lives in
// @agiworkforce/utils, path containment in the local-runtime contract, and
// envelope encryption with the only raw cipher calls in apps/web/lib/crypto.
// A second copy of any of them drifts: a redaction pattern added to one list
// is missing from the other, and a cipher opened outside the crypto module
// skips the associated-data binding the guard on that module enforces. The
// copies that exist today are recorded with their owner and fix, and the
// record only shrinks.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const SHARED_HELPERS = Object.freeze({
  redactSecrets: 'packages/platform/utils/src/logger.ts',
  isPathInside: 'packages/contracts/local-runtime/src/path-safety.ts',
  sealEnvelope: 'apps/web/lib/crypto/envelope.ts',
  openEnvelope: 'apps/web/lib/crypto/envelope.ts',
});

export const CRYPTO_ROOT = 'apps/web/lib/crypto/';

export const RECORDED_COPIES = Object.freeze({});

export const CIPHER_EXEMPTIONS = Object.freeze({
  'apps/web/lib/services/web-push-service.ts':
    'Web Push payload encryption is the aes128gcm scheme RFC 8291 prescribes for the push service, keyed by the subscriber, not a stored secret the envelope protects.',
});

export const SCANNED_ROOTS = Object.freeze(['apps', 'packages']);

const SKIP_DIRECTORY =
  /^(?:\.|node_modules$|\.next$|dist$|build$|out$|coverage$|target$|__tests__$|__mocks__$|__fixtures__$|e2e$|generated$)/;
const SOURCE_FILE = /\.(?:tsx?|mts)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?tsx?$|\.d\.ts$/;
const RAW_CIPHER = /\b(?:createCipheriv|createDecipheriv)\s*\(|\bsubtle\.(?:encrypt|decrypt)\s*\(/;

function sourceFiles(repoRoot, relativeRoot) {
  const files = [];
  const walk = (relativeDir) => {
    const absolute = path.join(repoRoot, relativeDir);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const relative = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORY.test(entry.name)) walk(relative);
      } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
        files.push(relative);
      }
    }
  };
  walk(relativeRoot);
  return files;
}

export function declaredHelpers(source) {
  return Object.keys(SHARED_HELPERS).filter((name) =>
    new RegExp(
      `(?:^|\\n)\\s*(?:export\\s+)?(?:async\\s+)?(?:function\\s+${name}\\s*[<(]|(?:const|let)\\s+${name}\\s*[:=])`,
    ).test(source),
  );
}

export function checkSecurityHelpers(
  repoRoot = REPO_ROOT,
  { copies = RECORDED_COPIES, cipherExemptions = CIPHER_EXEMPTIONS } = {},
) {
  const failures = [];
  const fail = (message) => failures.push(message);

  for (const [name, module] of Object.entries(SHARED_HELPERS)) {
    const source = existsSync(path.join(repoRoot, module))
      ? readFileSync(path.join(repoRoot, module), 'utf8')
      : null;
    if (source === null || !declaredHelpers(source).includes(name)) {
      fail(`${module} no longer declares ${name}, so there is no shared copy to point at`);
    }
  }

  const copiesSeen = new Set();
  const exemptionsSeen = new Set();
  for (const root of SCANNED_ROOTS) {
    for (const file of sourceFiles(repoRoot, root)) {
      const source = readFileSync(path.join(repoRoot, file), 'utf8');
      for (const name of declaredHelpers(source)) {
        if (SHARED_HELPERS[name] === file) continue;
        const key = `${file}#${name}`;
        if (copies[key] !== undefined) {
          copiesSeen.add(key);
          continue;
        }
        fail(
          `${file} declares its own ${name}. Import it from ${SHARED_HELPERS[name]} so the rule lives in one place.`,
        );
      }
      if (RAW_CIPHER.test(source) && !file.startsWith(CRYPTO_ROOT)) {
        if (cipherExemptions[file] !== undefined) {
          exemptionsSeen.add(file);
        } else {
          fail(
            `${file} calls a raw cipher outside ${CRYPTO_ROOT}. Seal and open through sealEnvelope and openEnvelope so the context binding holds.`,
          );
        }
      }
    }
  }

  for (const [key, fix] of Object.entries(copies)) {
    if (typeof fix !== 'string' || fix.trim().length < 20) fail(`${key} is recorded without a fix`);
    if (!copiesSeen.has(key)) {
      fail(`${key} is no longer a second copy. Delete its record; the list only shrinks.`);
    }
  }
  for (const [file, why] of Object.entries(cipherExemptions)) {
    if (typeof why !== 'string' || why.trim().length < 20)
      fail(`${file} is exempt without a reason`);
    if (!exemptionsSeen.has(file)) {
      fail(`${file} no longer calls a raw cipher. Delete its exemption; the list only shrinks.`);
    }
  }
  return failures;
}

function main() {
  const failures = checkSecurityHelpers();
  if (failures.length > 0) {
    console.error('Security helper check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `check-security-helpers: ${Object.keys(SHARED_HELPERS).length} helpers declared once, ${Object.keys(RECORDED_COPIES).length} recorded copies, raw ciphers only in ${CRYPTO_ROOT}.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
