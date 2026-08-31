import React from 'react';
import { describe, it, expect } from 'vitest';

import { reactNodeText } from '../reactNodeText';

describe('reactNodeText', () => {
  it('returns a plain string child unchanged', () => {
    expect(reactNodeText('print("hi")')).toBe('print("hi")');
  });

  it('recovers source from the token tree a highlighter produces', () => {
    // The shape rehype-highlight emits: text nodes interleaved with <span>
    // token elements. String() on this yields "[object Object]" per element,
    // comma-joined, which is what reached the clipboard.
    const highlighted = [
      React.createElement('span', { key: 'k1', className: 'hljs-keyword' }, 'from'),
      ' dataclasses ',
      React.createElement('span', { key: 'k2', className: 'hljs-keyword' }, 'import'),
      ' dataclass\n',
    ];

    expect(String(highlighted)).toContain('[object Object]');
    expect(reactNodeText(highlighted)).toBe('from dataclasses import dataclass\n');
  });

  it('walks nested elements to their depth', () => {
    const nested = React.createElement(
      'span',
      null,
      React.createElement('span', null, 'def '),
      React.createElement('span', null, React.createElement('span', null, 'render')),
      '():',
    );

    expect(reactNodeText(nested)).toBe('def render():');
  });

  it('ignores nodes that carry no text', () => {
    expect(reactNodeText([null, undefined, false, 'ok', 0])).toBe('ok0');
  });

  it('preserves whitespace and indentation exactly', () => {
    const indented = [
      'class Renderer:\n',
      React.createElement('span', { key: 'i' }, '    name'),
      ': str\n',
    ];

    expect(reactNodeText(indented)).toBe('class Renderer:\n    name: str\n');
  });
});
