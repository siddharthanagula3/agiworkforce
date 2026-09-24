import { describe, expect, it } from 'vitest';

import { sanitizeSvg } from '../ArtifactRenderer';

const SVG = 'http://www.w3.org/2000/svg';

function wrap(body: string, rootAttributes = ''): string {
  return `<svg xmlns="${SVG}" xmlns:xlink="http://www.w3.org/1999/xlink" ${rootAttributes}>${body}</svg>`;
}

function parse(markup: string): Document {
  return new DOMParser().parseFromString(markup, 'image/svg+xml');
}

function everyElement(document: Document): Element[] {
  return [document.documentElement, ...Array.from(document.documentElement.querySelectorAll('*'))];
}

const ATTACKS: ReadonlyArray<readonly [string, string]> = [
  ['a script element', wrap('<script>window.__owned = 1</script><rect width="1" height="1"/>')],
  ['a handler on the root', wrap('<rect width="1" height="1"/>', 'onload="window.__owned = 1"')],
  ['a handler on a child', wrap('<rect width="1" height="1" onclick="window.__owned = 1"/>')],
  [
    'HTML smuggled through foreignObject',
    wrap(
      '<foreignObject><iframe xmlns="http://www.w3.org/1999/xhtml" src="javascript:1"/></foreignObject>',
    ),
  ],
  [
    'an anchor with a script URL',
    wrap('<a href="javascript:window.__owned=1"><text>go</text></a>'),
  ],
  ['a use element pointing at a script URL', wrap('<use href="javascript:window.__owned=1"/>')],
  ['an xlink href with a data URL', wrap('<image xlink:href="data:text/html,owned"/>')],
  ['an animation that rewrites an href', wrap('<animate attributeName="href" to="javascript:1"/>')],
  ['a set element', wrap('<set attributeName="onmouseover" to="window.__owned=1"/>')],
  ['a style element', wrap('<style>@import url("https://example.invalid/x.css");</style>')],
];

describe('sanitizeSvg, the sanitizer between model SVG and the chat DOM', () => {
  it.each(ATTACKS)('removes %s', (_label, attack) => {
    const cleaned = sanitizeSvg(attack);
    const document = parse(cleaned);

    for (const element of everyElement(document)) {
      const name = element.tagName.toLowerCase();
      expect(['script', 'foreignobject', 'iframe', 'a', 'animate', 'set', 'style']).not.toContain(
        name,
      );
      for (const attribute of Array.from(element.attributes)) {
        expect(attribute.name.toLowerCase().startsWith('on'), attribute.name).toBe(false);
        expect(attribute.value.trim().toLowerCase()).not.toMatch(/^(?:javascript|data|vbscript):/);
      }
    }
  });

  it('refuses a document whose root is not an SVG element', () => {
    expect(sanitizeSvg('<html><body><script>1</script></body></html>')).toBe('');
  });

  it('refuses markup the XML parser rejects rather than passing it through', () => {
    expect(sanitizeSvg('<svg><rect></svg')).toBe('');
  });

  it('keeps the drawing a diagram needs', () => {
    const cleaned = sanitizeSvg(
      wrap(
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs>' +
          '<rect width="10" height="10" fill="url(#g)"/><text x="1" y="2">label</text>',
        'viewBox="0 0 10 10"',
      ),
    );
    const document = parse(cleaned);

    expect(document.documentElement.getAttribute('viewBox')).toBe('0 0 10 10');
    expect(document.querySelector('linearGradient')).not.toBeNull();
    expect(document.querySelector('text')?.textContent).toBe('label');
  });
});
