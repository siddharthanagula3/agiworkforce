import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const optionsSource = readFileSync(resolve(__dirname, '../src/options.ts'), 'utf8');

function rule(selector: string): string {
  const start = optionsSource.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return optionsSource.slice(start, optionsSource.indexOf('}', start));
}

describe('options link-styled buttons and disclosure headers', () => {
  it('strips native button chrome from a button that reuses the link style', () => {
    const block = rule('button.opt-link');
    expect(block).toContain('border: 0');
    expect(block).toContain('background: none');
    expect(block).toContain('padding: 0');
  });

  it('draws a single chevron for a collapsible section header instead of the native marker', () => {
    expect(rule('summary.opt-section-header')).toContain('list-style: none');
    expect(optionsSource).toContain('summary.opt-section-header::-webkit-details-marker');
    expect(optionsSource).toContain('details[open] > summary.opt-section-header::after');
  });

  it('keeps the policy select wide enough for its longest option', () => {
    expect(rule('.opt-policy-select')).toContain('max-width: 340px');
  });
});
