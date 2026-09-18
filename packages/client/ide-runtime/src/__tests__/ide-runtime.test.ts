import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  appendTerminalOutput,
  buildCodeReviewPrompt,
  CODE_REVIEW_DIAGNOSTIC_SOURCE,
  describePatchRefusal,
  describeTerminalOutsideWorkspace,
  emptyTerminalCapture,
  formatTerminalCapture,
  matchAggressively,
  matchPatchBlock,
  matchPatchBlockAggressive,
  parseCodeReview,
  parseSuggestedCommands,
  parsePatchBlocks,
  positionAt,
  runSuggestedCommand,
  stripTerminalControlSequences,
  TERMINAL_CAPTURE_MAX_CHARS,
  validateSuggestedCommand,
  type CodeSelection,
  type CodeTerminalSession,
} from '../index';

const SOURCE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

function selection(overrides: Partial<CodeSelection> = {}): CodeSelection {
  return {
    document: { path: '/repo/src/auth.ts', languageId: 'typescript', text: 'const a = 1;\n' },
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    isEmpty: true,
    text: 'const a = 1;\n',
    ...overrides,
  };
}

describe('IDE neutrality', () => {
  it('imports no editor SDK anywhere in the package', () => {
    const offenders = sourceFiles(SOURCE_DIR)
      .filter((file) => !file.includes(`${path.sep}__tests__${path.sep}`))
      .filter((file) =>
        /(?:from|require\()\s*['"]@?(?:types\/)?(?:vscode|intellij|jetbrains)[^'"]*['"]/.test(
          fs.readFileSync(file, 'utf8'),
        ),
      );

    expect(offenders).toEqual([]);
  });

  it('names no editor URI, document handle or editor object in its public shapes', () => {
    const declarations = sourceFiles(SOURCE_DIR)
      .filter((file) => !file.includes(`${path.sep}__tests__${path.sep}`))
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');

    expect(declarations).not.toMatch(/\bvscode\./);
    expect(declarations).not.toMatch(/\bUri\b/);
  });
});

describe('selection and geometry', () => {
  it('reports a position for an offset on any line', () => {
    const text = 'alpha\nbeta\ngamma';
    expect(positionAt(text, 0)).toEqual({ line: 0, character: 0 });
    expect(positionAt(text, 6)).toEqual({ line: 1, character: 0 });
    expect(positionAt(text, 8)).toEqual({ line: 1, character: 2 });
    expect(positionAt(text, text.length + 50)).toEqual({ line: 2, character: 5 });
  });

  it('builds a review prompt from the language and text of the selection', () => {
    const prompt = buildCodeReviewPrompt(
      selection({ document: { path: '/a.py', languageId: 'python', text: 'x=1' }, text: 'x=1' }),
    );
    expect(prompt.user).toContain('```python');
    expect(prompt.user).toContain('x=1');
    expect(prompt.system).toContain('ISSUE|');
  });
});

describe('diagnostics', () => {
  it('anchors issue offsets at the top of the file for an empty selection', () => {
    const result = parseCodeReview('ISSUE|2|error|Unchecked index\nLooks risky.', selection());
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      path: '/repo/src/auth.ts',
      severity: 'error',
      message: 'Unchecked index',
      source: CODE_REVIEW_DIAGNOSTIC_SOURCE,
    });
    expect(result.diagnostics[0]?.range.start.line).toBe(2);
    expect(result.summary).toBe('Looks risky.');
  });

  it('anchors issue offsets at the start of a real selection', () => {
    const result = parseCodeReview(
      'ISSUE|1|warning|Shadowed name',
      selection({
        isEmpty: false,
        range: { start: { line: 40, character: 0 }, end: { line: 44, character: 0 } },
      }),
    );
    expect(result.diagnostics[0]?.range.start.line).toBe(41);
  });

  it('falls back to info for a severity it does not know, and drops malformed lines', () => {
    const result = parseCodeReview(
      ['ISSUE|0|catastrophe|Odd severity', 'ISSUE|0|error|', 'ISSUE|nope', 'Summary.'].join('\n'),
      selection(),
    );
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.severity).toBe('info');
    expect(result.summary).toBe('Summary.');
  });
});

describe('diff representation', () => {
  it('parses SEARCH/REPLACE envelopes into plain blocks', () => {
    const input = [
      '```patch:src/a.ts',
      '<<<<<<< SEARCH',
      'old',
      '=======',
      'new',
      '>>>>>>> REPLACE',
      '```',
    ].join('\n');
    expect(parsePatchBlocks(input)).toEqual([
      { filePath: 'src/a.ts', search: 'old', replace: 'new' },
    ]);
  });

  it('matches exactly and reports a range in plain line/character coordinates', () => {
    const outcome = matchPatchBlock('one\ntwo\nthree\n', {
      filePath: 'a.ts',
      search: 'two',
      replace: '2',
    });
    expect(outcome.matched).toBe(true);
    if (!outcome.matched) return;
    expect(outcome.match.range).toEqual({
      start: { line: 1, character: 0 },
      end: { line: 1, character: 3 },
    });
    expect(outcome.match.strategy).toBe('exact');
    expect(outcome.match.confidence).toBe('high');
  });

  it('matches through differing whitespace and lowers its confidence', () => {
    const outcome = matchPatchBlock('function  f( ) {\n  return 1;\n}\n', {
      filePath: 'a.ts',
      search: 'function f( ) {',
      replace: 'function f() {',
    });
    expect(outcome.matched).toBe(true);
    if (!outcome.matched) return;
    expect(outcome.match.fuzzy).toBe(true);
    expect(outcome.match.strategy).toBe('fuzzy');
  });

  it('refuses an aggressive match that is too short to identify a region', () => {
    const refusal = matchAggressively('const a = 1;', 'const a');
    expect(refusal).toMatchObject({ kind: 'too-short' });
  });

  it('refuses an aggressive match that appears more than once', () => {
    const body = 'export function handler(request) { return respond(request); }';
    const refusal = matchAggressively(`${body}\n${body}`, body);
    expect(refusal).toMatchObject({ kind: 'ambiguous' });
  });

  it('falls back to an aggressive match and names it low confidence', () => {
    const outcome = matchPatchBlockAggressive(
      'export   function handler ( request ) { return respond(request); }',
      {
        filePath: 'a.ts',
        search: 'export function handler(request) {\nreturn respond(request);\n}',
        replace: '',
      },
    );
    expect(outcome.matched).toBe(true);
    if (!outcome.matched) return;
    expect(outcome.match.confidence).toBe('low');
    expect(outcome.match.strategy).toBe('aggressive');
  });

  it('describes a refusal without naming an editor concept', () => {
    expect(describePatchRefusal({ kind: 'no-match' }, 'a.ts')).toBe('No match found for a.ts');
  });
});

describe('terminal and process', () => {
  it('rejects a command outside the allowlist and accepts one inside it', () => {
    expect(validateSuggestedCommand('rm -rf /')).toContain('not in the AI-suggestion allowlist');
    expect(validateSuggestedCommand('git status')).toBeUndefined();
  });

  it('refuses to run when the terminal has left the workspace', () => {
    expect(describeTerminalOutsideWorkspace('/repo', '/repo/apps')).toBeUndefined();
    expect(describeTerminalOutsideWorkspace('/repo', '/tmp')).toContain('outside the workspace');
    expect(describeTerminalOutsideWorkspace(null, '/tmp')).toBeUndefined();
  });

  it('runs a suggested command only once both gates pass', () => {
    const ran: string[] = [];
    const session: CodeTerminalSession = {
      ide: 'jetbrains',
      workspaceRoot: () => '/repo',
      terminalCwd: () => '/repo',
      runCommand: (command) => ran.push(command),
      captureTerminal: () => Promise.resolve(null),
    };

    expect(runSuggestedCommand(session, 'git push --force')).toContain('destructive pattern');
    expect(ran).toEqual([]);
    expect(runSuggestedCommand(session, 'pnpm test')).toBeUndefined();
    expect(ran).toEqual(['pnpm test']);
  });

  it('caps a capture and marks it truncated', () => {
    const capture = emptyTerminalCapture();
    expect(appendTerminalOutput(capture, 'a'.repeat(TERMINAL_CAPTURE_MAX_CHARS - 1))).toBe(true);
    expect(appendTerminalOutput(capture, 'bb')).toBe(false);
    expect(capture.output).toHaveLength(TERMINAL_CAPTURE_MAX_CHARS);
    expect(capture.truncated).toBe(true);
    expect(appendTerminalOutput(capture, 'c')).toBe(false);
  });

  it('formats a capture, separating a running command from one that exited', () => {
    expect(
      formatTerminalCapture({
        commandLine: 'pnpm test',
        output: 'ok',
        truncated: false,
        exitCode: 0,
        ended: true,
      }),
    ).toBe('$ pnpm test\nok\n[exit code 0]');

    expect(
      formatTerminalCapture({
        commandLine: '',
        output: 'working',
        truncated: true,
        exitCode: null,
        ended: false,
      }),
    ).toBe('working\n... [output truncated]\n[command is still running]');

    expect(formatTerminalCapture(emptyTerminalCapture())).toBe('');
  });

  it('strips control sequences and normalises line endings', () => {
    expect(stripTerminalControlSequences('[31mred[0m\r\nnext')).toBe('red\nnext');
  });

  it('keeps only the command lines out of a model reply', () => {
    expect(parseSuggestedCommands('# comment\ngit status\n\n// note\npnpm test')).toEqual([
      'git status',
      'pnpm test',
    ]);
  });
});
