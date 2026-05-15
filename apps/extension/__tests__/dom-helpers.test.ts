import { describe, it, expect, beforeEach } from 'vitest';
import { setText, clearChildren, createElementWith, setChild } from '../src/dom-helpers';

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
});
