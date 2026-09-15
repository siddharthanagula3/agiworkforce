import { describe, it, expect, beforeEach } from 'vitest';
import {
  setText,
  clearChildren,
  createElementWith,
  setChild,
  isDomSmallEnoughToRead,
  MAX_DOM_ELEMENTS_FOR_EXTRACTION,
} from '../src/dom-helpers';

describe('dom-helpers', () => {
  let div: HTMLElement;

  beforeEach(() => {
    div = document.createElement('div');
  });

  it('setText sets textContent and does not parse HTML', () => {
    setText(div, '<b>bold</b>');
    expect(div.innerHTML).toBe('&lt;b&gt;bold&lt;/b&gt;');
    expect(div.textContent).toBe('<b>bold</b>');
  });

  it('clearChildren removes all children', () => {
    div.appendChild(document.createElement('span'));
    div.appendChild(document.createElement('span'));
    clearChildren(div);
    expect(div.childNodes.length).toBe(0);
  });

  it('createElementWith builds element with all options', () => {
    const el = createElementWith({
      tag: 'span',
      className: 'foo bar',
      id: 'my-id',
      text: 'hello',
      attrs: { 'data-x': '1' },
    });
    expect(el.tagName.toLowerCase()).toBe('span');
    expect(el.className).toBe('foo bar');
    expect(el.id).toBe('my-id');
    expect(el.textContent).toBe('hello');
    expect(el.getAttribute('data-x')).toBe('1');
  });

  it('createElementWith with no text leaves textContent empty', () => {
    const el = createElementWith({ tag: 'div' });
    expect(el.textContent).toBe('');
  });

  it('setChild replaces children with a single new element', () => {
    div.appendChild(document.createElement('span'));
    div.appendChild(document.createElement('span'));
    setChild(div, { tag: 'p', className: 'note', text: 'done' });
    expect(div.childNodes.length).toBe(1);
    const child = div.firstElementChild as HTMLElement;
    expect(child.tagName.toLowerCase()).toBe('p');
    expect(child.className).toBe('note');
    expect(child.textContent).toBe('done');
  });

  describe('createElementWith attrs hardening', () => {
    it('drops on* event-handler attributes', () => {
      const el = createElementWith({ tag: 'div', attrs: { onclick: 'alert(1)' } });
      expect(el.hasAttribute('onclick')).toBe(false);
      expect(el.getAttribute('onclick')).toBeNull();
    });

    it('drops onerror regardless of case', () => {
      const el = createElementWith({ tag: 'img', attrs: { OnError: 'alert(1)' } });
      expect(el.hasAttribute('onerror')).toBe(false);
      expect(el.hasAttribute('OnError')).toBe(false);
    });

    it('drops a javascript: scheme on href', () => {
      const el = createElementWith({ tag: 'a', attrs: { href: 'javascript:alert(1)' } });
      expect(el.hasAttribute('href')).toBe(false);
    });

    it('drops a data: scheme on src', () => {
      const el = createElementWith({
        tag: 'img',
        attrs: { src: 'data:text/html,<script>alert(1)</script>' },
      });
      expect(el.hasAttribute('src')).toBe(false);
    });

    it('keeps a static https href intact', () => {
      const el = createElementWith({ tag: 'a', attrs: { href: 'https://example.com' } });
      expect(el.getAttribute('href')).toBe('https://example.com');
    });

    it('keeps a non-url, non-event static attribute intact', () => {
      const el = createElementWith({ tag: 'div', attrs: { 'data-x': '1', title: 'hello' } });
      expect(el.getAttribute('data-x')).toBe('1');
      expect(el.getAttribute('title')).toBe('hello');
    });
  });
});

describe('isDomSmallEnoughToRead', () => {
  it('accepts an ordinary document', () => {
    document.body.replaceChildren();
    expect(isDomSmallEnoughToRead()).toBe(true);
  });

  it('rejects a document past the element cap', () => {
    const querySelectorAll = document.querySelectorAll.bind(document);
    document.querySelectorAll = ((selector: string) =>
      selector === '*'
        ? ({ length: MAX_DOM_ELEMENTS_FOR_EXTRACTION + 1 } as unknown as NodeListOf<Element>)
        : querySelectorAll(selector)) as typeof document.querySelectorAll;
    try {
      expect(isDomSmallEnoughToRead()).toBe(false);
    } finally {
      document.querySelectorAll = querySelectorAll;
    }
  });
});
