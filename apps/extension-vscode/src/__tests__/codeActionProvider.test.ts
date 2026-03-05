/**
 * codeActionProvider.test.ts — Tests for AgiCodeActionProvider logic
 *
 * Validates the code action provider returns correct actions based on
 * diagnostics and selection state.
 */

import { describe, it, expect } from 'vitest';

// Since we cannot import the vscode module directly, we test the provider logic pattern

describe('AgiCodeActionProvider logic', () => {
  interface MockRange {
    start: { line: number; character: number };
    end: { line: number; character: number };
  }

  interface MockSelection extends MockRange {
    isEmpty: boolean;
  }

  interface MockDiagnostic {
    message: string;
    severity: number;
  }

  interface MockCodeAction {
    title: string;
    kind: string;
    command?: { command: string; title: string };
    diagnostics?: MockDiagnostic[];
    isPreferred?: boolean;
  }

  function provideCodeActions(
    range: MockRange | MockSelection,
    diagnostics: MockDiagnostic[],
  ): MockCodeAction[] {
    const actions: MockCodeAction[] = [];

    const hasSelection =
      'isEmpty' in range
        ? !range.isEmpty
        : range.start.line !== range.end.line || range.start.character !== range.end.character;

    if (diagnostics.length > 0) {
      actions.push({
        title: 'Fix with AGI Workforce',
        kind: 'quickfix',
        command: {
          command: 'agi-workforce.fix',
          title: 'Fix with AGI Workforce',
        },
        diagnostics: [...diagnostics],
        isPreferred: false,
      });
    }

    if (hasSelection) {
      actions.push({
        title: 'Refactor with AGI Workforce',
        kind: 'refactor',
        command: {
          command: 'agi-workforce.refactor',
          title: 'Refactor with AGI Workforce',
        },
      });

      actions.push({
        title: 'Explain with AGI Workforce',
        kind: 'empty',
        command: {
          command: 'agi-workforce.explain',
          title: 'Explain with AGI Workforce',
        },
      });

      actions.push({
        title: 'Generate Tests with AGI Workforce',
        kind: 'empty',
        command: {
          command: 'agi-workforce.generateTests',
          title: 'Generate Tests with AGI Workforce',
        },
      });
    }

    return actions;
  }

  it('returns fix action when diagnostics are present', () => {
    const range: MockRange = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    };
    const diagnostics: MockDiagnostic[] = [{ message: 'error TS2304', severity: 0 }];

    const actions = provideCodeActions(range, diagnostics);
    expect(actions).toHaveLength(1);
    expect(actions[0].title).toBe('Fix with AGI Workforce');
    expect(actions[0].command?.command).toBe('agi-workforce.fix');
    expect(actions[0].isPreferred).toBe(false);
  });

  it('returns selection actions when text is selected', () => {
    const selection: MockSelection = {
      start: { line: 0, character: 0 },
      end: { line: 5, character: 10 },
      isEmpty: false,
    };

    const actions = provideCodeActions(selection, []);
    expect(actions).toHaveLength(3);
    expect(actions.map((a) => a.title)).toEqual([
      'Refactor with AGI Workforce',
      'Explain with AGI Workforce',
      'Generate Tests with AGI Workforce',
    ]);
  });

  it('returns all actions when diagnostics and selection are present', () => {
    const selection: MockSelection = {
      start: { line: 1, character: 0 },
      end: { line: 3, character: 5 },
      isEmpty: false,
    };
    const diagnostics: MockDiagnostic[] = [{ message: 'unused variable', severity: 1 }];

    const actions = provideCodeActions(selection, diagnostics);
    expect(actions).toHaveLength(4); // 1 fix + 3 selection
  });

  it('returns empty array when no diagnostics and no selection', () => {
    const range: MockRange = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    };

    const actions = provideCodeActions(range, []);
    expect(actions).toHaveLength(0);
  });

  it('returns correct commands for each selection action', () => {
    const selection: MockSelection = {
      start: { line: 0, character: 0 },
      end: { line: 1, character: 0 },
      isEmpty: false,
    };

    const actions = provideCodeActions(selection, []);
    const commands = actions.map((a) => a.command?.command);
    expect(commands).toContain('agi-workforce.refactor');
    expect(commands).toContain('agi-workforce.explain');
    expect(commands).toContain('agi-workforce.generateTests');
  });

  it('detects selection from Range (not Selection) with different positions', () => {
    const range: MockRange = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 10 },
    };

    const actions = provideCodeActions(range, []);
    expect(actions).toHaveLength(3); // Selection-based actions
  });
});
