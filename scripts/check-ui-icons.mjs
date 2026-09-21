#!/usr/bin/env node

// Icons come from one place, a control drawn only as an icon says what it does,
// an icon drawn beside its own label is hidden from a screen reader, and no
// emoji stands in for one. The icon vocabulary is read from the imports rather
// than from a list of icons someone wrote down.

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compareToBaseline,
  lineOf,
  loadBaseline,
  read,
  reportBaseline,
  sourceFiles,
  writeBaseline,
} from './lib/ui-systems.mjs';

export const BASELINE_PATH = 'scripts/config/ui-icons-baseline.json';

/** Modules the shell is allowed to draw an icon from. */
export const ICON_SOURCES = ['lucide-react', '@agiworkforce/icons'];

const IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
const ICON_SOURCE_RE =
  /(?:^|[/@-])(?:lucide|heroicons|react-icons|phosphor|tabler|feather)(?:[/-]|$)/i;
const CONTROL_RE = /<(button|Button|LoadingButton)\b([\s\S]*?)(\/>|>)/g;
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}\u{1F100}-\u{1F1FF}]/gu;

export function iconImports(source) {
  const icons = new Map();
  IMPORT_RE.lastIndex = 0;
  let match;
  while ((match = IMPORT_RE.exec(source)) !== null) {
    const module = match[2];
    if (!ICON_SOURCES.includes(module)) continue;
    for (const specifier of match[1].split(',')) {
      const name = specifier
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (/^[A-Z]/.test(name ?? '')) icons.set(name, module);
    }
  }
  return icons;
}

export function findForeignIconSources(repoRoot, files) {
  const found = [];
  for (const file of files) {
    const source = read(repoRoot, file);
    IMPORT_RE.lastIndex = 0;
    let match;
    while ((match = IMPORT_RE.exec(source)) !== null) {
      const module = match[2];
      if (ICON_SOURCES.includes(module) || !ICON_SOURCE_RE.test(module)) continue;
      found.push({
        key: `${file}:${lineOf(source, match.index)}:${module}`,
        advice: `a second icon vocabulary drifts from the first; draw from ${ICON_SOURCES.join(' or ')}`,
      });
    }
  }
  return found;
}

/** The body of the element opened at `openIndex`, or '' when self-closing. */
function elementBody(source, tag, openIndex) {
  const open = new RegExp(`<${tag}\\b`, 'g');
  const close = new RegExp(`</${tag}>`, 'g');
  close.lastIndex = openIndex;
  const end = close.exec(source);
  if (!end) return '';
  open.lastIndex = openIndex + 1;
  let depth = 1;
  let cursor = openIndex + 1;
  while (cursor < end.index) {
    open.lastIndex = cursor;
    const next = open.exec(source);
    if (!next || next.index > end.index) break;
    depth += 1;
    cursor = next.index + 1;
    close.lastIndex = end.index + 1;
    const following = close.exec(source);
    if (!following) break;
    end.index = following.index;
  }
  return depth >= 1 ? source.slice(openIndex, end.index) : '';
}

export function findUnnamedIconControls(repoRoot, files) {
  const found = [];
  for (const file of files) {
    if (!file.endsWith('.tsx')) continue;
    const source = read(repoRoot, file);
    const icons = iconImports(source);
    if (icons.size === 0) continue;

    CONTROL_RE.lastIndex = 0;
    let match;
    while ((match = CONTROL_RE.exec(source)) !== null) {
      const [whole, tag, attributes, terminator] = match;
      const body =
        terminator === '/>' ? '' : elementBody(source, tag, match.index + whole.length - 1);
      if (/aria-label(?:ledby)?[=\s]|title=|sr-only|aria-hidden/.test(attributes)) continue;

      const rendered = [...body.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((m) => m[1]);
      if (!rendered.some((name) => icons.has(name))) continue;

      // Anything that is not an icon element could carry the name: an
      // interpolation, a nested control, or literal text between the tags.
      const withoutElements = body.replace(/<[^>]*>/g, ' ');
      const hasOtherContent =
        /[{}]/.test(withoutElements) ||
        /[A-Za-z0-9]/.test(withoutElements) ||
        rendered.some((name) => !icons.has(name));
      if (hasOtherContent) continue;

      found.push({
        key: `${file}:${lineOf(source, match.index)}:${tag}`,
        advice:
          'a control drawn only as an icon has no accessible name; add aria-label, or a visually hidden label',
      });
    }
  }
  return found;
}

export function findEmojiIcons(repoRoot, files) {
  const found = [];
  for (const file of files) {
    if (!file.endsWith('.tsx')) continue;
    const source = read(repoRoot, file);
    const lines = source.split('\n');
    for (const [index, text] of lines.entries()) {
      if (/^\s*(?:\/\/|\*|\/\*)/.test(text)) continue;
      EMOJI_RE.lastIndex = 0;
      const emoji = EMOJI_RE.exec(text);
      if (!emoji) continue;
      // A glyph its own element hides from assistive technology, beside a real
      // label, is decoration rather than an icon standing in for a name.
      if (lines.slice(Math.max(0, index - 3), index + 1).some((near) => /aria-hidden/.test(near))) {
        continue;
      }
      found.push({
        key: `${file}:${index + 1}:${emoji[0]}`,
        advice:
          'an emoji renders differently on every platform and carries no accessible name; use an icon from the icon set',
      });
    }
  }
  return found;
}

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function checkUiIcons(repoRoot) {
  const files = sourceFiles(repoRoot);
  return {
    files,
    found: [
      ...findForeignIconSources(repoRoot, files),
      ...findUnnamedIconControls(repoRoot, files),
      ...findEmojiIcons(repoRoot, files),
    ],
  };
}

function main() {
  const repoRoot = REPO_ROOT;
  const { files, found } = checkUiIcons(repoRoot);

  if (process.argv.includes('--write-baseline')) {
    writeBaseline(
      repoRoot,
      BASELINE_PATH,
      { generator: 'scripts/check-ui-icons.mjs', sources: ICON_SOURCES },
      found.map((item) => ({ key: item.key, reason: '' })),
    );
    console.log(`wrote ${found.length} entries to ${BASELINE_PATH}`);
    return;
  }

  const baseline = loadBaseline(repoRoot, BASELINE_PATH);
  if (!reportBaseline('check-ui-icons', compareToBaseline(found, baseline))) process.exit(1);
  console.log(
    `check-ui-icons: ${files.length} files drawing from ${ICON_SOURCES.join(' and ')}, ${found.length} baselined`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
