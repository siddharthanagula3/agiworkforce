#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  CONCEPTS,
  findTrustedClientReads,
  parseVocabulary,
  requestBoundNames,
} from './lib/client-trusted-authz.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const API_ROOT = 'apps/web/app/api';
const EXTRA_ENTRY_POINTS = ['apps/web/proxy.ts'];

/**
 * Each entry names the exact read it forgives and why it is not a decision
 * about the caller. An entry that no longer matches is removed, not kept.
 */
const ALLOWED = [
  {
    file: `${API_ROOT}/share/[token]/route.ts`,
    concept: 'file-acl',
    reason:
      'The visibility here is the value being written, validated by VisibilitySchema first. The branch chooses WHICH server-side check runs, requireOrganizationPermission for the workspace case, and the row is only updated after it passes; nothing is granted by the value itself.',
  },
  {
    file: `${API_ROOT}/artifacts/publish/[token]/route.ts`,
    concept: 'file-acl',
    reason:
      'Same shape as the share route: the requested visibility selects the workspace permission check to run before the artifact is published, and appears in the response as the value that was written, never as the reason it was allowed.',
  },
];

/**
 * The other half of the same rule. A page that reads what it may do from the
 * address bar is deciding on the client, whatever the server later says.
 */
const CLIENT_ROOTS = ['apps/web/features', 'apps/web/app', 'apps/web/shared'];
const CLIENT_AUTHORITY = /\b(?:visibility|isPublic|isShared|canEdit|canDelete|isOwner|isAdmin)\b/;
const URL_DERIVED = /usePathname\(\)|window\.location|pathname|searchParams\.get\(/;

function walk(dir, acc = [], match = (name) => name === 'route.ts') {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc, match);
    else if (match(entry.name)) acc.push(full);
  }
  return acc;
}

const isClientModule = (name) => /\.tsx?$/.test(name) && !/\.test\.|\.spec\./.test(name);

const failures = [];
const entryPoints = [
  ...walk(path.join(scanRoot, API_ROOT)),
  ...EXTRA_ENTRY_POINTS.map((relative) => path.join(scanRoot, relative)).filter((file) =>
    fs.existsSync(file),
  ),
];

if (entryPoints.length === 0) {
  failures.push(`no request entry points found under ${API_ROOT}; the scan would pass vacuously`);
}

const forgiven = new Set();
for (const file of entryPoints) {
  const relative = path.relative(scanRoot, file).split(path.sep).join('/');
  const source = fs.readFileSync(file, 'utf8');
  for (const finding of findTrustedClientReads(source)) {
    const exemption = ALLOWED.find(
      (entry) => entry.file === relative && entry.concept === finding.concept,
    );
    if (exemption) {
      forgiven.add(`${exemption.file}::${exemption.concept}`);
      continue;
    }
    const concept = CONCEPTS.find((candidate) => candidate.id === finding.concept);
    failures.push(
      `${relative}:${finding.line} decides ${concept.question} from \`${finding.field}\`, which ` +
        `the client sent. Resolve it through ${concept.resolver} instead.\n    ${finding.text}`,
    );
  }
}

for (const entry of ALLOWED) {
  if (!fs.existsSync(path.join(scanRoot, entry.file))) {
    // A tree that does not hold the route has nothing to forgive; only the
    // repository itself can tell a removed route from one that is not here.
    if (scanRoot === repoRoot) failures.push(`stale exemption: ${entry.file} no longer exists`);
    continue;
  }
  if (!forgiven.has(`${entry.file}::${entry.concept}`)) {
    failures.push(
      `stale exemption: ${entry.file} no longer reads ${entry.concept} from the request; remove it`,
    );
  }
  if (entry.reason.trim().length < 60) {
    failures.push(`exemption for ${entry.file} (${entry.concept}) needs a real reason`);
  }
}

for (const concept of CONCEPTS) {
  const resolver = path.join(scanRoot, concept.resolver);
  if (!fs.existsSync(resolver)) {
    failures.push(
      `${concept.id} has no server-side answer: ${concept.resolver} is missing, so nothing ` +
        `decides ${concept.question} except the caller`,
    );
    continue;
  }
  if (requestBoundNames(fs.readFileSync(resolver, 'utf8')).size > 0) {
    failures.push(
      `${concept.resolver} reads the incoming request, so the module that is supposed to ` +
        `decide ${concept.question} takes the answer from the caller`,
    );
  }

  const source = concept.vocabularySource;
  if (!source) continue;
  const contract = path.join(scanRoot, source.file);
  if (!fs.existsSync(contract)) continue;
  const declared = parseVocabulary(fs.readFileSync(contract, 'utf8'), source.constant);
  if (declared === null) {
    failures.push(
      `${source.constant} is no longer readable in ${source.file}; this guard cannot tell a ` +
        `privileged ${concept.id} value from an ordinary one without it`,
    );
    continue;
  }
  const missing = declared.filter((value) => !concept.privilegedValues.includes(value));
  if (missing.length > 0) {
    failures.push(
      `${source.constant} gained ${missing.join(', ')}; add them to the ${concept.id} vocabulary ` +
        `in scripts/lib/client-trusted-authz.mjs or a route can branch on the new value unseen`,
    );
  }
}

let clientModules = 0;
for (const root of CLIENT_ROOTS) {
  for (const file of walk(path.join(scanRoot, root), [], isClientModule)) {
    const source = fs.readFileSync(file, 'utf8');
    if (!/['"]use client['"]/.test(source)) continue;
    clientModules += 1;
    const lines = source.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^\s*(?:\/\/|\*)/.test(line)) continue;
      if (!CLIENT_AUTHORITY.test(line) || !URL_DERIVED.test(line)) continue;
      failures.push(
        `${path.relative(scanRoot, file).split(path.sep).join('/')}:${index + 1} reads what the ` +
          `viewer may do out of the address bar; the server's answer is the only one that counts.` +
          `\n    ${line.trim()}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('Authorization decided by the client:\n');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\n${failures.length} finding(s).`);
  process.exit(1);
}

console.log(
  `check-client-trusted-authz: ${entryPoints.length} request entry points, ` +
    `${clientModules} client modules, ${CONCEPTS.length} concepts resolved server-side.`,
);
