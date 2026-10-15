import { describe, expect, it } from 'vitest';
import { ThinkingTagSplitter, type ThinkingTagPart } from '../thinking-tag-splitter';

function textOf(parts: readonly ThinkingTagPart[], type: 'text' | 'thinking'): string {
  return parts
    .filter(
      (part): part is Extract<ThinkingTagPart, { text: string }> =>
        'text' in part && part.type === type,
    )
    .map((part) => part.text)
    .join('');
}

describe('ThinkingTagSplitter', () => {
  it('separates reasoning, empty blocks, and multiple interleaved answers at every split boundary', () => {
    const wire =
      'Before<thinking>first reason</thinking>middle<thinking></thinking><thinking>second reason</thinking>after';
    for (let offset = 0; offset <= wire.length; offset++) {
      const splitter = new ThinkingTagSplitter();
      const parts = [
        ...splitter.push(wire.slice(0, offset)),
        ...splitter.push(wire.slice(offset)),
        ...splitter.flush(true),
      ];
      expect(textOf(parts, 'text'), `split at ${offset}`).toBe('Beforemiddleafter');
      expect(textOf(parts, 'thinking'), `split at ${offset}`).toBe('first reasonsecond reason');
      expect(parts.filter((part) => part.type === 'thinking-start')).toHaveLength(3);
      expect(parts.filter((part) => part.type === 'thinking-end')).toHaveLength(3);
      expect(splitter.isThinking).toBe(false);
    }
  });

  it('retains only the bounded marker suffix after every character', () => {
    const splitter = new ThinkingTagSplitter();
    const parts: ThinkingTagPart[] = [];
    for (const character of 'Text<thinking>hidden</thinking>answer') {
      parts.push(...splitter.push(character));
      expect(splitter.retainedCharacters).toBeLessThan('</thinking>'.length);
    }
    expect(textOf(parts, 'text')).toBe('Textanswer');
    expect(textOf(parts, 'thinking')).toBe('hidden');
    expect(splitter.retainedCharacters).toBe(0);
  });

  it('releases ordinary and code text immediately when it cannot be a protocol marker', () => {
    const splitter = new ThinkingTagSplitter();
    const text = 'OK\n```ts\nif (a < b) return "<think>";\n```';
    expect(textOf(splitter.push(text), 'text')).toBe(text);
    expect(splitter.retainedCharacters).toBe(0);
  });

  it('keeps the existing reserved-marker behavior inside code blocks', () => {
    const splitter = new ThinkingTagSplitter();
    const parts = splitter.push('```html\n<thinking>hidden</thinking>\n```');
    expect(textOf(parts, 'text')).toBe('```html\n\n```');
    expect(textOf(parts, 'thinking')).toBe('hidden');
  });

  it('finishes a partial public marker as ordinary text but keeps an unclosed reasoning block private', () => {
    const publicSplitter = new ThinkingTagSplitter();
    const first = publicSplitter.push('Answer <thin');
    expect(textOf(first, 'text')).toBe('Answer ');
    expect(textOf(publicSplitter.flush(true), 'text')).toBe('<thin');

    const privateSplitter = new ThinkingTagSplitter();
    const parts = [
      ...privateSplitter.push('<thinking>private</think'),
      ...privateSplitter.flush(true),
    ];
    expect(textOf(parts, 'text')).toBe('');
    expect(textOf(parts, 'thinking')).toBe('private</think');
    expect(privateSplitter.closeThinking()).toBe(true);
    expect(privateSplitter.closeThinking()).toBe(false);
  });

  it('does not retain reasoning bodies and cannot leak a private suffix after closing', () => {
    const splitter = new ThinkingTagSplitter();
    splitter.push('<thinking>');
    splitter.push('private'.repeat(100_000) + '</think');
    expect(splitter.retainedCharacters).toBe('</think'.length);
    splitter.closeThinking();
    expect(splitter.retainedCharacters).toBe(0);
    expect(textOf(splitter.push('public'), 'text')).toBe('public');
  });
});
