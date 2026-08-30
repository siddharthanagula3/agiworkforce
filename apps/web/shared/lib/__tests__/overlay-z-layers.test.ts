import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');
const WEB_CSS = 'apps/web/app/globals.css';
const DESKTOP_CSS = 'apps/desktop/src/styles/globals.css';
const CONSUMER_ROOTS = ['apps/web', 'packages/ui/ui/src'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'out', '__tests__']);

const LAYER_DECLARATION = /^[^\S\n]*--z-([a-z-]+)\s*:\s*(\d+)\s*;/gm;
const LAYER_REFERENCE = /var\(\s*--z-([a-z-]+)\s*(?:,\s*(\d+)\s*)?\)/g;

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
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
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
      readFileSync(join(REPO_ROOT, file), 'utf8')
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

const web = declaredLayers(WEB_CSS);
const desktop = declaredLayers(DESKTOP_CSS);
const references = layerReferences();

describe('overlay stacking contract', () => {
  it('keeps the z-index scale out of TypeScript, so CSS stays its only owner', () => {
    const declarations = sourceFiles('apps/web')
      .concat(sourceFiles('packages/ui/ui/src'))
      .filter((file) => /\bzIndex\s*:/.test(readFileSync(join(REPO_ROOT, file), 'utf8')))
      .filter(
        (file) =>
          !/zIndex\s*:\s*['"`]?var\(\s*--z-/.test(readFileSync(join(REPO_ROOT, file), 'utf8')),
      );
    expect(declarations, 'z-index values must come from a --z-* custom property').toEqual([]);
  });

  it('declares every layer web renders and nothing speculative', () => {
    expect(web.size).toBeGreaterThan(0);
    const referenced = new Set(references.map((reference) => reference.layer));
    for (const layer of web.keys()) {
      expect(referenced, `--z-${layer} is declared in ${WEB_CSS} but nothing renders it`).toContain(
        layer,
      );
    }
  });

  it('matches every inline fallback to the declared layer', () => {
    for (const reference of references) {
      if (reference.fallback === null) continue;
      for (const [css, layers] of [
        [WEB_CSS, web],
        [DESKTOP_CSS, desktop],
      ] as const) {
        const declared = layers.get(reference.layer);
        if (declared === undefined) continue;
        expect(
          reference.fallback,
          `${reference.file}:${reference.line} falls back to ${reference.fallback} for --z-${reference.layer}, but ${css} declares ${declared}. The two must agree or the layer moves when the stylesheet loads.`,
        ).toBe(declared);
      }
    }
  });

  it('keeps popover and tooltip above modal', () => {
    const modal = web.get('modal');
    const popover = web.get('popover');
    const tooltip = web.get('tooltip');
    expect([modal, popover, tooltip]).not.toContain(undefined);
    // A Select or Tooltip opened from inside a Dialog is a sibling of it under
    // <body>, so it disappears behind the dialog unless it outranks --z-modal.
    expect(popover as number).toBeGreaterThan(modal as number);
    expect(tooltip as number).toBeGreaterThan(popover as number);
  });

  it('agrees with the desktop scale on every shared layer', () => {
    for (const [layer, value] of web) {
      const other = desktop.get(layer);
      if (other === undefined) continue;
      expect(
        other,
        `--z-${layer} is ${value} in ${WEB_CSS} but ${other} in ${DESKTOP_CSS}; the shared primitives ship one fallback for both.`,
      ).toBe(value);
    }
  });
});
