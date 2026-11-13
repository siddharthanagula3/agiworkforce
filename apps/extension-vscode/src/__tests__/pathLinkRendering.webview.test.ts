/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from 'vitest';
import '../webview/render';

function mount(markdown: string): HTMLElement {
  const html = window.agiRender?.(markdown);
  expect(html).toBeTypeOf('string');
  const root = document.createElement('div');
  root.innerHTML = html ?? '';
  document.body.replaceChildren(root);
  return root;
}

function resolve(results: Record<string, boolean>): void {
  window.agiResolvePaths?.(results);
}

describe('path links in rendered chat output', () => {
  beforeEach(() => {
    window.agiTakePendingPaths?.();
  });

  it('links a path with a line and column once the host confirms the file exists', () => {
    const root = mount('The failure is in src/core/setup.ts:31:12 today.');
    expect(root.querySelector('.path-link')).toBeNull();
    expect(window.agiTakePendingPaths?.()).toEqual(['src/core/setup.ts']);

    resolve({ 'src/core/setup.ts': true });
    const link = root.querySelector('.path-link');

    expect(link?.textContent).toBe('src/core/setup.ts:31:12');
    expect(link?.getAttribute('data-path')).toBe('src/core/setup.ts');
    expect(link?.getAttribute('data-line')).toBe('31');
    expect(link?.getAttribute('data-column')).toBe('12');
    expect(link?.getAttribute('role')).toBe('link');
    expect(link?.getAttribute('tabindex')).toBe('0');
  });

  it('links a known file at once on the next render, without asking the host again', () => {
    mount('see src/known.ts');
    window.agiTakePendingPaths?.();
    resolve({ 'src/known.ts': true });

    const root = mount('again src/known.ts');

    expect(root.querySelector('.path-link')?.textContent).toBe('src/known.ts');
    expect(window.agiTakePendingPaths?.()).toEqual([]);
  });

  it('never turns code in a labelled code block into links', () => {
    const code = [
      '```js',
      'const first = items.slice(0, 2);',
      'const widest = Math.max(a, b);',
      "import { run } from './src/app.ts';",
      '```',
    ].join('\n');
    const root = mount(code);

    expect(root.querySelector('.path-link, .path-candidate')).toBeNull();
    expect(window.agiTakePendingPaths?.()).toEqual([]);
    expect(root.querySelector('pre code')?.textContent).toContain('items.slice(0, 2)');
  });

  it('leaves a member call in prose as text when no such file exists', () => {
    const root = mount('Call `items.slice` and then Math.max on the result.');
    expect(window.agiTakePendingPaths?.()).toEqual(['items.slice', 'Math.max']);

    resolve({ 'items.slice': false, 'Math.max': false });

    expect(root.querySelector('.path-link, .path-candidate')).toBeNull();
    expect(root.textContent).toBe('Call items.slice and then Math.max on the result.\n');
    expect(mount('Math.max again').querySelector('.path-candidate')).toBeNull();
  });

  it('marks every frame of an unlabelled stack trace and leaves the code text intact', () => {
    const trace = ['```', 'Error: boom', '    at run (/repo/src/app.ts:8:3)', '```'].join('\n');
    const root = mount(trace);
    resolve({ '/repo/src/app.ts': true });
    const links = [...root.querySelectorAll('.path-link')];

    expect(links.map((link) => link.getAttribute('data-path'))).toEqual(['/repo/src/app.ts']);
    expect(root.querySelector('pre code')?.textContent).toContain('at run (/repo/src/app.ts:8:3)');
  });

  it('leaves an ordinary link alone', () => {
    const root = mount('[docs](https://agiworkforce.com/docs/setup.html)');

    expect(root.querySelector('.path-link, .path-candidate')).toBeNull();
    expect(root.querySelector('a')?.getAttribute('href')).toBe(
      'https://agiworkforce.com/docs/setup.html',
    );
  });

  it('does not introduce an href the sanitizer would have refused', () => {
    const root = mount('open src/app.ts:2');
    resolve({ 'src/app.ts': true });
    const link = root.querySelector('.path-link');

    expect(link?.tagName).toBe('SPAN');
    expect(link?.hasAttribute('href')).toBe(false);
  });
});
