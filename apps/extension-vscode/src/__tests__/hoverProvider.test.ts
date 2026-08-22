import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { AgiHoverProvider } from '../features/hover/hoverProvider';

const token = { isCancellationRequested: false } as vscode.CancellationToken;

const sections: string[] = [];

function configured(hoverEnabled: unknown): void {
  vi.mocked(vscode.workspace.getConfiguration).mockImplementation((section?: string) => {
    sections.push(section ?? '');
    return {
      get: vi.fn((key: string) => (key === 'hoverEnabled' ? hoverEnabled : undefined)),
      update: vi.fn(),
      has: vi.fn().mockReturnValue(true),
      inspect: vi.fn(),
    } as unknown as vscode.WorkspaceConfiguration;
  });
}

const WORD_RANGE = new vscode.Range(4, 6, 4, 13);

function documentWithWord(wordRange: vscode.Range | undefined): vscode.TextDocument {
  return {
    uri: vscode.Uri.file('/workspace/src/app.ts'),
    languageId: 'typescript',
    getWordRangeAtPosition: vi.fn(() => wordRange),
  } as unknown as vscode.TextDocument;
}

function hoverOver(wordRange: vscode.Range | undefined): vscode.Hover | undefined {
  return new AgiHoverProvider().provideHover(
    documentWithWord(wordRange),
    new vscode.Position(4, 8),
    token,
  );
}

beforeEach(() => {
  sections.length = 0;
  vi.clearAllMocks();
  configured(true);
});

describe('AgiHoverProvider', () => {
  it('offers nothing while the hover setting is off', () => {
    configured(false);
    expect(hoverOver(WORD_RANGE)).toBeUndefined();
  });

  it('offers nothing when the setting has never been set', () => {
    configured(undefined);
    expect(hoverOver(WORD_RANGE)).toBeUndefined();
  });

  it('reads the setting from the agiWorkforce section', () => {
    hoverOver(WORD_RANGE);
    expect(sections).toEqual(['agiWorkforce']);
  });

  it('offers nothing when the cursor is not over a word', () => {
    expect(hoverOver(undefined)).toBeUndefined();
  });

  it('anchors the hover to the word under the cursor', () => {
    const hover = hoverOver(WORD_RANGE);
    expect(hover?.range).toBe(WORD_RANGE);
  });

  it('links each quick action to the command that runs it', () => {
    const markdown = hoverOver(WORD_RANGE)?.contents as vscode.MarkdownString;

    expect(markdown.value).toContain('command:agi-workforce.explain');
    expect(markdown.value).toContain('command:agi-workforce.fix');
    expect(markdown.value).toContain('command:agi-workforce.generateTests');
  });

  it('trusts the markdown so the command links are clickable', () => {
    const markdown = hoverOver(WORD_RANGE)?.contents as vscode.MarkdownString;

    expect(markdown.isTrusted).toBe(true);
    expect(markdown.supportThemeIcons).toBe(true);
  });

  it('labels the actions under the product name', () => {
    const markdown = hoverOver(WORD_RANGE)?.contents as vscode.MarkdownString;

    expect(markdown.value).toContain('AGI Workforce');
    expect(markdown.value).toContain('Explain');
    expect(markdown.value).toContain('Fix');
    expect(markdown.value).toContain('Tests');
  });
});
