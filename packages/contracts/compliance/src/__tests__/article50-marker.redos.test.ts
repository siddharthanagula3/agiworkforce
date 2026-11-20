import { describe, expect, it } from 'vitest';

import { renderAiGeneratedMetaTag, injectAiGeneratedMetaTag } from '../article50-marker';

const HOSTILE_BUDGET_MS = 2000;
const ARGS = {
  kind: 'text',
  provider: 'p',
  model: 'm',
  generatedAt: '2026-01-01T00:00:00Z',
} as const;
const TAG = renderAiGeneratedMetaTag(ARGS);

describe('injectAiGeneratedMetaTag on hostile markup', () => {
  it('marks a document made of head openers that never close in linear time', () => {
    const html = '<head'.repeat(85_000);
    const started = performance.now();
    const marked = injectAiGeneratedMetaTag({ html, ...ARGS });
    expect(performance.now() - started).toBeLessThan(HOSTILE_BUDGET_MS);
    expect(marked).toBe(`${TAG}\n${html}`);
  });
});

describe('injectAiGeneratedMetaTag on real-shaped markup', () => {
  it('inserts the marker straight after the first head tag', () => {
    expect(
      injectAiGeneratedMetaTag({
        html: '<html><HEAD lang="en"><title>t</title></HEAD></html>',
        ...ARGS,
      }),
    ).toBe(`<html><HEAD lang="en">\n  ${TAG}<title>t</title></HEAD></html>`);
  });

  it('prepends the marker when there is no head', () => {
    expect(injectAiGeneratedMetaTag({ html: '<p>x</p>', ...ARGS })).toBe(`${TAG}\n<p>x</p>`);
  });

  it('prepends the marker when the only head tag has no closing bracket', () => {
    expect(injectAiGeneratedMetaTag({ html: '<html><head', ...ARGS })).toBe(`${TAG}\n<html><head`);
  });

  it.each(['<', '<>', 'a < b', 'a <'])(
    'prepends the marker to %j, which holds no head tag',
    (html) => {
      expect(injectAiGeneratedMetaTag({ html, ...ARGS })).toBe(`${TAG}\n${html}`);
    },
  );

  it('keeps an empty angle pair in front of the head tag', () => {
    expect(injectAiGeneratedMetaTag({ html: '<><head>x', ...ARGS })).toBe(`<><head>\n  ${TAG}x`);
  });

  it('replaces an earlier marker instead of adding a second one', () => {
    const once = injectAiGeneratedMetaTag({ html: '<head></head>', ...ARGS });
    expect(
      injectAiGeneratedMetaTag({ html: once, ...ARGS }).split('agi:ai-generated'),
    ).toHaveLength(2);
  });
});
