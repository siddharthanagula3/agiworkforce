import { describe, expect, it } from 'vitest';

import { parseDirectoryListing } from './public-directory';

const HOSTILE_BUDGET_MS = 2000;
const OPEN = '<div role="listitem" class="stories_cms_item w-dyn-item">';
const CLOSE = '</a></div>';

function card(body: string): string {
  return `${OPEN}<a href="/plugins/demo-plugin">${body}${CLOSE}`;
}

function timed<T>(run: () => T): { value: T; ms: number } {
  const started = performance.now();
  const value = run();
  return { value, ms: performance.now() - started };
}

describe('parseDirectoryListing on a hostile page', () => {
  it.each([
    ['heading closers and paragraph openers that never finish', '</h3><p'.repeat(6_000)],
    ['heading closers with no paragraph', '</h3>'.repeat(130_000)],
    ['name markers with no closing bracket', 'fs-list-field="name"'.repeat(40_000)],
    ['install markers with no closing bracket', 'format-number'.repeat(48_000)],
    ['works-with markers with no following tag', 'fs-list-field="works-with">'.repeat(32_000)],
    ['less-than signs with no greater-than', `</h3><p>${'<'.repeat(160_000)}</p>`],
  ])('parses a card with %s in linear time', (_label, body) => {
    const { value, ms } = timed(() => parseDirectoryListing(card(body)));
    expect(value).toHaveLength(1);
    expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
  });

  it('parses a page of card openers that never close in linear time', () => {
    const { value, ms } = timed(() => parseDirectoryListing(OPEN.repeat(95_000)));
    expect(value).toEqual([]);
    expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
  });
});

describe('parseDirectoryListing on a real-shaped page', () => {
  const page = [
    card(
      '<h3 fs-list-field="name" class="x">Alpha &amp; Co</h3><p class="d">Does <b>things</b> well.</p>' +
        '<div fs-list-field="works-with">Claude Code</div><div fs-list-field="works-with">Other</div>' +
        '<div class="format-number">1,234</div><span>Verified</span>',
    ),
    `${OPEN}<a href="/plugins/second">${'<h3>Second</h3><p>One</p><p>Two</p>'}${CLOSE}`,
    `${OPEN}<div>no link here</div>${CLOSE}`,
  ].join('\n');

  it('reads name, description, installs and works-with per card', () => {
    const cards = parseDirectoryListing(page);
    expect(cards.map((c) => c.slug)).toEqual(['demo-plugin', 'second']);
    expect(cards[0]).toMatchObject({
      name: 'Alpha & Co',
      description: 'Does things well.',
      installs: 1234,
    });
    expect(cards[1]).toMatchObject({ name: 'second', description: 'One', installs: null });
  });

  it('takes the first install count whose markup is well formed', () => {
    const cards = parseDirectoryListing(
      card('<i class="format-number">n/a</i><i class="format-number">9.5</i>'),
    );
    expect(cards[0]?.installs).toBe(95);
  });

  it.each([
    ['<p>Use List<> in Java</p>', 'Use List<> in Java'],
    ['ab<>cd', 'ab<>cd'],
    ['Use List&lt;&gt; in Java', 'Use List<> in Java'],
    ['1 <', '1 <'],
    ['a < b', 'a < b'],
    ['a <> <i>b</i> <>', 'a <> b <>'],
  ])('keeps the text around an empty or unfinished tag in %j', (text, expected) => {
    const cards = parseDirectoryListing(card(`<h3>Name</h3><p>${text}</p>`));
    expect(cards[0]?.description).toBe(expected);
  });

  it('uses the first name marker even when its text is empty', () => {
    const cards = parseDirectoryListing(
      card('<h3 fs-list-field="name"></h3><h3 fs-list-field="name">Two</h3>'),
    );
    expect(cards[0]?.name).toBe('demo-plugin');
  });
});
