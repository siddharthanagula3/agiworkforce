import { describe, expect, it } from 'vitest';

import { sanitizeSvg } from '../../lib/sanitize-svg';

const SVG = 'http://www.w3.org/2000/svg';

function wrap(body: string): string {
  return `<svg xmlns="${SVG}" viewBox="0 0 10 10">${body}</svg>`;
}

function injectLikeTheChat(markup: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host;
}

function executableNodes(host: HTMLElement): string[] {
  const found: string[] = [];
  for (const element of Array.from(host.querySelectorAll('*'))) {
    const name = element.tagName.toLowerCase();
    if (['img', 'iframe', 'script', 'style', 'a', 'object', 'embed'].includes(name)) {
      found.push(name);
    }
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLowerCase().startsWith('on')) found.push(`${name}@${attribute.name}`);
    }
  }
  return found;
}

const BREAKOUTS: ReadonlyArray<readonly [string, string]> = [
  ['an abruptly closed comment', wrap('<!--><img src="x" onerror="window.__owned=1">-->')],
  [
    'a processing instruction',
    wrap('<?x ><img src="x" onerror="window.__owned=1">?><rect width="1" height="1"/>'),
  ],
  [
    'a CDATA section inside an HTML integration point',
    wrap('<desc><![CDATA[ ><img src="x" onerror="window.__owned=1"> ]]></desc>'),
  ],
];

describe('sanitizeSvg output parsed by the HTML parser, as innerHTML does', () => {
  it.each(BREAKOUTS)('leaves nothing executable from %s', (_label, attack) => {
    const cleaned = sanitizeSvg(attack);
    expect(executableNodes(injectLikeTheChat(cleaned))).toEqual([]);
  });

  it('keeps CDATA text as plain text', () => {
    const cleaned = sanitizeSvg(wrap('<text x="1" y="2"><![CDATA[a < b & c]]></text>'));
    expect(injectLikeTheChat(cleaned).querySelector('text')?.textContent).toBe('a < b & c');
  });
});
