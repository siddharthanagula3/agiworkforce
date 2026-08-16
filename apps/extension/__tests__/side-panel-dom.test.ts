import { describe, it, expect } from 'vitest';
import { el, formatTime } from '../src/features/side-panel/dom';

describe('side-panel dom.el', () => {
  it('creates an element with the given tag and attributes', () => {
    const node = el('div', { class: 'sp-bubble', 'data-id': 'm1' });
    expect(node.tagName).toBe('DIV');
    expect(node.getAttribute('class')).toBe('sp-bubble');
    expect(node.getAttribute('data-id')).toBe('m1');
  });

  it('routes style through the CSSOM (cssText), not a style attribute (CSP-safe)', () => {
    const node = el('span', { style: 'color: red' });
    expect(node.style.color).toBe('red');
    expect(node.getAttribute('style')).toContain('color: red');
  });

  it('appends string children as text nodes and node children as-is', () => {
    const child = el('b', {}, 'bold');
    const node = el('p', {}, 'hello ', child);
    expect(node.childNodes).toHaveLength(2);
    expect(node.childNodes[0].nodeType).toBe(3);
    expect(node.textContent).toBe('hello bold');
    expect(node.querySelector('b')?.textContent).toBe('bold');
  });
});

describe('side-panel dom.formatTime', () => {
  it('formats a timestamp as a short hour:minute local time', () => {
    const out = formatTime(new Date(2024, 0, 1, 14, 5).getTime());
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });
});
