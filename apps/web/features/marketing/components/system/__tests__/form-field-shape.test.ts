import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SYSTEM = readFileSync(resolve(__dirname, '..', 'system.css'), 'utf8');
const COMPANY = readFileSync(
  resolve(__dirname, '..', '..', 'pages', 'company', 'company.css'),
  'utf8',
);

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} is defined`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('public form fields share one shape', () => {
  it('sets the field geometry once, in the design system', () => {
    const base = rule(SYSTEM, "[data-design='agi'] .agi-ds-input");
    expect(base).toContain('border-radius: var(--corner-surface)');
    expect(base).toContain('padding: var(--space-3) var(--space-4)');
    expect(base).toContain('font-size: var(--agi-text-md)');
  });

  it('lets a page family recolour a field but not reshape it', () => {
    const company = rule(COMPANY, "[data-design='agi'].agi-ds-page.agi-co main .agi-ds-input");
    expect(company).not.toMatch(/border-radius|padding|font-size/u);
  });
});
