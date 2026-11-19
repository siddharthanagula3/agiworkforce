import { describe, expect, it } from 'vitest';

import { fallbackWillRunScripts, withFallbackErrorReporter } from '../SandboxedIframe';

const HOSTILE_BUDGET_MS = 2000;

function timed<T>(run: () => T): { value: T; ms: number } {
  const started = performance.now();
  const value = run();
  return { value, ms: performance.now() - started };
}

const REPORTER = withFallbackErrorReporter('<head>x').slice('<head>'.length, -'x'.length);

describe('srcdoc fallback on hostile markup', () => {
  it('checks for inline scripts in a document of script openers that never close in linear time', () => {
    const { value, ms } = timed(() => fallbackWillRunScripts('<script '.repeat(40_000)));
    expect(value).toBe(true);
    expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
  });

  it('checks for inline scripts in a document of closed-bracket openers with no end tag in linear time', () => {
    const { value, ms } = timed(() => fallbackWillRunScripts('<script>'.repeat(110_000)));
    expect(value).toBe(true);
    expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
  });

  it('injects the error reporter into head openers that never close in linear time', () => {
    const html = `<html>${'<head '.repeat(60_000)}`;
    const { value, ms } = timed(() => withFallbackErrorReporter(html));
    expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
    expect(value).toBe(`<html><head>${REPORTER}</head>${'<head '.repeat(60_000)}`);
  });

  it('injects the error reporter into html openers that never close in linear time', () => {
    const html = '<html '.repeat(60_000);
    const { value, ms } = timed(() => withFallbackErrorReporter(html));
    expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
    expect(value).toBe(`${REPORTER}${html}`);
  });
});

describe('srcdoc fallback on real-shaped markup', () => {
  it.each([
    ['<script>a()</script>', false],
    ['<SCRIPT type="module">a()</SCRIPT >', true],
    ['<script src="x.js"></script>', true],
    ['<script defer SRC = "x.js"></script><script>a()</script>', false],
    ['<script src="x.js"></script><script data-x="1">a()', true],
    ['<script data-src-x="1">a()</script>', false],
    ['<p>no scripts</p>', true],
  ])('%s -> renderable %s', (html, renderable) => {
    expect(fallbackWillRunScripts(html)).toBe(renderable);
  });

  it('places the reporter right after head, else after html, else in front', () => {
    expect(withFallbackErrorReporter('<html><HEAD a="1"><title>t</title></HEAD></html>')).toBe(
      `<html><HEAD a="1">${REPORTER}<title>t</title></HEAD></html>`,
    );
    expect(withFallbackErrorReporter('<html lang="en"><body>x</body></html>')).toBe(
      `<html lang="en"><head>${REPORTER}</head><body>x</body></html>`,
    );
    expect(withFallbackErrorReporter('<p>x</p>')).toBe(`${REPORTER}<p>x</p>`);
    expect(withFallbackErrorReporter('')).toBe('');
  });

  it.each(['<', '<>', '< head>x', 'a <', '<head', '<html lang'])(
    'puts the reporter in front of %j, which has no complete head or html tag',
    (html) => {
      expect(withFallbackErrorReporter(html)).toBe(`${REPORTER}${html}`);
      expect(fallbackWillRunScripts(html)).toBe(true);
    },
  );

  it('keeps an empty angle pair and a lone less-than in front of the head tag', () => {
    expect(withFallbackErrorReporter('<><head>x')).toBe(`<><head>${REPORTER}x`);
    expect(withFallbackErrorReporter('a <<html>')).toBe(`a <<html><head>${REPORTER}</head>`);
  });
});
