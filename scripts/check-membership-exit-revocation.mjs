#!/usr/bin/env node
/**
 * A membership that ends takes the credentials it authorized with it, on every
 * path that ends one. check-membership-revocation proves the offboarding
 * service revokes each credential class; this proves every statement that
 * deletes a membership reaches that service, in the function that deletes it
 * or in every function that calls that one.
 *
 * Sites are enumerated from the source: every production module under
 * apps/web that deletes from organization_members. A site that nothing
 * revokes after fails, and the baseline of known ones may only shrink.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { stripComments } from './lib/module-graph.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SCAN_ROOT = 'apps/web';
export const BASELINE_FILE = 'scripts/config/membership-exit-revocation-baseline.json';

const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__', '__mocks__', 'e2e', 'dist']);
const SOURCE = /\.tsx?$/;
const NOT_PRODUCTION = /\.(?:test|spec)\.tsx?$|\.d\.ts$/;
const MEMBERSHIP_DELETE = /delete\s+from\s+(?:public\.)?organization_members\b/gi;
export const REVOKERS = /\b(?:deprovisionMember|revokeCredentialsAfterScimRemoval)\s*\(/;
const FUNCTION_DECLARATION = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*[(<]/g;
const CONST_DECLARATION = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/g;
const SHORTEST_REASON = 40;

function productionFiles(scanRoot) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SOURCE.test(entry.name) && !NOT_PRODUCTION.test(entry.name)) out.push(full);
    }
  };
  walk(path.join(scanRoot, SCAN_ROOT));
  return out.sort();
}

function bodyOpen(source, start) {
  let parens = 0;
  let angles = 0;
  let seenParams = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') {
      parens++;
      seenParams = true;
    } else if (ch === ')') parens--;
    else if (parens === 0 && seenParams) {
      if (ch === '<') angles++;
      else if (ch === '>') angles = Math.max(0, angles - 1);
      else if (ch === '{' && angles === 0) return i;
      else if (ch === ';' && angles === 0) return -1;
    }
  }
  return -1;
}

function blockEnd(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return i + 1;
  }
  return source.length;
}

/** Every named function in a module, with the span of its body. */
export function functionSpans(source) {
  const spans = [];
  for (const match of source.matchAll(FUNCTION_DECLARATION)) {
    const open = bodyOpen(source, match.index);
    if (open < 0) continue;
    spans.push({ name: match[1], start: open, end: blockEnd(source, open) });
  }
  return spans;
}

function enclosingFunction(spans, offset) {
  let best = null;
  for (const span of spans) {
    if (span.start <= offset && offset < span.end) {
      if (!best || span.end - span.start < best.end - best.start) best = span;
    }
  }
  return best;
}

function enclosingConstant(source, offset) {
  let found = null;
  for (const match of source.matchAll(CONST_DECLARATION)) {
    if (match.index > offset) break;
    found = match[1];
  }
  return found;
}

function referencing(spans, source, name) {
  const pattern = new RegExp(`\\b${name}\\b`);
  return spans.filter((span) => pattern.test(source.slice(span.start, span.end)));
}

function resolvesTo(specifier, fromFile, targetFile) {
  const base = specifier.startsWith('@/')
    ? path.posix.join(SCAN_ROOT, specifier.slice(2))
    : specifier.startsWith('.')
      ? path.posix.join(path.posix.dirname(fromFile), specifier)
      : null;
  if (!base) return false;
  return ['.ts', '.tsx', '/index.ts', '/index.tsx'].some((ext) => `${base}${ext}` === targetFile);
}

function importsFrom(module, name, targetFile) {
  if (module.file === targetFile) return true;
  for (const match of module.source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const names = match[1].split(',').map((entry) => entry.replace(/\s+as\s+.*/, '').trim());
    if (names.includes(name) && resolvesTo(match[2], module.file, targetFile)) return true;
  }
  const dynamic = new RegExp(
    `\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=\\s*await\\s+import\\('([^']+)'\\)`,
    'g',
  );
  for (const match of module.source.matchAll(dynamic)) {
    if (resolvesTo(match[1], module.file, targetFile)) return true;
  }
  return false;
}

function callersOf(name, siteFile, modules) {
  const call = new RegExp(`\\b${name}\\s*\\(`, 'g');
  const callers = [];
  for (const module of modules) {
    if (!importsFrom(module, name, siteFile)) continue;
    for (const match of module.source.matchAll(call)) {
      const caller = enclosingFunction(module.spans, match.index);
      if (!caller || caller.name === name) continue;
      callers.push({ file: module.file, span: caller, source: module.source });
    }
  }
  return callers;
}

function revokes(source, span) {
  return REVOKERS.test(source.slice(span.start, span.end));
}

/**
 * Each function that deletes a membership, and whether the credentials that
 * membership authorized are revoked after it.
 */
export function membershipExitSites(scanRoot = REPO_ROOT) {
  const modules = productionFiles(scanRoot).map((file) => {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    return {
      file: path.relative(scanRoot, file).split(path.sep).join('/'),
      source,
      spans: functionSpans(source),
    };
  });

  const sites = new Map();
  for (const module of modules) {
    for (const match of module.source.matchAll(MEMBERSHIP_DELETE)) {
      const owner = enclosingFunction(module.spans, match.index);
      const owners = owner
        ? [owner]
        : referencing(
            module.spans,
            module.source,
            enclosingConstant(module.source, match.index) ?? '\\0',
          );
      if (owners.length === 0) {
        sites.set(`${module.file}::<module>`, {
          unrevokedCallers: ['nothing uses this statement'],
        });
      }
      for (const span of owners) {
        const key = `${module.file}::${span.name}`;
        if (sites.has(key)) continue;
        if (revokes(module.source, span)) {
          sites.set(key, { unrevokedCallers: [] });
          continue;
        }
        const callers = callersOf(span.name, module.file, modules);
        const unrevokedCallers =
          callers.length === 0
            ? ['no caller revokes, because nothing calls it']
            : callers
                .filter((caller) => !revokes(caller.source, caller.span))
                .map((caller) => `${caller.file}::${caller.span.name}`);
        sites.set(key, { unrevokedCallers: [...new Set(unrevokedCallers)].sort() });
      }
    }
  }
  return sites;
}

export const ENTRY_KINDS = ['defect', 'cannot-end'];

// An unrevoked path is a defect naming where the revocation belongs, or a caller
// that only reaches the granting branch, with the reason it cannot reach the delete.
export function unrevokedPaths(sites) {
  const paths = [];
  for (const [site, entry] of sites) {
    for (const caller of entry.unrevokedCallers) paths.push(`${site} <- ${caller}`);
  }
  return paths.sort();
}

export function checkMembershipExitRevocation(scanRoot = REPO_ROOT) {
  const failures = [];
  const sites = membershipExitSites(scanRoot);
  const baselinePath = path.join(scanRoot, BASELINE_FILE);
  const baseline = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : { unrevoked: {} };
  const accepted = baseline.unrevoked ?? {};
  const paths = unrevokedPaths(sites);

  if (sites.size === 0) {
    failures.push(`${SCAN_ROOT}: no statement deletes a membership, so this sweep proves nothing.`);
  }

  for (const [key, entry] of Object.entries(accepted)) {
    if (!ENTRY_KINDS.includes(entry?.kind)) {
      failures.push(`${BASELINE_FILE}: ${key} must say whether it is a defect or cannot-end.`);
    }
    if (typeof entry?.reason !== 'string' || entry.reason.trim().length < SHORTEST_REASON) {
      failures.push(
        `${BASELINE_FILE}: ${key} needs a reason of at least ${SHORTEST_REASON} characters.`,
      );
    }
    if (entry?.kind === 'defect' && (typeof entry?.fixIn !== 'string' || !entry.fixIn.trim())) {
      failures.push(`${BASELINE_FILE}: ${key} must name the file where the revocation belongs.`);
    }
    if (!paths.includes(key)) {
      failures.push(
        `${BASELINE_FILE}: ${key} now revokes or is gone; remove it, the list only shrinks.`,
      );
    }
  }

  for (const unrevoked of paths) {
    if (unrevoked in accepted) continue;
    failures.push(
      `${unrevoked}: a membership is deleted and nothing on this path revokes the credentials ` +
        'it authorized. Call deprovisionMember after the delete.',
    );
  }

  const revoked = [...sites.values()].filter((site) => site.unrevokedCallers.length === 0).length;
  return {
    failures,
    report: { sites: sites.size, revoked, baselined: Object.keys(accepted).length },
  };
}

function main() {
  const rootIndex = process.argv.indexOf('--root');
  const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : REPO_ROOT;
  const { failures, report } = checkMembershipExitRevocation(scanRoot);
  if (failures.length > 0) {
    console.error('check-membership-exit-revocation: FAIL');
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(
    `check-membership-exit-revocation: OK (${report.sites} membership exit(s), ` +
      `${report.revoked} revoking, ${report.baselined} baselined)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) main();
