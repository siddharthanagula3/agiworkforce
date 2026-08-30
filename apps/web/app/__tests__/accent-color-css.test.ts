import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ACCENT_COLORS } from '@shared/stores/web-settings-store';

const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

const selectable = ACCENT_COLORS.filter((accent) => accent.value !== 'default');

describe('Web accent colour picker', () => {
  it('offers more than the brand accent', () => {
    expect(selectable.length).toBeGreaterThan(0);
  });

  it.each(selectable)('repoints the chat accent tokens for $value', ({ value }) => {
    expect(css).toContain(`html[data-accent='${value}'] {
    --chat-accent-primary: var(--accent-swatch-${value});
    --chat-accent-primary-text: var(--accent-swatch-${value});
    --chat-accent-on-primary: var(--accent-swatch-${value}-on);
  }`);
  });

  it.each(ACCENT_COLORS)('defines a paired foreground for the $value swatch', ({ value }) => {
    // White cleared the light swatches but failed amber (2.97:1) and every dark
    // swatch, so each fill needs its own legible on-colour.
    expect(css).toContain(`--accent-swatch-${value}-on:`);
  });

  it.each(ACCENT_COLORS)('paints the $value swatch from the same variable', ({ value }) => {
    expect(css).toContain(`[data-accent-swatch='${value}'] {
    background: var(--accent-swatch-${value});
  }`);
  });

  it.each(ACCENT_COLORS)('defines the $value swatch in both light and dark', ({ value }) => {
    const declarations = css.match(new RegExp(`--accent-swatch-${value}:`, 'g')) ?? [];
    expect(declarations.length).toBe(2);
  });
});
