import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { enclosingFixScope, inlineCommandPrompt } from '../core/runInlineCommand';

const here = dirname(fileURLToPath(import.meta.url));
const inline = readFileSync(resolve(here, '..', 'core/runInlineCommand.ts'), 'utf8');

function symbol(
  kind: string,
  startLine: number,
  endLine: number,
  children: unknown[] = [],
): vscode.DocumentSymbol {
  return {
    kind: vscode.SymbolKind[kind],
    range: new vscode.Range(startLine, 0, endLine, 1),
    children,
  } as unknown as vscode.DocumentSymbol;
}

describe('inline Fix scope', () => {
  const outline = [
    symbol('Class', 0, 40, [symbol('Method', 4, 12), symbol('Method', 14, 30)]),
    symbol('Function', 42, 60),
  ];

  it('widens a diagnostic to the innermost function around it', () => {
    const scope = enclosingFixScope(outline, new vscode.Range(20, 4, 20, 18));
    expect(scope?.start).toMatchObject({ line: 14 });
    expect(scope?.end).toMatchObject({ line: 30 });
  });

  it('keeps the diagnostic lines when no function encloses them', () => {
    expect(enclosingFixScope(outline, new vscode.Range(41, 0, 41, 5))).toBeUndefined();
  });

  it('tells the model which lines the problem is on and that it may change the rest', () => {
    const prompt = inlineCommandPrompt('fix', 'javascript', 'function percentDone() {}', {
      before: '',
      after: '',
      problems: ['line 21: Parameter store implicitly has an any type.'],
      widenedFrom: { startLine: 21, endLine: 21 },
    });
    expect(prompt).toContain('The problem is on line 21.');
    expect(prompt).toContain('change any of them a correct fix needs');
    expect(prompt).toMatch(/replaces? (exactly )?the selected lines/i);
  });

  it('runs in plan mode without a Proceed prompt and never applies itself there', () => {
    expect(inline).not.toContain('plan mode is enabled. Proceed');
    expect(inline).toContain('Config.autoApplyFixes() && !Config.planModeActive()');
  });
});
