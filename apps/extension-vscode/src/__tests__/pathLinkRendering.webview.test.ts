/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import '../webview/render';

function parse(markdown: string): Document {
  const html = window.agiRender?.(markdown);
  expect(html).toBeTypeOf('string');
  return new DOMParser().parseFromString(html ?? '', 'text/html');
}

describe('path links in rendered chat output', () => {
  it('marks a path with a line and column as a link carrying its position', () => {
    const link = parse('The failure is in src/core/setup.ts:31:12 today.').querySelector(
      '.path-link',
    );

    expect(link?.textContent).toBe('src/core/setup.ts:31:12');
    expect(link?.getAttribute('data-path')).toBe('src/core/setup.ts');
    expect(link?.getAttribute('data-line')).toBe('31');
    expect(link?.getAttribute('data-column')).toBe('12');
    expect(link?.getAttribute('role')).toBe('link');
    expect(link?.getAttribute('tabindex')).toBe('0');
  });

  it('marks every frame of a fenced stack trace and leaves the code text intact', () => {
    const trace = ['```', 'Error: boom', '    at run (/repo/src/app.ts:8:3)', '```'].join('\n');
    const document_ = parse(trace);
    const links = [...document_.querySelectorAll('.path-link')];

    expect(links.map((link) => link.getAttribute('data-path'))).toEqual(['/repo/src/app.ts']);
    expect(document_.querySelector('pre code')?.textContent).toContain(
      'at run (/repo/src/app.ts:8:3)',
    );
  });

  it('leaves an ordinary link alone', () => {
    const document_ = parse('[docs](https://agiworkforce.com/docs/setup.html)');

    expect(document_.querySelector('.path-link')).toBeNull();
    expect(document_.querySelector('a')?.getAttribute('href')).toBe(
      'https://agiworkforce.com/docs/setup.html',
    );
  });

  it('does not introduce an href the sanitizer would have refused', () => {
    const link = parse('open src/app.ts:2').querySelector('.path-link');

    expect(link?.tagName).toBe('SPAN');
    expect(link?.hasAttribute('href')).toBe(false);
  });
});
