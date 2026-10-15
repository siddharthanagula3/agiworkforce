import { beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createDomTargetHelpers } from '../src/features/content/domTargets';

function helpers(rootDocument = document) {
  return createDomTargetHelpers(
    rootDocument,
    (element) => [element.localName, element.getAttribute('aria-label') ?? ''].join('|'),
    {
      maxElements: 1000,
      maxLocatorCharacters: 64000,
      maxDepth: 16,
    },
  );
}

beforeEach(() => document.body.replaceChildren());

describe('bounded same-origin and open-shadow target mechanics', () => {
  it('gives two identical shadow controls unique scope paths and resolves their exact objects', () => {
    const hosts = [document.createElement('div'), document.createElement('div')];
    const inputs = hosts.map((host) => {
      document.body.append(host);
      const root = host.attachShadow({ mode: 'open' });
      const input = document.createElement('input');
      input.setAttribute('aria-label', 'Name');
      root.append(input);
      return input;
    });
    const targets = helpers();
    expect(targets.locator(inputs[0]!)).not.toBe(targets.locator(inputs[1]!));
    for (const input of inputs)
      expect(targets.resolve(targets.locator(input)!, 'input|Name')).toBe(input);
    expect(targets.elements().elements).toContain(inputs[0]);
    expect(targets.elements().elements).toContain(inputs[1]);
  });

  it('resolves and follows actual focus into a same-origin iframe with an open shadow', () => {
    const dom = new JSDOM('<body></body>', { url: document.URL });
    const rootDocument = dom.window.document;
    const frame = rootDocument.createElement('iframe');
    frame.setAttribute('aria-label', 'Same site');
    rootDocument.body.append(frame);
    const child = frame.contentDocument!;
    const host = child.createElement('div');
    child.body.append(host);
    const input = child.createElement('input');
    input.setAttribute('aria-label', 'Child name');
    host.attachShadow({ mode: 'open' }).append(input);
    const targets = helpers(rootDocument);
    expect(targets.frameDocument(frame)).toBe(child);
    expect(targets.resolve(targets.locator(input)!, 'input|Child name')).toBe(input);
    input.focus();
    expect(rootDocument.activeElement).toBe(frame);
    expect(targets.focusedElement()).toBe(input);
    dom.window.close();
  });

  it('refuses readable foreign-origin iframe data even when the DOM instrument exposes it', () => {
    const dom = new JSDOM('<body></body>', { url: document.URL });
    const rootDocument = dom.window.document;
    const frame = rootDocument.createElement('iframe');
    frame.src = 'https://foreign.example/form';
    rootDocument.body.append(frame);
    const child = frame.contentDocument!;
    child.write('<input aria-label="Foreign secret">');
    const targets = helpers(rootDocument);
    expect(targets.frameDocument(frame)).toBeNull();
    expect(targets.elements().blockedFrames).toBe(1);
    expect(
      targets
        .elements()
        .elements.some((element) => element.getAttribute('aria-label') === 'Foreign secret'),
    ).toBe(false);
    expect(targets.locator(child.querySelector('input')!)).toBeNull();
    dom.window.close();
  });

  it('does not inspect closed shadow interiors and refuses an invented closed-scope path', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const input = document.createElement('input');
    host.attachShadow({ mode: 'closed' }).append(input);
    const targets = helpers();
    expect(targets.locator(input)).toBeNull();
    expect(targets.elements().elements).not.toContain(input);
    const path =
      '@agi-dom:' +
      JSON.stringify({
        url: document.URL,
        steps: [
          { selector: 'div', kind: 'shadow', signature: 'div|' },
          { selector: 'input', kind: 'element' },
        ],
      });
    expect(() => targets.resolve(path)).toThrow('Closed');
  });

  it('rejects a changed scope owner and an ambiguous scoped selector', () => {
    const host = document.createElement('div');
    host.setAttribute('aria-label', 'Original');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const input = document.createElement('input');
    root.append(input);
    const targets = helpers();
    const locator = targets.locator(input)!;
    host.setAttribute('aria-label', 'Changed');
    expect(() => targets.resolve(locator)).toThrow('scope owner changed');
    host.setAttribute('aria-label', 'Original');
    root.append(document.createElement('input'));
    const path = JSON.parse(locator.slice('@agi-dom:'.length));
    path.steps.at(-1).selector = 'input';
    expect(() => targets.resolve('@agi-dom:' + JSON.stringify(path))).toThrow('ambiguous');
  });

  it('reports bounded traversal and rejects oversized/deep locators', () => {
    document.body.innerHTML = '<div><input><input><input></div>';
    const targets = createDomTargetHelpers(document, (element) => element.localName, {
      maxElements: 3,
      maxLocatorCharacters: 30,
      maxDepth: 2,
    });
    expect(targets.elements().limited).toBe(true);
    expect(targets.elements().elements).toHaveLength(3);
    expect(() => targets.resolve('x'.repeat(31))).toThrow('too long');
  });
});
