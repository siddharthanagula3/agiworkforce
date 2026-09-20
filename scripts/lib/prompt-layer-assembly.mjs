/**
 * Every server path that puts a `system` message into a model request, and
 * whether it resolves the instruction layers or was excused with a reason.
 */

import fs from 'node:fs';
import path from 'node:path';

export const SCAN_ROOTS = ['apps/web', 'packages'];

export const BASELINE_FILE = path.join('scripts', 'lib', 'prompt-layer-assembly-baseline.json');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '__tests__',
  '__mocks__',
  'generated',
  '.next',
  '.turbo',
  'dist',
]);

// A message literal, not a role union in a type: the role is not followed by
// `|`, and the same object literal carries the content that goes with it.
const SYSTEM_MESSAGE = /role:\s*(['"])system\1(?!\s*\|)/gu;

const MESSAGE_CONTENT = /\bcontent\s*:/u;

const LITERAL_WINDOW = 200;

const RESOLVER_IMPORT =
  /from\s+(['"])(?:@\/lib\/prompts\/instruction-precedence|@agiworkforce\/context)\1/u;

const RESOLVER_SYMBOLS = [
  'orderInstructionBlocks',
  'instructionLayerForContextClass',
  'instructionOrderProblems',
  'resolveInstructionConflict',
];

function isTestFile(file) {
  return /\.(?:test|spec)\.tsx?$/u.test(file) || file.endsWith('.d.ts');
}

export function sourceFiles(root, relative = '') {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const next = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) {
      return SKIP_DIRECTORIES.has(entry.name) ? [] : sourceFiles(root, next);
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name)) || isTestFile(entry.name)) return [];
    return [next];
  });
}

/** A file assembles a system message when it names the role on a message literal. */
export function assemblesSystemMessage(source) {
  for (const match of source.matchAll(SYSTEM_MESSAGE)) {
    const start = Math.max(0, match.index - LITERAL_WINDOW);
    const window = source.slice(start, match.index + LITERAL_WINDOW);
    if (MESSAGE_CONTENT.test(window)) return true;
  }
  return false;
}

export function resolvesLayers(source) {
  return RESOLVER_IMPORT.test(source) && RESOLVER_SYMBOLS.some((symbol) => source.includes(symbol));
}

export function assemblySites(repoRoot, roots = SCAN_ROOTS) {
  const sites = [];
  for (const root of roots) {
    for (const file of sourceFiles(path.join(repoRoot, root))) {
      const relative = path.posix.join(root, file.split(path.sep).join('/'));
      const source = fs.readFileSync(path.join(repoRoot, root, file), 'utf8');
      if (!assemblesSystemMessage(source)) continue;
      sites.push({ file: relative, resolved: resolvesLayers(source) });
    }
  }
  return sites.sort((left, right) => left.file.localeCompare(right.file));
}

export function readBaseline(repoRoot) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, BASELINE_FILE), 'utf8'));
}

/**
 * The baseline only ever shrinks: a new unresolved site fails, and a baselined
 * site that now resolves its layers has to leave the file.
 */
export function auditAssembly(sites, baseline) {
  const excused = baseline.unresolved ?? {};
  const problems = [];

  for (const site of sites) {
    if (site.resolved) {
      if (Object.hasOwn(excused, site.file)) {
        problems.push(
          `${site.file} resolves the instruction layers and no longer needs a baseline entry; drop it from ${BASELINE_FILE}`,
        );
      }
      continue;
    }
    if (!Object.hasOwn(excused, site.file)) {
      problems.push(
        `${site.file} assembles a system message without resolving the instruction layers; route it through the precedence resolver, or record why it carries no user layers in ${BASELINE_FILE}`,
      );
      continue;
    }
    if (typeof excused[site.file] !== 'string' || excused[site.file].trim().length === 0) {
      problems.push(`${site.file} is baselined with no reason`);
    }
  }

  const scanned = new Set(sites.map((site) => site.file));
  for (const file of Object.keys(excused)) {
    if (!scanned.has(file)) {
      problems.push(`${file} is baselined but assembles no system message; drop it`);
    }
  }

  return {
    passed: problems.length === 0,
    problems,
    resolved: sites.filter((site) => site.resolved).length,
    total: sites.length,
  };
}
