import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');
const FOUNDATION_CSS = 'packages/ui/design-tokens/src/foundation.css';
const CONSUMER_ROOTS = ['apps/web', 'packages/ui/ui/src', 'packages/ui/unified-chat/src'];
const OWNERSHIP_ROOTS = ['apps/web', 'apps/desktop/src', 'packages/ui'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'out', '__tests__']);

const LAYER_DECLARATION = /^[^\S\n]*--z-([a-z-]+)\s*:\s*(-?\d+)\s*;/gm;
const HAS_LAYER_DECLARATION = /^[^\S\n]*--z-[a-z-]+\s*:\s*-?\d+\s*;/m;
const LAYER_REFERENCE = /var\(\s*--z-([a-z-]+)\s*(?:,\s*(\d+)\s*)?\)/g;
const RAW_LAYER = /(?<![\w-])-?z-(?:\d+|\[(?!var\()[^\]]+\])/g;
const RAW_STYLE_LAYER = /\bzIndex\s*:\s*['"`]?-?\d+|z-index\s*:\s*-?\d+/g;

function declaredLayers(relPath: string): Map<string, number> {
  const css = readFileSync(join(REPO_ROOT, relPath), 'utf8');
  const layers = new Map<string, number>();
  for (const match of css.matchAll(LAYER_DECLARATION)) {
    layers.set(match[1] as string, Number(match[2]));
  }
  return layers;
}

function sourceFiles(relDir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO_ROOT, relDir), { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) sourceFiles(rel, out);
    } else if (/\.(?:tsx?|css)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

type Reference = { file: string; line: number; layer: string; fallback: number | null };

function layerReferences(): Reference[] {
  const found: Reference[] = [];
  for (const root of CONSUMER_ROOTS) {
    for (const file of sourceFiles(root)) {
      stripComments(readFileSync(join(REPO_ROOT, file), 'utf8'))
        .split('\n')
        .forEach((line, index) => {
          for (const match of line.matchAll(LAYER_REFERENCE)) {
            found.push({
              file,
              line: index + 1,
              layer: match[1] as string,
              fallback: match[2] === undefined ? null : Number(match[2]),
            });
          }
        });
    }
  }
  return found;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (match, lead: string) => lead + ' '.repeat(match.length - lead.length),
    );
}

const layers = declaredLayers(FOUNDATION_CSS);
const references = layerReferences();

describe('overlay stacking contract', () => {
  it('has one canonical owner for every z-index rung', () => {
    const owners = OWNERSHIP_ROOTS.flatMap((root) => sourceFiles(root))
      .filter((file) => file.endsWith('.css'))
      .filter((file) => HAS_LAYER_DECLARATION.test(readFileSync(join(REPO_ROOT, file), 'utf8')));
    expect(owners).toEqual([FOUNDATION_CSS]);
  });

  it('rejects numeric Tailwind, arbitrary and CSS rungs in production source', () => {
    const violations: string[] = [];
    for (const root of CONSUMER_ROOTS) {
      for (const file of sourceFiles(root)) {
        stripComments(readFileSync(join(REPO_ROOT, file), 'utf8'))
          .split('\n')
          .forEach((line, index) => {
            for (const match of line.matchAll(RAW_LAYER)) {
              violations.push(`${file}:${index + 1} ${match[0]}`);
            }
            for (const match of line.matchAll(RAW_STYLE_LAYER)) {
              violations.push(`${file}:${index + 1} ${match[0]}`);
            }
          });
      }
    }
    expect(violations, 'stacking must consume a named --z-* rung from foundation.css').toEqual([]);
  });

  it('declares every referenced layer and uses no numeric fallback', () => {
    for (const reference of references) {
      expect(
        layers.has(reference.layer),
        `${reference.file}:${reference.line} reads --z-${reference.layer}, which ${FOUNDATION_CSS} does not declare`,
      ).toBe(true);
      expect(
        reference.fallback,
        `${reference.file}:${reference.line} carries a numeric fallback instead of failing closed on the canonical stylesheet`,
      ).toBeNull();
    }
  });

  it('keeps popover and tooltip above modal', () => {
    const modal = layers.get('modal');
    const popover = layers.get('popover');
    const tooltip = layers.get('tooltip');
    expect([modal, popover, tooltip]).not.toContain(undefined);
    // A Select or Tooltip opened from inside a Dialog is a sibling of it under
    // <body>, so it disappears behind the dialog unless it outranks --z-modal.
    expect(popover as number).toBeGreaterThan(modal as number);
    expect(tooltip as number).toBeGreaterThan(popover as number);
  });

  it('keeps every named rung in one monotonic ladder', () => {
    const ordered = [
      'behind-far',
      'behind',
      'base',
      'content',
      'content-raised',
      'control',
      'content-sticky',
      'panel-backdrop',
      'panel',
      'panel-raised',
      'dropdown',
      'navigation',
      'navigation-sticky',
      'sticky',
      'overlay',
      'overlay-panel',
      'modal',
      'popover',
      'tooltip',
      'notification',
      'fullscreen',
      'skip-link',
    ].map((layer) => layers.get(layer));
    expect(ordered).not.toContain(undefined);
    expect(ordered).toEqual([...ordered].sort((a, b) => (a as number) - (b as number)));
  });
});
