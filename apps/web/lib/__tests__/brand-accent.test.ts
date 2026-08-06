import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * One product, one accent.
 *
 * `--primary` is the token behind every `bg-primary` control. Web bound it to
 * shadcn's stock blue (`221.2 83.2% 53.3%`) while apps/desktop bound it to the
 * brand terra-cotta, and the web composer's Send button used `bg-terra-cotta-500`
 * directly — so a primary button and the Send button beside it were different
 * colours, and neither the web app nor the desktop app agreed on the accent.
 *
 * This test pins the two stylesheets together. It reads the CSS as text rather
 * than computing styles, because the failure it guards is a token drifting in
 * one file, not a rendering bug.
 */

const repoRoot = resolve(import.meta.dirname, '../../../..');

/** #da7756 in the HSL triple shadcn tokens use. */
const BRAND_PRIMARY = '15 64.1% 59.6%';
/** Dark-on-terra-cotta: 5.3:1. White would be 3.1:1 and fail WCAG AA. */
const BRAND_PRIMARY_FOREGROUND = '180 3.1% 12.5%';

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

/** Every `--primary:` value in a stylesheet, in source order. */
function primaryValues(css: string, token = 'primary'): string[] {
  return [...css.matchAll(new RegExp(`^\\s*--${token}:\\s*([^;]+);`, 'gm'))].map((m) =>
    m[1]!.trim(),
  );
}

describe('brand accent', () => {
  it('binds web --primary to the brand in both light and dark', () => {
    const web = read('apps/web/app/globals.css');
    const values = primaryValues(web);

    // The third value is `.agi-dashboard-theme`, a deliberately scoped theme.
    // The first two are :root and .dark, which are the app-wide bindings.
    expect(values.slice(0, 2)).toEqual([BRAND_PRIMARY, BRAND_PRIMARY]);
  });

  it('pairs the accent with the foreground that passes WCAG AA', () => {
    const web = read('apps/web/app/globals.css');
    expect(primaryValues(web, 'primary-foreground').slice(0, 2)).toEqual([
      BRAND_PRIMARY_FOREGROUND,
      BRAND_PRIMARY_FOREGROUND,
    ]);
  });

  it('agrees with the desktop stylesheet', () => {
    // Desktop was already correct; web was copied from it. If either moves, the
    // two apps drift apart again.
    const desktop = read('apps/desktop/src/styles/globals.css');
    const values = primaryValues(desktop);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value).toBe(BRAND_PRIMARY);
  });

  it('no longer carries a stock shadcn blue as the app accent', () => {
    const web = read('apps/web/app/globals.css');
    for (const value of primaryValues(web).slice(0, 2)) {
      expect(value).not.toMatch(/^22[12]/);
      expect(value).not.toMatch(/^217/);
    }
  });
});
