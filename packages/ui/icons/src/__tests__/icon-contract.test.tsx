import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as account from '../glyphs/account';
import * as actions from '../glyphs/actions';
import * as composer from '../glyphs/composer';
import * as files from '../glyphs/files';
import * as indicators from '../glyphs/indicators';
import * as knowledge from '../glyphs/knowledge';
import * as media from '../glyphs/media';
import * as navigation from '../glyphs/navigation';
import * as rowActions from '../glyphs/row-actions';
import { ICON_GEOMETRY, ICON_GRID } from '../grid';
import type { Icon, IconProps } from '../types';

const GLYPH_MODULES: Record<string, Record<string, Icon>> = {
  navigation,
  actions,
  'row-actions': rowActions,
  indicators,
  composer,
  media,
  files,
  account,
  knowledge,
};

const ICONS: Record<string, Icon> = Object.assign({}, ...Object.values(GLYPH_MODULES));

const ICON_ENTRIES = Object.entries(ICONS);

const CURVE_COMMAND = /[CcSsQqTtAa]/;
const PATH_TOKEN = /[A-Za-z]|-?\d*\.?\d+/g;
const LOWER_BOUND = ICON_GEOMETRY.inset;
const UPPER_BOUND = ICON_GRID.size - ICON_GEOMETRY.inset;

function pathPoints(d: string): Array<[number, number]> {
  const tokens = d.match(PATH_TOKEN) ?? [];
  const points: Array<[number, number]> = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let command = '';
  let index = 0;

  const nextNumber = (): number => {
    const token = tokens[index];
    index += 1;
    return Number(token);
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) break;
    if (/[A-Za-z]/.test(token)) {
      command = token;
      index += 1;
      if (command === 'Z' || command === 'z') {
        x = startX;
        y = startY;
      }
      continue;
    }
    switch (command) {
      case 'M':
        x = nextNumber();
        y = nextNumber();
        startX = x;
        startY = y;
        command = 'L';
        break;
      case 'm':
        x += nextNumber();
        y += nextNumber();
        startX = x;
        startY = y;
        command = 'l';
        break;
      case 'L':
        x = nextNumber();
        y = nextNumber();
        break;
      case 'l':
        x += nextNumber();
        y += nextNumber();
        break;
      case 'H':
        x = nextNumber();
        break;
      case 'h':
        x += nextNumber();
        break;
      case 'V':
        y = nextNumber();
        break;
      case 'v':
        y += nextNumber();
        break;
      default:
        throw new Error(`Unsupported path command "${command}" in "${d}"`);
    }
    points.push([x, y]);
  }

  return points;
}

function renderIcon(Component: Icon, props?: IconProps): SVGSVGElement {
  const { container } = render(<Component {...props} />);
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('icon rendered no <svg> root');
  return svg;
}

describe.each(ICON_ENTRIES)('%s', (name, Component) => {
  it('exposes the export name as its displayName', () => {
    expect(Component.displayName).toBe(name);
  });

  it('renders the shared svg contract', () => {
    const svg = renderIcon(Component);

    expect(svg.getAttribute('viewBox')).toBe(ICON_GRID.viewBox);
    expect(svg.getAttribute('fill')).toBe(ICON_GRID.fill);
    expect(svg.getAttribute('stroke')).toBe(ICON_GRID.stroke);
    expect(svg.getAttribute('stroke-width')).toBe(String(ICON_GRID.strokeWidth));
    expect(svg.getAttribute('stroke-linecap')).toBe(ICON_GRID.linecap);
    expect(svg.getAttribute('stroke-linejoin')).toBe(ICON_GRID.linejoin);
    expect(svg.getAttribute('width')).toBe(String(ICON_GRID.size));
    expect(svg.getAttribute('height')).toBe(String(ICON_GRID.size));
    expect(svg.querySelectorAll('path, circle').length).toBeGreaterThan(0);
  });

  it('paints no per-element fill or stroke override', () => {
    const svg = renderIcon(Component);

    for (const shape of svg.querySelectorAll('path, circle')) {
      expect(shape.getAttribute('fill')).toBeNull();
      expect(shape.getAttribute('stroke')).toBeNull();
    }
  });

  it('draws straight segments only', () => {
    const svg = renderIcon(Component);

    for (const shape of svg.querySelectorAll('path')) {
      expect(shape.getAttribute('d')).not.toMatch(CURVE_COMMAND);
    }
  });

  it('keeps every coordinate inside the icon grid', () => {
    const svg = renderIcon(Component);

    for (const shape of svg.querySelectorAll('path')) {
      const d = shape.getAttribute('d') ?? '';
      for (const [x, y] of pathPoints(d)) {
        expect(x).toBeGreaterThanOrEqual(LOWER_BOUND);
        expect(x).toBeLessThanOrEqual(UPPER_BOUND);
        expect(y).toBeGreaterThanOrEqual(LOWER_BOUND);
        expect(y).toBeLessThanOrEqual(UPPER_BOUND);
      }
    }

    for (const shape of svg.querySelectorAll('circle')) {
      const cx = Number(shape.getAttribute('cx'));
      const cy = Number(shape.getAttribute('cy'));
      const r = Number(shape.getAttribute('r'));
      expect(cx - r).toBeGreaterThanOrEqual(LOWER_BOUND);
      expect(cx + r).toBeLessThanOrEqual(UPPER_BOUND);
      expect(cy - r).toBeGreaterThanOrEqual(LOWER_BOUND);
      expect(cy + r).toBeLessThanOrEqual(UPPER_BOUND);
    }
  });

  it('accepts the lucide prop surface', () => {
    const svg = renderIcon(Component, {
      size: 16,
      strokeWidth: 1.5,
      className: 'text-muted-foreground',
      'aria-hidden': true,
    });

    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('height')).toBe('16');
    expect(svg.getAttribute('stroke-width')).toBe('1.5');
    expect(svg.getAttribute('class')).toBe('text-muted-foreground');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('scales the stroke when absoluteStrokeWidth is set', () => {
    const svg = renderIcon(Component, { size: 12, absoluteStrokeWidth: true });

    expect(svg.getAttribute('stroke-width')).toBe('4');
  });
});

describe('icon family', () => {
  it('ships the sidebar and nav tranche', () => {
    expect(ICON_ENTRIES.length).toBeGreaterThanOrEqual(24);
  });

  it('exports every glyph under a unique name', () => {
    expect(new Set(ICON_ENTRIES.map(([name]) => name)).size).toBe(ICON_ENTRIES.length);
  });

  /**
   * The merged map would silently keep the last writer, and `export *` from the
   * barrel would resolve the same clash to `undefined` at the call site rather
   * than to either glyph. Compare the summed export counts against the merge.
   */
  it('claims each name in exactly one glyph module', () => {
    const claims = new Map<string, string[]>();
    for (const [module, glyphs] of Object.entries(GLYPH_MODULES)) {
      for (const name of Object.keys(glyphs)) {
        claims.set(name, [...(claims.get(name) ?? []), module]);
      }
    }

    expect([...claims].filter(([, modules]) => modules.length > 1)).toEqual([]);
  });

  it('covers the composer and app-shell tranche', () => {
    for (const name of [
      'ArrowUp',
      'Bell',
      'Brain',
      'Camera',
      'ChevronDown',
      'CreditCard',
      'Menu',
      'Mic',
      'Paperclip',
      'Share2',
      'X',
    ]) {
      expect(ICONS[name]?.displayName).toBe(name);
    }
  });
});
