import { describe, expect, it } from 'vitest';
import { ARTIFACT_CSP_CONTENT, buildSandboxedHtml } from './artifact-sandbox';

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP_CONTENT}">`;
const HOSTILE_BUDGET_MS = 2000;

function timed<T>(run: () => T): { value: T; ms: number } {
  const started = performance.now();
  const value = run();
  return { value, ms: performance.now() - started };
}

describe('buildSandboxedHtml on hostile markup', () => {
  it('wraps a document made of meta openers that never close in linear time', () => {
    const { value, ms } = timed(() =>
      buildSandboxedHtml(`<!doctype html>${'<meta '.repeat(80_000)}`),
    );
    expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
    expect(value).toContain(CSP_META);
  });

  it('wraps a document made of head openers that never close in linear time', () => {
    const { value, ms } = timed(() => buildSandboxedHtml(`<html>${'<head '.repeat(60_000)}`));
    expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
    expect(value).toContain(CSP_META);
  });

  it('wraps a document made of html openers that never close in linear time', () => {
    const { value, ms } = timed(() => buildSandboxedHtml(`<html ${'<html '.repeat(60_000)}`));
    expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
    expect(value).toContain(CSP_META);
  });
});

describe('buildSandboxedHtml on real-shaped markup', () => {
  it('drops only the artifact-supplied policy and puts ours straight after the doctype', () => {
    const html =
      '<!DOCTYPE html><html lang="en"><HEAD data-x="1"><meta charset="utf-8">' +
      '<META HTTP-EQUIV="Content-Security-Policy" content="default-src *">' +
      '<meta name="viewport" content="width=device-width"><title>t</title></HEAD><body>x</body></html>';
    expect(buildSandboxedHtml(html)).toBe(
      `<!DOCTYPE html>${CSP_META}<html lang="en"><HEAD data-x="1"><meta charset="utf-8">` +
        '<meta name="viewport" content="width=device-width"><title>t</title></HEAD><body>x</body></html>',
    );
  });

  it('puts the policy ahead of <html> when the document has no doctype', () => {
    expect(buildSandboxedHtml('<html lang="en"><body>x</body></html>')).toBe(
      `${CSP_META}<html lang="en"><body>x</body></html>`,
    );
  });

  it('puts the policy straight after the doctype of a bare doctype document', () => {
    expect(buildSandboxedHtml('<!doctype html>\n<p>x</p>')).toBe(
      `<!doctype html>${CSP_META}\n<p>x</p>`,
    );
  });

  it.each(['<', '<>', 'a < b', 'a <', '< meta>x'])(
    'wraps %j, which holds no tag, as the body of a bare document',
    (html) => {
      const wrapped = buildSandboxedHtml(html);
      expect(wrapped).toContain(CSP_META);
      expect(wrapped.endsWith(`<body>${html}</body></html>`)).toBe(true);
    },
  );

  it('keeps text around an empty angle pair when it removes a policy tag', () => {
    const html =
      '<html><head>a<>b<meta http-equiv="Content-Security-Policy" content="x">c<</head></html>';
    expect(buildSandboxedHtml(html)).toBe(`${CSP_META}<html><head>a<>bc<</head></html>`);
  });

  it('leaves a head tag with no closing bracket as text behind the policy', () => {
    expect(buildSandboxedHtml('<html><head')).toBe(`${CSP_META}<html><head`);
  });
});
