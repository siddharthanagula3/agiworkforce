/**
 * codeLensTargetRange.test.ts — VSCX-01.
 *
 * Clicking a CodeLens above a function sent the *whole file* to the model. The
 * lens computed a range and threw it away: the commands were registered with no
 * parameters, so runInlineCommand fell back to `editor.selection`, and
 * `getText(undefined)` on an empty selection returns the entire document — which
 * also meant the "Select some code first" guard never fired.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { declarationSpan } from '../features/code-lens/declarationSpan';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, '..', rel), 'utf8');

describe('declarationSpan', () => {
  it('covers a braced function body, not just its signature', () => {
    const lines = [
      'export function alpha(a: number) {',
      '  const b = a * 2;',
      '  return b;',
      '}',
      '',
      'export function beta() {}',
    ];

    expect(declarationSpan(lines, 0)).toMatchObject({ startLine: 0, endLine: 3 });
  });

  it('stops at the end of the declaration rather than running to end of file', () => {
    const lines = [
      'function first() {',
      '  return 1;',
      '}',
      'function second() {',
      '  return 2;',
      '}',
    ];

    // The defect sent everything; the span must not reach the second function.
    expect(declarationSpan(lines, 0).endLine).toBe(2);
    expect(declarationSpan(lines, 3).endLine).toBe(5);
  });

  it('handles a single-line declaration', () => {
    expect(declarationSpan(['export function beta() {}'], 0)).toMatchObject({
      startLine: 0,
      endLine: 0,
    });
  });

  it('uses indentation where the language has no braces', () => {
    const lines = [
      'def alpha(x):',
      '    y = x + 1',
      '    return y',
      '',
      'def beta(x):',
      '    return x',
    ];

    expect(declarationSpan(lines, 0)).toMatchObject({ startLine: 0, endLine: 2 });
    expect(declarationSpan(lines, 4)).toMatchObject({ startLine: 4, endLine: 5 });
  });

  it('falls back to the declaration line when braces are unbalanced mid-edit', () => {
    // Erring toward too little context is safe; erring toward too much is the
    // bug being fixed.
    const lines = ['function broken() {', '  const x = 1;'];
    expect(declarationSpan(lines, 0)).toMatchObject({ startLine: 0, endLine: 0 });
  });
});

describe('lens → command wiring', () => {
  const provider = read('features/code-lens/codeLensProvider.ts');
  const commands = read('core/commandSetup.ts');
  const inline = read('core/runInlineCommand.ts');

  it('passes the target range as a command argument', () => {
    // The regression: a computed range that never reached the command.
    expect(provider).toContain('arguments: [targetRange]');
    expect(provider.match(/arguments: \[targetRange\]/g)?.length).toBe(4);
  });

  it('registers the inline commands so they accept that argument', () => {
    for (const command of ['explain', 'fix', 'refactor', 'generateTests', 'docs']) {
      expect(commands).toContain(`register('agi-workforce.${command}', async (targetRange?`);
    }
  });

  it('no longer resolves an empty selection to the whole document', () => {
    // getText(undefined) returns the entire file — the exact silent whole-file send.
    expect(inline).not.toContain('getText(selection.isEmpty ? undefined : selection)');
    expect(inline).toContain('targetRange ?? (selection.isEmpty ? undefined : selection)');
  });

  it('warns instead of sending anything when there is no range at all', () => {
    expect(inline).toContain('if (explicitRange === undefined)');
    expect(inline).toContain('Select some code first');
  });
});
