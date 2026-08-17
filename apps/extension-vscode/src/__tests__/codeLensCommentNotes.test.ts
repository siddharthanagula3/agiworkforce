import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { commentNoteLenses } from '../features/code-lens/codeLensProvider';

const here = dirname(fileURLToPath(import.meta.url));
const providerSource = readFileSync(
  resolve(here, '..', 'features/code-lens/codeLensProvider.ts'),
  'utf8',
);

describe('commentNoteLenses', () => {
  it('offers a lens on a TODO comment, which declaration matching skips entirely', () => {
    const lines = [
      '// TODO: retry the upload when the presign expires',
      'export function upload(file: Blob) {',
      '  return put(file);',
      '}',
    ];

    const notes = commentNoteLenses(lines);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ keyword: 'TODO', anchorLine: 0 });
  });

  it('recognises the other note keywords in their own comment syntaxes', () => {
    expect(commentNoteLenses(['# FIXME: unicode names crash the parser'])[0]?.keyword).toBe(
      'FIXME',
    );
    expect(commentNoteLenses([' * HACK: pinned until upstream ships a fix'])[0]?.keyword).toBe(
      'HACK',
    );
    expect(commentNoteLenses(['-- BUG: off by one on leap days'])[0]?.keyword).toBe('BUG');
    expect(commentNoteLenses(['<!-- XXX: template escapes twice -->'])[0]?.keyword).toBe('XXX');
  });

  it('ignores comments with no note and code that merely mentions one', () => {
    expect(commentNoteLenses(['// plain explanatory comment'])).toHaveLength(0);
    expect(commentNoteLenses(['const label = "TODO";'])).toHaveLength(0);
    expect(commentNoteLenses(['// todo lowercase prose'])).toHaveLength(0);
  });

  it('targets the annotated code, not just the comment line', () => {
    const lines = [
      '// TODO: handle the empty case',
      'function first() {',
      '  return 1;',
      '}',
      'function second() {}',
    ];

    expect(commentNoteLenses(lines)[0]?.target).toMatchObject({ startLine: 0, endLine: 3 });
  });

  it('spans the whole comment block and stops at the block when no code follows', () => {
    const lines = [
      '// context line',
      '// FIXME: the retry budget is wrong',
      '// more context',
      '',
      'function unrelated() {}',
    ];

    const notes = commentNoteLenses(lines);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ anchorLine: 1 });
    expect(notes[0]?.target).toMatchObject({ startLine: 0, endLine: 2 });
  });

  it('emits one lens per comment block, not one per keyword occurrence', () => {
    const lines = ['// TODO: first thing', '// TODO: second thing'];
    expect(commentNoteLenses(lines)).toHaveLength(1);
  });

  it('finds a note anywhere inside the block, including after a non-note line', () => {
    const lines = ['/*', ' * Overview of the module.', ' * TODO: split this up', ' */'];
    expect(commentNoteLenses(lines)[0]).toMatchObject({ keyword: 'TODO', anchorLine: 2 });
  });

  it('reports every note block in a file', () => {
    const lines = ['// TODO: one', 'const a = 1;', '', '// FIXME: two', 'const b = 2;'];
    expect(commentNoteLenses(lines).map((n) => n.keyword)).toEqual(['TODO', 'FIXME']);
  });
});

describe('comment-note lens wiring', () => {
  it('turns each note into commands that accept the note range', () => {
    expect(providerSource).toContain("command: 'agi-workforce.fix'");
    expect(providerSource).toContain('arguments: [noteRange]');
  });

  it('keeps the declaration lenses passing their own range', () => {
    expect(providerSource.match(/arguments: \[targetRange\]/g)?.length).toBe(4);
  });
});
