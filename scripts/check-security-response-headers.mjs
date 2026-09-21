#!/usr/bin/env node
/**
 * Three headers decide whether a browser will run someone else's script, hand
 * someone else's site a credentialed response, or trust a certificate nobody
 * checked. Each is enumerated from where it is actually written.
 *
 * Every Content-Security-Policy the product emits is found by reading the
 * header writes out of the tree, not by reading the one the proxy happens to
 * build, because a route that sets its own is exactly the one that would widen
 * it. A policy that turns script execution loose has to say, in the same
 * policy, that it loads nothing by default: that is a sandboxed document, and
 * it is the only shape in which the allowance is safe.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const SCAN_ROOTS = ['apps/web/app', 'apps/web/lib', 'apps/web/features', 'apps/web/shared'];
const EXTRA_FILES = ['apps/web/proxy.ts'];
const SKIPPED_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '__tests__']);

const CSP_HEADER = /Content-Security-Policy/i;
const SCRIPT_SRC = /script-src([^;`'"]*(?:'[^']*'[^;`'"]*)*)/i;
const SANDBOXED = /default-src\s+'none'/i;

const CORS_ORIGIN = /['"]Access-Control-Allow-Origin['"]\s*:\s*(['"`])([^'"`]*)\1/g;
const CORS_CREDENTIALS = /Access-Control-Allow-Credentials/;
const SESSION_READ =
  /\b(?:requireUser|requireAccount|assertAccountActive|auth\(\)|currentUser\(|getSession\(|resolveApiActor)/;

const TLS_OFF = [
  /rejectUnauthorized\s*:\s*false/,
  /NODE_TLS_REJECT_UNAUTHORIZED['"\]]*\s*=\s*['"]0['"]/,
  /checkServerIdentity\s*:\s*\(\)\s*=>\s*(?:undefined|null)/,
];

function sourceFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      sourceFiles(full, out);
      continue;
    }
    if (!/\.(?:ts|tsx)$/.test(entry.name)) continue;
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

/** The tokens a script-src directive admits, bounded by the directive's own semicolon. */
export function scriptSourceOf(policy) {
  const match = SCRIPT_SRC.exec(policy);
  return match ? match[1] : null;
}

/**
 * Every string and template literal in a module that carries policy directives.
 * A policy is often assembled from one literal per directive and joined, so the
 * module, not the literal, is the scope that answers for the whole policy.
 */
export function policyLiterals(source) {
  const literals = [];
  let index = 0;
  while (index < source.length) {
    const quote = /['"`]/.exec(source.slice(index));
    if (!quote) break;
    const start = index + quote.index;
    const mark = source[start];
    let cursor = start + 1;
    while (cursor < source.length) {
      if (source[cursor] === '\\') {
        cursor += 2;
        continue;
      }
      if (source[cursor] === mark) break;
      if (mark !== '`' && source[cursor] === '\n') break;
      cursor += 1;
    }
    const body = source.slice(start + 1, cursor);
    if (/-src|frame-ancestors/.test(body)) literals.push(body);
    index = cursor + 1;
  }
  return literals;
}

function main() {
  const files = [
    ...SCAN_ROOTS.flatMap((root) => sourceFiles(path.join(scanRoot, root))),
    ...EXTRA_FILES.map((file) => path.join(scanRoot, file)).filter((file) => fs.existsSync(file)),
  ];
  if (files.length === 0) {
    console.error(
      'check-security-response-headers: no source file was found, which cannot be right.',
    );
    process.exit(1);
  }

  const failures = [];
  let policies = 0;
  let wildcards = 0;
  let cspFiles = 0;

  for (const file of files) {
    const rel = path.relative(scanRoot, file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');

    if (CSP_HEADER.test(source)) {
      cspFiles += 1;
      const literals = policyLiterals(source);
      const sandboxed = literals.some((literal) => SANDBOXED.test(literal));
      for (const policy of literals) {
        const directive = scriptSourceOf(policy);
        if (directive === null) continue;
        policies += 1;
        const unsafe = [...directive.matchAll(/'(unsafe-inline|unsafe-eval)'/g)].map(
          (match) => match[1],
        );
        if (unsafe.length === 0 || sandboxed) continue;
        failures.push(
          `${rel} emits a Content-Security-Policy whose script-src admits ${unsafe.join(' and ')}. ` +
            `An injected script then runs with the page's own origin and session. Drop it, guard it ` +
            `on NODE_ENV, or make the document a sandbox by giving the same policy default-src 'none'.`,
        );
      }
    }

    CORS_ORIGIN.lastIndex = 0;
    let cors;
    while ((cors = CORS_ORIGIN.exec(source)) !== null) {
      if (cors[2] !== '*') continue;
      wildcards += 1;
      if (CORS_CREDENTIALS.test(source)) {
        failures.push(
          `${rel} answers every origin with Access-Control-Allow-Origin: * and also sets ` +
            `Access-Control-Allow-Credentials, so any site can read a response carrying this ` +
            `user's session.`,
        );
        continue;
      }
      if (SESSION_READ.test(source)) {
        failures.push(
          `${rel} answers every origin with Access-Control-Allow-Origin: * on a route that reads ` +
            `the caller's session. A wildcard belongs only on a document that is the same for ` +
            `everyone.`,
        );
      }
    }

    for (const pattern of TLS_OFF) {
      if (!pattern.test(source)) continue;
      failures.push(
        `${rel} turns off TLS certificate verification, so anything on the path can present its ` +
          `own certificate and read what this process sends.`,
      );
    }
  }

  if (policies === 0) {
    console.error(
      'check-security-response-headers: no Content-Security-Policy was found, which cannot be right.',
    );
    process.exit(1);
  }

  if (failures.length === 0) {
    console.log(
      `check-security-response-headers: ${cspFiles} modules set a policy, ${policies} script-src ` +
        `directives, ${wildcards} wildcard CORS origin(s), none credentialed, TLS verified everywhere.`,
    );
    process.exit(0);
  }

  console.error('Response headers that hand control to someone else:\n');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\n${failures.length} finding(s).`);
  process.exit(1);
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
