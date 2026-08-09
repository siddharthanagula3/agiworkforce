#!/usr/bin/env node
/**
 * Repository-owned secret scanning (ledger task CRIT-017).
 *
 * WHY REPOSITORY-OWNED rather than a third-party action. This repo pins every
 * GitHub Action by commit SHA (`actions-pinned-check.yml`), so a scanner
 * dependency is one more supply-chain edge to pin, review and rotate — for a
 * job that is a few dozen regexes. It also lets the scanner share its pattern
 * roster with the three REDACTORS already in the tree
 * (`packages/platform/utils/src/logger.ts`, `apps/cli/src/secret_redaction.rs`,
 * `apps/extension-vscode/src/core/telemetry.ts`), which is the property that
 * actually matters: a credential format that one of them can recognise but the
 * others cannot is the gap every one of these bugs has come through.
 *
 * WHAT IT IS NOT. This is not entropy analysis and deliberately so. Entropy
 * scanners fire on minified bundles, lockfile hashes, base64 fixtures and UUIDs,
 * and a scanner that cries wolf gets `--no-verify`'d within a week. Every
 * pattern below matches a credential format with a vendor-assigned prefix, so a
 * hit is a real credential shape rather than "this string looks random."
 *
 * A hit is a BLOCKING failure. If a match is a deliberate fixture, make it
 * unmistakably fake (`sk-ant-EXAMPLE...`) rather than allowlisting the file —
 * the ledger's own instruction, and it keeps the fixture honest for the next
 * reader too.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

/**
 * Credential formats with a vendor-assigned prefix.
 *
 * Kept in lockstep with the redactors named in the header. When a provider is
 * added to one, add it here — `__tests__` parity is asserted by
 * `scripts/__tests__/check-secrets.test.mjs`.
 */
const PATTERNS = [
  { name: 'PEM private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: 'Anthropic API key', re: /sk-ant-(?!EXAMPLE|FAKE|TEST)[A-Za-z0-9_-]{20,}/g },
  { name: 'OpenAI project key', re: /sk-proj-(?!EXAMPLE|FAKE|TEST)[A-Za-z0-9_-]{20,}/g },
  { name: 'Groq API key', re: /gsk_[A-Za-z0-9]{48,}/g },
  { name: 'xAI API key', re: /xai-[A-Za-z0-9]{20,}/g },
  { name: 'Stripe live key', re: /(?:sk|rk)_live_[A-Za-z0-9_]{16,}/g },
  { name: 'Slack token', re: /xox[baprs]-[A-Za-z0-9-]{12,}/g },
  { name: 'GitHub fine-grained PAT', re: /github_pat_[A-Za-z0-9_]{22,}/g },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{30,}/g },
  { name: 'Google API key', re: /AIza[A-Za-z0-9_-]{35}/g },
  { name: 'AWS access key id', re: /A(?:KIA|SIA)[A-Z0-9]{16}/g },
  {
    name: 'Postgres/Redis URL with password',
    re: /\b(?:postgres|postgresql|rediss?|mongodb)(?:\+\w+)?:\/\/[^\s:@/]+:[^\s@/]{6,}@/gi,
  },
  { name: 'Private key in JSON', re: /"private_key"\s*:\s*"-----BEGIN/g },
];

/**
 * Placeholder markers that make a match unmistakably a fixture. A credential
 * carrying one of these is documentation, not a leak.
 */
const PLACEHOLDER =
  /EXAMPLE|PLACEHOLDER|REDACTED|XXXXXX|000000|123456|your[_-]?key|dummy|sample|<[a-z-]+>/i;

/** Paths that cannot contain a real credential by construction. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'target',
  'dist',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'out',
]);

const SKIP_FILE =
  /\.(png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|mp4|mp3|wav|pdf|zip|gz|node|wasm|lock)$/i;

/** This scanner necessarily contains every pattern it looks for. */
const SELF = new Set(['scripts/check-secrets.mjs', 'scripts/__tests__/check-secrets.test.mjs']);

function trackedFiles() {
  // Tracked files only: an untracked local `.env` is the developer's business
  // and cannot leak through a push. `git ls-files` also respects .gitignore for
  // free, which a manual walk would have to reimplement.
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 * 1024 * 1024 })
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Reviewed exemptions, keyed on (path, credential format).
 *
 * NOT a wildcard: a new credential FORMAT appearing in an already-listed file
 * still fails. That is the property that matters — an allowlist which exempts a
 * whole file quietly stops protecting it.
 */
const ALLOWLIST_PATH = 'scripts/secret-scan-allowlist.json';
let allowlist = { entries: [] };
try {
  allowlist = JSON.parse(fs.readFileSync(path.join(root, ALLOWLIST_PATH), 'utf8'));
} catch {
  // Absent allowlist means nothing is exempt, which fails loudly rather than open.
}
/**
 * Join a (path, format) pair into a map key.
 *
 * Both the population loop and the scan loop MUST build the key through this
 * one function. They were previously two separate template literals, and an
 * invisible control character crept into one of them — the keys printed
 * identically, compared unequal, and every exemption silently failed open while
 * the scan reported 55 findings it should have passed. One function, one
 * separator, no way for them to drift.
 */
const allowKey = (filePath, format) => `${filePath}::${format}`;

const allowed = new Map();
for (const entry of allowlist.entries ?? []) {
  if (!entry?.path || !entry?.format) continue;
  if (!entry.reason || entry.reason.length < 25) {
    console.error(
      `Allowlist entry for ${entry.path} (${entry.format}) has no real reason. ` +
        `An entry without one reads as "reviewed and accepted" for something nobody reviewed.`,
    );
    process.exit(1);
  }
  allowed.set(allowKey(entry.path, entry.format), false); // false = not yet matched
}

const findings = [];
let scanned = 0;
let exempted = 0;

for (const rel of trackedFiles()) {
  if (SELF.has(rel)) continue;
  if (SKIP_FILE.test(rel)) continue;
  if (rel.split('/').some((segment) => SKIP_DIRS.has(segment))) continue;

  const full = path.join(root, rel);
  let src;
  try {
    const stat = fs.statSync(full);
    // A credential is short. Anything multi-megabyte is a bundle or fixture,
    // and reading them all makes this too slow to keep in the commit hook.
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue;
    src = fs.readFileSync(full, 'utf8');
  } catch {
    continue;
  }
  scanned += 1;

  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(src)) !== null) {
      const lineNo = src.slice(0, match.index).split('\n').length;
      const line = src.split('\n')[lineNo - 1] ?? '';
      if (PLACEHOLDER.test(line)) continue;
      const key = allowKey(rel, name);
      if (allowed.has(key)) {
        allowed.set(key, true);
        exempted += 1;
        continue;
      }
      findings.push({ rel, lineNo, name, hint: match[0].slice(0, 12) });
    }
  }
}

if (findings.length > 0) {
  console.error(`Secret scan FAILED — ${findings.length} finding(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.rel}:${f.lineNo}  ${f.name}  (starts "${f.hint}…")`);
  }
  console.error(
    `\nIf a finding is a deliberate fixture, make the value unmistakably fake — add EXAMPLE,\n` +
      `PLACEHOLDER or <your-key> to the line — rather than allowlisting the file. A fixture that\n` +
      `still looks like a live credential misleads every future reader, which is the actual defect.\n` +
      `\nIf it is a real credential: it is already in git history. ROTATE IT FIRST, then remove it.\n`,
  );
  process.exit(1);
}

// A stale exemption is worse than none: it reads as "reviewed and accepted" for
// code that has since moved on, and it is how an allowlist slowly becomes a list
// of things nobody has looked at in a year.
const stale = [...allowed.entries()].filter(([, matched]) => !matched).map(([key]) => key);
if (stale.length > 0) {
  console.error(
    `Secret scan FAILED — ${stale.length} stale allowlist entry(ies) matched nothing:\n\n` +
      stale.map((s) => `  ${s}`).join('\n') +
      `\n\nThe finding is gone, so delete the entry from ${ALLOWLIST_PATH}.\n`,
  );
  process.exit(1);
}

console.log(
  `Secret scan passed (${scanned} tracked files, ${PATTERNS.length} credential formats, ` +
    `${exempted} reviewed exemption(s) across ${allowed.size} allowlist entries).`,
);
