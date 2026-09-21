#!/usr/bin/env node

// Motion answers two preferences: the operating system's and the Motion
// control in settings. Both are answered once, for every element, so a new
// animation cannot escape them by forgetting a variant. This enumerates the
// stylesheets rather than a list of animations.

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  blockBody,
  compareToBaseline,
  lineOf,
  loadBaseline,
  read,
  reportBaseline,
  sourceFiles,
  stylesheets,
  writeBaseline,
} from './lib/ui-systems.mjs';

export const BASELINE_PATH = 'scripts/config/ui-motion-baseline.json';
export const GLOBALS_PATH = 'apps/web/app/globals.css';

/** A reduced-motion answer has to reach all four or it leaves motion behind. */
export const BLANKET_PROPERTIES = [
  'animation-duration',
  'animation-iteration-count',
  'transition-duration',
  'scroll-behavior',
];

export const UNIVERSAL_SELECTORS = ['*', '*::before', '*::after'];

const MEDIA_RE = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/g;
const IN_APP_RE = /:root\[data-motion=['"]reduced['"]\]/;
const KEYFRAMES_RE = /@keyframes\s+([A-Za-z0-9_-]+)/g;
const IMPORTANT_MOTION_RE =
  /\b(animation(?:-[a-z]+)?|transition(?:-[a-z]+)?)\s*:\s*[^;{}]*!important/g;

function splitDeclarations(body) {
  let depth = 0;
  let flat = '';
  for (const ch of body) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (depth === 0) flat += ch;
  }
  return flat;
}

/** Selector/body pairs declared directly inside `body`, nested blocks skipped. */
export function topLevelRules(body) {
  const rules = [];
  let depth = 0;
  let selectorStart = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '{') {
      if (depth === 0) {
        const selector = body.slice(selectorStart, i).trim();
        const inner = blockBody(body, i);
        rules.push({ selector, body: inner });
        i += inner.length + 1;
        selectorStart = i + 1;
        continue;
      }
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      selectorStart = i + 1;
    } else if (ch === ';' && depth === 0) {
      selectorStart = i + 1;
    }
  }
  return rules;
}

function universalRules(rules) {
  return rules.filter((rule) => {
    const parts = rule.selector.split(',').map((part) => part.trim());
    return parts.some((part) => UNIVERSAL_SELECTORS.includes(part.replace(/^.*\s/, '')));
  });
}

function importantProperties(rules) {
  const properties = new Set();
  for (const rule of rules) {
    for (const match of splitDeclarations(rule.body).matchAll(/([a-z-]+)\s*:\s*[^;]*!important/g)) {
      properties.add(match[1]);
    }
  }
  return properties;
}

export function blanketCoverage(globalsCss) {
  const osRules = [];
  MEDIA_RE.lastIndex = 0;
  let match;
  while ((match = MEDIA_RE.exec(globalsCss)) !== null) {
    const open = MEDIA_RE.lastIndex - 1;
    osRules.push(...universalRules(topLevelRules(blockBody(globalsCss, open))));
  }

  const inAppRules = topLevelRules(globalsCss).filter(
    (rule) =>
      IN_APP_RE.test(rule.selector) &&
      rule.selector
        .split(',')
        .some((part) => UNIVERSAL_SELECTORS.includes(part.trim().replace(/^.*\s/, ''))),
  );

  return {
    os: importantProperties(osRules),
    inApp: importantProperties(inAppRules),
  };
}

/** Character ranges of every rule that is itself a reduced-motion answer. */
function reducedMotionRanges(source) {
  const ranges = [];
  MEDIA_RE.lastIndex = 0;
  let match;
  while ((match = MEDIA_RE.exec(source)) !== null) {
    const open = MEDIA_RE.lastIndex - 1;
    ranges.push([open, open + blockBody(source, open).length]);
  }
  for (const m of source.matchAll(/:root\[data-motion=['"]reduced['"]\][^{]*\{/g)) {
    const open = m.index + m[0].length - 1;
    ranges.push([open, open + blockBody(source, open).length]);
  }
  return ranges;
}

export function findOverridingDeclarations(repoRoot, sheets) {
  const found = [];
  for (const file of sheets) {
    const source = read(repoRoot, file);
    const answers = reducedMotionRanges(source);
    IMPORTANT_MOTION_RE.lastIndex = 0;
    let match;
    while ((match = IMPORTANT_MOTION_RE.exec(source)) !== null) {
      if (answers.some(([start, end]) => match.index > start && match.index < end)) continue;
      found.push({
        key: `${file}:${lineOf(source, match.index)}:${match[1]}`,
        advice:
          'an !important motion declaration outranks the blanket reduced-motion rules, so this element keeps moving for a viewer who asked it not to',
      });
    }
  }
  return found;
}

export function findUnreferencedKeyframes(repoRoot, sheets, sources) {
  const declared = new Map();
  for (const file of sheets) {
    const source = read(repoRoot, file);
    KEYFRAMES_RE.lastIndex = 0;
    let match;
    while ((match = KEYFRAMES_RE.exec(source)) !== null) {
      if (!declared.has(match[1])) declared.set(match[1], `${file}:${lineOf(source, match.index)}`);
    }
  }

  const referenced = new Set();
  const note = (name) => referenced.add(name.replace(/^['"`]|['"`]$/g, ''));
  for (const file of [...sheets, ...sources]) {
    const source = read(repoRoot, file);
    for (const m of source.matchAll(/animation(?:-name)?\s*:\s*([^;{}]+)/g)) {
      for (const token of m[1].split(/[\s,]+/)) note(token.trim());
    }
    for (const m of source.matchAll(/\banimate-([A-Za-z0-9_-]+)/g)) note(m[1]);
  }

  return [...declared.entries()]
    .filter(([name]) => !referenced.has(name))
    .map(([name, where]) => ({
      key: `${where}:${name}`,
      advice: 'a keyframe nothing plays is dead motion, delete it',
    }));
}

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function checkUiMotion(repoRoot) {
  const sheets = stylesheets(repoRoot);
  const sources = sourceFiles(repoRoot, ['apps/web', 'packages/ui']);
  const coverage = blanketCoverage(read(repoRoot, GLOBALS_PATH));

  const failures = [];
  for (const property of BLANKET_PROPERTIES) {
    if (!coverage.os.has(property)) {
      failures.push(
        `${GLOBALS_PATH}: the prefers-reduced-motion blanket rule does not set ${property} !important on *, *::before and *::after`,
      );
    }
    if (!coverage.inApp.has(property)) {
      failures.push(
        `${GLOBALS_PATH}: the [data-motion='reduced'] blanket rule does not set ${property} !important on *, *::before and *::after`,
      );
    }
  }

  return {
    sheets,
    failures,
    found: [
      ...findOverridingDeclarations(repoRoot, sheets),
      ...findUnreferencedKeyframes(repoRoot, sheets, sources),
    ],
  };
}

function main() {
  const repoRoot = REPO_ROOT;
  const { sheets, failures, found } = checkUiMotion(repoRoot);

  if (process.argv.includes('--write-baseline')) {
    writeBaseline(
      repoRoot,
      BASELINE_PATH,
      { generator: 'scripts/check-ui-motion.mjs' },
      found.map((item) => ({ key: item.key, reason: '' })),
    );
    console.log(`wrote ${found.length} entries to ${BASELINE_PATH}`);
    return;
  }

  const baseline = loadBaseline(repoRoot, BASELINE_PATH);
  const clean = reportBaseline('check-ui-motion', compareToBaseline(found, baseline));

  for (const failure of failures) console.error(`check-ui-motion: ${failure}`);
  if (!clean || failures.length > 0) process.exit(1);

  console.log(
    `check-ui-motion: ${sheets.length} stylesheets, both blanket reduced-motion rules complete, ${found.length} baselined`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
