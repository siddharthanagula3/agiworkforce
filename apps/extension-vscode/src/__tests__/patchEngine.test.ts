/**
 * patchEngine.test.ts — Starter coverage for the highest data-loss-risk module.
 *
 * Covers the deterministic parser surface. Apply / undo flow tests against
 * the VS Code mock are deferred to E2 (broader test pass) — they need richer
 * MockTextDocument fixtures than the current mock provides.
 */

import { describe, expect, it } from 'vitest';
import { parsePatchBlocks, type PatchBlock } from '../services/patchEngine';

describe('parsePatchBlocks', () => {
  it('returns empty array for plain text with no envelope', () => {
    expect(parsePatchBlocks('hello world')).toEqual([]);
    expect(parsePatchBlocks('')).toEqual([]);
  });

  it('parses a single envelope with a single hunk', () => {
    const input = [
      '```patch:src/auth.ts',
      '<<<<<<< SEARCH',
      'old line 1',
      'old line 2',
      '=======',
      'new line 1',
      'new line 2',
      '>>>>>>> REPLACE',
      '```',
    ].join('\n');

    const blocks = parsePatchBlocks(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual<PatchBlock>({
      filePath: 'src/auth.ts',
      search: 'old line 1\nold line 2',
      replace: 'new line 1\nnew line 2',
    });
  });

  it('parses multiple envelopes in one response', () => {
    const input = [
      '```patch:src/a.ts',
      '<<<<<<< SEARCH',
      'foo',
      '=======',
      'bar',
      '>>>>>>> REPLACE',
      '```',
      '',
      'Some prose between blocks.',
      '',
      '```patch:src/b.ts',
      '<<<<<<< SEARCH',
      'baz',
      '=======',
      'qux',
      '>>>>>>> REPLACE',
      '```',
    ].join('\n');

    const blocks = parsePatchBlocks(input);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.filePath).toBe('src/a.ts');
    expect(blocks[1]?.filePath).toBe('src/b.ts');
  });

  it('parses multiple hunks within a single envelope', () => {
    const input = [
      '```patch:src/file.ts',
      '<<<<<<< SEARCH',
      'one',
      '=======',
      '1',
      '>>>>>>> REPLACE',
      '<<<<<<< SEARCH',
      'two',
      '=======',
      '2',
      '>>>>>>> REPLACE',
      '```',
    ].join('\n');

    const blocks = parsePatchBlocks(input);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ filePath: 'src/file.ts', search: 'one', replace: '1' });
    expect(blocks[1]).toMatchObject({ filePath: 'src/file.ts', search: 'two', replace: '2' });
  });

  it('handles empty SEARCH (insert at start)', () => {
    const input = [
      '```patch:src/new.ts',
      '<<<<<<< SEARCH',
      '=======',
      'export const X = 1;',
      '>>>>>>> REPLACE',
      '```',
    ].join('\n');

    const blocks = parsePatchBlocks(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.search).toBe('');
    expect(blocks[0]?.replace).toBe('export const X = 1;');
  });

  it('handles empty REPLACE (delete matched region)', () => {
    const input = [
      '```patch:src/file.ts',
      '<<<<<<< SEARCH',
      'remove me',
      '=======',
      '>>>>>>> REPLACE',
      '```',
    ].join('\n');

    const blocks = parsePatchBlocks(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.search).toBe('remove me');
    expect(blocks[0]?.replace).toBe('');
  });

  it('skips envelopes with no filepath', () => {
    const input = [
      '```patch:',
      '<<<<<<< SEARCH',
      'foo',
      '=======',
      'bar',
      '>>>>>>> REPLACE',
      '```',
    ].join('\n');
    expect(parsePatchBlocks(input)).toEqual([]);
  });

  it('trims surrounding whitespace from filepath', () => {
    const input = [
      '```patch:   src/file.ts   ',
      '<<<<<<< SEARCH',
      'foo',
      '=======',
      'bar',
      '>>>>>>> REPLACE',
      '```',
    ].join('\n');
    const blocks = parsePatchBlocks(input);
    expect(blocks[0]?.filePath).toBe('src/file.ts');
  });

  it('preserves internal whitespace in search and replace', () => {
    const input = [
      '```patch:src/file.ts',
      '<<<<<<< SEARCH',
      '  indented line',
      '    more indent',
      '=======',
      '\trab indent',
      '>>>>>>> REPLACE',
      '```',
    ].join('\n');
    const blocks = parsePatchBlocks(input);
    expect(blocks[0]?.search).toBe('  indented line\n    more indent');
    expect(blocks[0]?.replace).toBe('\trab indent');
  });

  it('ignores non-patch fenced blocks', () => {
    const input = [
      '```typescript',
      'const x = 1;',
      '```',
      '',
      '```patch:src/a.ts',
      '<<<<<<< SEARCH',
      'foo',
      '=======',
      'bar',
      '>>>>>>> REPLACE',
      '```',
    ].join('\n');
    const blocks = parsePatchBlocks(input);
    expect(blocks).toHaveLength(1);
  });

  it('returns empty array for malformed envelope (missing >>>>>>> REPLACE)', () => {
    const input = ['```patch:src/file.ts', '<<<<<<< SEARCH', 'foo', '=======', 'bar', '```'].join(
      '\n',
    );
    expect(parsePatchBlocks(input)).toEqual([]);
  });

  it('handles three or more envelopes', () => {
    const make = (file: string, body: string) =>
      `\`\`\`patch:${file}\n<<<<<<< SEARCH\n${body}\n=======\nnew-${body}\n>>>>>>> REPLACE\n\`\`\``;
    const input = [make('a.ts', 'a'), make('b.ts', 'b'), make('c.ts', 'c')].join('\n\n');
    const blocks = parsePatchBlocks(input);
    expect(blocks.map((b) => b.filePath)).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });
});
