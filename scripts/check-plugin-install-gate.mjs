#!/usr/bin/env node
/**
 * Every path that admits a plugin version onto an installation clears the
 * package gate first.
 *
 * The write sites are enumerated from the source, not listed here: any
 * statement that inserts an installation row or sets `installed_version` on one
 * is a path by which a member ends up running a package. The enclosing function
 * has to name one of the gate calls, which are the only places a signature is
 * verified and a recorded scan verdict is read.
 *
 * This exists because the first install refused an unsigned or unscanned
 * package while the update path moved the same installation onto one, so the
 * whole gate was reachable around.
 *
 * The baseline records the paths that are open today, each with a reason and
 * the file that has to change. It may shrink and never grow.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const SCAN_ROOTS = ['apps/web/lib/services', 'apps/web/features/plugins/server'];
export const BASELINE_FILE = 'scripts/config/plugin-install-gate-baseline.json';

export const GATE_CALLS = ['assertPluginPackageInstallable', 'assertMarketplaceEntryInstallable'];

const INSTALLATION_TABLES = ['plugin_installations', 'plugin_marketplace_installations'];

const ADMITTING_WRITE = new RegExp(
  `(?:insert\\s+into\\s+public\\.(?:${INSTALLATION_TABLES.join('|')})\\b[^\`]*?installed_version` +
    `|set\\s+installed_version\\s*=)`,
  'is',
);

function isScannable(name) {
  return /\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name);
}

export function walk(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...walk(full));
      continue;
    }
    if (isScannable(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Split a module into its top-level functions. Brace counting rather than a
 * line window, so a long SQL literal in the middle of a function still belongs
 * to that function.
 */
/**
 * The opening brace of the body, past the parameter list and any return type.
 * Taking the first brace instead lands inside an inline parameter type, which
 * is how a whole function's SQL went unseen.
 */
function bodyStart(source, from) {
  const paramStart = source.indexOf('(', from);
  if (paramStart < 0) return -1;
  let parens = 0;
  let index = paramStart;
  for (; index < source.length; index += 1) {
    if (source[index] === '(') parens += 1;
    else if (source[index] === ')') {
      parens -= 1;
      if (parens === 0) break;
    }
  }
  let generics = 0;
  for (index += 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === '<') generics += 1;
    else if (character === '>') generics -= 1;
    else if (character === '{' && generics <= 0) return index;
  }
  return -1;
}

export function topLevelFunctions(source) {
  const found = [];
  const declaration = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm;
  let match;
  while ((match = declaration.exec(source)) !== null) {
    const open = bodyStart(source, match.index);
    if (open < 0) continue;
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    found.push({ name: match[1], body: source.slice(open, end + 1) });
  }
  return found;
}

const REFUSAL = 'throw new PluginPackageRefusedError';

function calls(body, name) {
  return new RegExp(`\\b${name}\\s*\\(`).test(body);
}

/** Names a gate itself, or delegates to one in its own module. */
function refuses(fn, functions, seen = new Set()) {
  if (seen.has(fn.name)) return false;
  seen.add(fn.name);
  if (GATE_CALLS.some((call) => fn.body.includes(call)) || fn.body.includes(REFUSAL)) return true;
  return functions.some(
    (other) =>
      other.name !== fn.name && calls(fn.body, other.name) && refuses(other, functions, seen),
  );
}

/**
 * A private helper is gated when every function in its own module that reaches
 * it refuses first, because the helper is reachable no other way. A helper
 * nothing calls is not gated by anybody.
 */
export function gatedBy(fn, functions) {
  if (refuses(fn, functions)) return true;
  const callers = functions.filter((other) => other.name !== fn.name && calls(other.body, fn.name));
  if (callers.length === 0) return false;
  return callers.every((caller) => refuses(caller, functions));
}

export function ungatedWrites(scanRoot) {
  const open = [];
  let writes = 0;
  for (const root of SCAN_ROOTS) {
    for (const file of walk(path.join(scanRoot, root))) {
      const source = fs.readFileSync(file, 'utf8');
      if (!ADMITTING_WRITE.test(source)) continue;
      const relative = path.relative(scanRoot, file);
      const functions = topLevelFunctions(source);
      for (const fn of functions) {
        if (!ADMITTING_WRITE.test(fn.body)) continue;
        writes += 1;
        if (gatedBy(fn, functions)) continue;
        open.push(`${relative}#${fn.name}`);
      }
    }
  }
  return { writes, open: open.sort() };
}

export function compareToBaseline(open, baseline) {
  const recorded = new Map(Object.entries(baseline.ungated ?? {}));
  return {
    missingReason: [...recorded.entries()]
      .filter(([, entry]) => !entry?.reason || !entry?.gateIn)
      .map(([key]) => key),
    grown: open.filter((key) => !recorded.has(key)),
    fixed: [...recorded.keys()].filter((key) => !open.includes(key)),
  };
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rootIndex = process.argv.indexOf('--root');
  const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

  const { writes, open } = ungatedWrites(scanRoot);
  if (writes === 0) {
    console.error(
      'check-plugin-install-gate: no installation write was found, which cannot be right.',
    );
    process.exit(1);
  }

  const baselinePath = path.join(scanRoot, BASELINE_FILE);
  const baseline = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : { ungated: {} };
  const { missingReason, grown, fixed } = compareToBaseline(open, baseline);

  if (missingReason.length > 0) {
    console.error('Every baselined path needs a reason and the file that gates it:');
    for (const key of missingReason) console.error(`  ${key}`);
    process.exit(1);
  }
  if (grown.length > 0) {
    console.error(`${grown.length} path(s) admit a plugin version with no package gate:`);
    for (const key of grown) console.error(`  ${key}`);
    console.error(`Call one of ${GATE_CALLS.join(' or ')}, or record it in the baseline.`);
    process.exit(1);
  }
  if (fixed.length > 0) {
    console.error(
      `${fixed.length} baselined path(s) are now gated. Remove them from the baseline:`,
    );
    for (const key of fixed) console.error(`  ${key}`);
    process.exit(1);
  }

  console.log(
    `check-plugin-install-gate: ${writes} installation write(s), ` +
      `${writes - open.length} gated, ${open.length} baselined.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
