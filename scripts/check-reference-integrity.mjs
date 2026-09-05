#!/usr/bin/env node
/* global console */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  REPO_ROOT,
  REPO_ROOTS,
  REFERENCE_EXTENSIONS,
  buildPathIndex,
  extensionOf,
  extractComments,
  markdownProseLines,
  readText,
  resolveReference,
  workspaceFiles,
} from './lib/comment-scan.mjs';

const WRITE_BASELINE = process.argv.includes('--write-baseline');
const AS_JSON = process.argv.includes('--json');
const ALLOWLIST_PATH = 'scripts/config/reference-integrity-allowlist.json';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ROOT_ALT = REPO_ROOTS.map(escapeRegExp).join('|');
const EXT_ALT = REFERENCE_EXTENSIONS.join('|');

const CODE_PATH_PATTERN = new RegExp(
  `(?:^|[^A-Za-z0-9_./@-])((?:${ROOT_ALT})\\/(?:[A-Za-z0-9_.-]+\\/)*[A-Za-z0-9_.-]+\\.(?:${EXT_ALT}))(?![A-Za-z0-9_/-])`,
  'g',
);

const MD_LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)\)/g;
const MD_BACKTICK_PATTERN = /`([^`\n]+)`/g;
const MD_PATHISH = new RegExp(`^(?:${ROOT_ALT})\\/[A-Za-z0-9_./-]+$`);

const SCRIPT_PATTERN =
  /(?:^|[^A-Za-z0-9_-])(?:pnpm|npm run|yarn)\s+(?:run\s+)?([a-z][a-z0-9]*(?::[a-z0-9:-]+)+)/g;

const PACKAGE_PATTERN = /@agiworkforce\/[a-z0-9-]+/g;

const PROVENANCE_VERBS =
  /\b(?:ported|moved|migrated|extracted|replaces?|replaced|formerly|previously|superseded|supersedes|lifted|copied|deleted|removed|retired|renamed|was\s+at|used\s+to|no\s+longer|instead\s+of)\b/i;

const EXCLUDED_FILES = new Set(['CHANGELOG.md']);
function vendoredSkillPrefixes() {
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'skills-lock.json'), 'utf8'));
    const skills = lock.skills && typeof lock.skills === 'object' ? lock.skills : {};
    return Object.values(skills)
      .filter((skill) => skill?.sourceType && skill.sourceType !== 'first-party')
      .map((skill) => `${skill.path}/`);
  } catch {
    return [];
  }
}

const EXCLUDED_PREFIXES = ['audit/', 'node_modules/', ...vendoredSkillPrefixes()];
// The remediation register is a 991 KB machine-generated ledger of historical
// findings; every path it cites is evidence of where a defect was, not a live
// reference. Excluding the file rather than all of docs/work keeps the rest of
// the tier validated.
const EXCLUDED_EXACT = new Set(['docs/work/remediation-register.json']);

const TEST_PATH = /(?:^|\/)__tests__\/|\.(?:test|spec|stories|bench)\.[cm]?[jt]sx?$/;

const JSON_PATH_KEYS = new Set([
  'path',
  'paths',
  'evidence',
  'consumers',
  'ownedWritePaths',
  'readOnlyContextPaths',
  'blockedPaths',
  'sources',
]);

const JSON_EXCLUDED_KEYS = new Set(['originalPath', 'archivedHistorical']);

const AGENT_CONTEXT_JSON = [
  'docs/agent-context/repo-map.json',
  'docs/agent-context/lanes.json',
  'docs/agent-context/risk-map.json',
  'docs/agent-context/doc-status.json',
  'docs/agent-context/non-md-artifact-status.json',
];

function isExcluded(file) {
  if (EXCLUDED_FILES.has(file) || EXCLUDED_EXACT.has(file)) return true;
  return EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function findingKey(finding) {
  return `${finding.kind}::${finding.file}::${finding.reference}`;
}

function collectManifestNames(files) {
  const scripts = new Set();
  const packages = new Set();
  for (const file of files) {
    if (path.basename(file) !== 'package.json') continue;
    if (file.includes('node_modules/')) continue;
    let manifest;
    try {
      manifest = JSON.parse(readText(file));
    } catch {
      continue;
    }
    for (const name of Object.keys(manifest.scripts ?? {})) scripts.add(name);
    if (typeof manifest.name === 'string') packages.add(manifest.name);
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const name of Object.keys(manifest[field] ?? {})) packages.add(name);
    }
  }
  return { scripts, packages };
}

export function ignoreQueryMap(candidates) {
  const sourceOf = new Map();
  for (const candidate of candidates) {
    sourceOf.set(candidate, candidate);
    if (!candidate.endsWith('/')) sourceOf.set(`${candidate}/`, candidate);
  }
  return sourceOf;
}

function ignoredPaths(candidates) {
  if (candidates.length === 0) return new Set();
  const sourceOf = ignoreQueryMap(candidates);
  try {
    const output = execFileSync('git', ['check-ignore', '--stdin'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      input: [...sourceOf.keys()].join('\n'),
    });
    return new Set(
      output
        .split('\n')
        .filter(Boolean)
        .map((line) => sourceOf.get(line) ?? line),
    );
  } catch {
    return new Set();
  }
}

export function blockContext(comments) {
  const byLine = new Map();
  let start = 0;
  let text = [];

  const flush = () => {
    const joined = text.join(' ');
    for (let i = start; i < start + text.length; i += 1) byLine.set(i, joined);
  };

  let previous = null;
  for (const comment of comments) {
    if (previous !== null && comment.line === previous + 1) {
      text.push(comment.text);
    } else {
      if (text.length) flush();
      start = comment.line;
      text = [comment.text];
    }
    previous = comment.line;
  }
  if (text.length) flush();

  return byLine;
}

function scanCodeComments(file, source, index, findings) {
  const extension = extensionOf(file);
  const comments = extractComments(source, extension);
  if (comments.length === 0) return;

  if (TEST_PATH.test(file)) return;

  const blockText = blockContext(comments);

  for (const comment of comments) {
    if (PROVENANCE_VERBS.test(blockText.get(comment.line) ?? comment.text)) continue;

    for (const match of comment.text.matchAll(CODE_PATH_PATTERN)) {
      const reference = match[1];
      if (/[*{}]|\.\.\./.test(reference)) continue;
      if (resolveReference(reference, file, index)) continue;
      findings.push({
        kind: 'path',
        file,
        line: comment.line,
        reference,
        detail: 'comment cites a path that does not resolve',
      });
    }
  }
}

function scanMarkdown(file, source, index, findings) {
  for (const { line, text } of markdownProseLines(source)) {
    if (PROVENANCE_VERBS.test(text)) continue;

    for (const match of text.matchAll(MD_LINK_PATTERN)) {
      let target = match[1];
      if (/^(?:https?:|mailto:|#)/.test(target)) continue;
      target = target.split('#')[0].split('?')[0];
      if (!target || /[*{}<>]|\.\.\./.test(target)) continue;
      const normalized =
        target.startsWith('../') || target.startsWith('./')
          ? path.posix.normalize(path.posix.join(path.posix.dirname(file), target))
          : target;
      if (resolveReference(normalized, file, index, { allowDirectory: true })) continue;
      findings.push({
        kind: 'md-link',
        file,
        line,
        reference: target,
        detail: 'markdown link target does not resolve',
      });
    }

    for (const match of text.matchAll(MD_BACKTICK_PATTERN)) {
      const reference = match[1];
      if (!MD_PATHISH.test(reference)) continue;
      if (/[*{}]|\.\.\./.test(reference)) continue;
      if (resolveReference(reference, file, index, { allowDirectory: true })) continue;
      findings.push({
        kind: 'md-path',
        file,
        line,
        reference,
        detail: 'backticked path in markdown does not resolve',
      });
    }
  }
}

function scanJsonPaths(file, index, findings) {
  let parsed;
  try {
    parsed = JSON.parse(readText(file));
  } catch {
    return;
  }

  const walk = (node, keyPath, activeKey) => {
    if (typeof node === 'string') {
      if (!activeKey) return;
      const reference = node.trim();
      if (!MD_PATHISH.test(reference)) return;
      if (/[*{}]|\.\.\./.test(reference)) return;
      if (resolveReference(reference, file, index, { allowDirectory: true })) return;
      findings.push({
        kind: 'json-path',
        file,
        line: 0,
        reference,
        detail: `${keyPath} claims a path that does not resolve`,
      });
      return;
    }
    if (Array.isArray(node)) {
      for (const [i, item] of node.entries()) walk(item, `${keyPath}[${i}]`, activeKey);
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (JSON_EXCLUDED_KEYS.has(key)) continue;
        walk(value, `${keyPath}.${key}`, JSON_PATH_KEYS.has(key));
      }
    }
  };

  walk(parsed, path.basename(file), false);
}

function scanScriptNames(file, text, line, knownScripts, findings) {
  for (const match of text.matchAll(SCRIPT_PATTERN)) {
    const reference = match[1];
    if (knownScripts.has(reference)) continue;
    findings.push({
      kind: 'script',
      file,
      line,
      reference,
      detail: 'no package.json declares this script',
    });
  }
}

function scanPackageNames(file, text, line, knownPackages, findings) {
  for (const match of text.matchAll(PACKAGE_PATTERN)) {
    const reference = match[0];
    if (reference.endsWith('-')) continue;
    if (knownPackages.has(reference)) continue;
    findings.push({
      kind: 'package',
      file,
      line,
      reference,
      detail: 'no manifest declares this package name',
    });
  }
}

function loadAllowlist() {
  if (!fs.existsSync(path.join(REPO_ROOT, ALLOWLIST_PATH))) {
    return { schemaVersion: 1, intentional: [], debt: [], knownContradictions: [] };
  }
  return JSON.parse(readText(ALLOWLIST_PATH));
}

export function isIntentional(finding, intentional) {
  return intentional.some((entry) => {
    if (entry.pathPrefix && !finding.file.startsWith(entry.pathPrefix)) return false;
    if (entry.reference && entry.reference !== finding.reference) return false;
    if (Array.isArray(entry.kinds) && !entry.kinds.includes(finding.kind)) return false;
    return Boolean(entry.pathPrefix || entry.reference);
  });
}

export function ratchetBaseline(existing, reproducingKeys, { hasBaseline }) {
  const reproducing = new Set(reproducingKeys);
  if (!hasBaseline) return { debt: [...reproducing].sort(), added: [] };

  const declared = new Set([
    ...(existing.debt ?? []),
    ...(existing.knownContradictions ?? []).map((entry) => entry.key),
  ]);
  return {
    debt: [...new Set(existing.debt ?? [])].filter((key) => reproducing.has(key)).sort(),
    added: [...reproducing].filter((key) => !declared.has(key)).sort(),
  };
}

export function validateAllowlist(allowlist, errors) {
  for (const entry of allowlist.intentional ?? []) {
    if (!entry.reason || entry.reason.length < 20) {
      errors.push(
        `${ALLOWLIST_PATH}: intentional entry ${JSON.stringify(entry.pathPrefix ?? entry.key)} needs a reason of at least 20 characters.`,
      );
    }
  }
  for (const entry of allowlist.knownContradictions ?? []) {
    if (!entry.owner) {
      errors.push(
        `${ALLOWLIST_PATH}: knownContradictions entry ${JSON.stringify(entry.key)} needs an owner.`,
      );
    }
  }
}

export function main() {
  const files = workspaceFiles();
  const index = buildPathIndex(files);
  const { scripts: knownScripts, packages: knownPackages } = collectManifestNames(files);

  const findings = [];

  for (const file of files) {
    if (isExcluded(file)) continue;
    const extension = extensionOf(file);
    const scannable =
      extension === '.md' ||
      extension === '.toml' ||
      ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.rs'].includes(extension);
    if (!scannable) continue;

    let source;
    try {
      source = readText(file);
    } catch {
      continue;
    }

    if (extension === '.md') {
      scanMarkdown(file, source, index, findings);
      for (const { line, text } of markdownProseLines(source)) {
        scanScriptNames(file, text, line, knownScripts, findings);
        scanPackageNames(file, text, line, knownPackages, findings);
      }
      continue;
    }

    scanCodeComments(file, source, index, findings);

    if (TEST_PATH.test(file)) continue;
    const comments = extractComments(source, extension);
    const blockText = blockContext(comments);
    for (const comment of comments) {
      if (PROVENANCE_VERBS.test(blockText.get(comment.line) ?? comment.text)) continue;
      scanScriptNames(file, comment.text, comment.line, knownScripts, findings);
      scanPackageNames(file, comment.text, comment.line, knownPackages, findings);
    }
  }

  for (const file of AGENT_CONTEXT_JSON) {
    if (!fs.existsSync(path.join(REPO_ROOT, file))) continue;
    scanJsonPaths(file, index, findings);
  }

  const ignored = ignoredPaths(
    [...new Set(findings.map((f) => f.reference))].filter(
      (reference) => !reference.startsWith('/') && !reference.includes('..'),
    ),
  );
  const real = findings.filter((f) => !ignored.has(f.reference));

  if (WRITE_BASELINE) {
    const hasBaseline = fs.existsSync(path.join(REPO_ROOT, ALLOWLIST_PATH));
    const existing = loadAllowlist();
    const intentional = existing.intentional ?? [];
    const seedable = real.filter((finding) => !isIntentional(finding, intentional));
    const { debt, added } = ratchetBaseline(existing, seedable.map(findingKey), { hasBaseline });

    if (added.length > 0) {
      console.error(
        `Refusing to widen ${ALLOWLIST_PATH}: ${added.length} reference(s) are not on the baseline, ` +
          'which only ratchets down. Fix each reference, or declare it under intentional or ' +
          `knownContradictions:\n  ${added.slice(0, 20).join('\n  ')}`,
      );
      return 1;
    }

    const dropped = new Set(existing.debt ?? []).size - debt.length;
    const baseline = {
      schemaVersion: 1,
      reason:
        'Pre-existing dangling references captured when the reference-integrity gate was seeded. ' +
        'Entries that stop reproducing fail as stale, so this list only ratchets down.',
      intentional,
      knownContradictions: existing.knownContradictions ?? [],
      debt,
    };
    fs.writeFileSync(
      path.join(REPO_ROOT, ALLOWLIST_PATH),
      `${JSON.stringify(baseline, null, 2)}\n`,
    );
    try {
      execFileSync('node_modules/.bin/prettier', ['--write', ALLOWLIST_PATH], {
        cwd: REPO_ROOT,
        stdio: 'ignore',
      });
    } catch {
      console.warn(`Could not run Prettier on ${ALLOWLIST_PATH}; run it manually.`);
    }
    console.log(
      `${ALLOWLIST_PATH} now carries ${baseline.debt.length} debt entr(ies); dropped ${dropped}.`,
    );
    return 0;
  }

  const allowlist = loadAllowlist();
  const errors = [];
  validateAllowlist(allowlist, errors);

  const intentional = allowlist.intentional ?? [];
  const declared = new Set([
    ...(allowlist.debt ?? []),
    ...(allowlist.knownContradictions ?? []).map((e) => e.key),
  ]);

  const undeclared = [];
  const seen = new Set();
  for (const finding of real) {
    const key = findingKey(finding);
    if (isIntentional(finding, intentional)) continue;
    if (declared.has(key)) {
      seen.add(key);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    undeclared.push(finding);
  }

  const stale = [...declared].filter((key) => !seen.has(key));

  if (AS_JSON) {
    console.log(JSON.stringify({ findings: real, undeclared, stale }, null, 2));
    return 0;
  }

  for (const finding of undeclared) {
    errors.push(
      `${finding.file}:${finding.line} [${finding.kind}] ${finding.detail}: ${finding.reference}`,
    );
  }
  if (stale.length > 0) {
    errors.push(
      `${ALLOWLIST_PATH}: ${stale.length} entr(ies) no longer reproduce and must be removed ` +
        `(the list only ratchets down):\n  ${stale.slice(0, 20).join('\n  ')}`,
    );
  }

  if (errors.length > 0) {
    console.error('Reference integrity check failed:\n');
    for (const error of errors) console.error(`  - ${error}`);
    console.error(
      `\n${undeclared.length} undeclared reference(s). Fix the reference, or declare it in ${ALLOWLIST_PATH}.`,
    );
    return 1;
  }

  console.log(
    `Reference integrity check passed (${real.length} known finding(s) declared, 0 undeclared).`,
  );
  return 0;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntrypoint) process.exit(main());
