import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { searchMentionTargets } from '../data/mentionSearch';

function symbol(
  name: string,
  kind: number,
  file: string,
  from: [number, number],
  to: [number, number],
) {
  return {
    name,
    kind,
    location: {
      uri: vscode.Uri.file(file),
      range: {
        start: { line: from[0], character: from[1] },
        end: { line: to[0], character: to[1] },
      },
    },
  };
}

describe('what @ offers in the composer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.window.activeTextEditor = undefined;
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);
    vi.mocked(vscode.workspace.asRelativePath).mockImplementation((target: unknown) =>
      String((target as { fsPath?: string }).fsPath ?? target).replace(/^\/repo\//u, ''),
    );
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
  });

  it('offers a symbol the language server knows, with the lines it occupies', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      symbol('resolveTierSync', vscode.SymbolKind.Function, '/repo/src/tier.ts', [11, 0], [19, 1]),
    ]);

    const targets = await searchMentionTargets('resolveTier');

    expect(targets).toEqual([
      {
        path: 'src/tier.ts',
        range: { startLine: 11, startCharacter: 0, endLine: 19, endCharacter: 1 },
        label: expect.stringContaining('resolveTierSync'),
      },
    ]);
    expect(targets[0]?.label).toContain('src/tier.ts · lines 12-20');
    expect(vi.mocked(vscode.commands.executeCommand).mock.calls[0]).toEqual([
      'vscode.executeWorkspaceSymbolProvider',
      'resolveTier',
    ]);
  });

  it('puts symbols above plain file matches', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      symbol('Tier', vscode.SymbolKind.Class, '/repo/src/tier.ts', [3, 0], [8, 1]),
    ]);
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
      vscode.Uri.file('/repo/docs/tier.md'),
    ]);

    const targets = await searchMentionTargets('tier');

    expect(targets.map((target) => target.path)).toEqual(['src/tier.ts', 'docs/tier.md']);
  });

  it('still offers files in an editor with no workspace symbol provider', async () => {
    vi.mocked(vscode.commands.executeCommand).mockRejectedValue(
      new Error('command not found: vscode.executeWorkspaceSymbolProvider'),
    );
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([vscode.Uri.file('/repo/src/tier.ts')]);

    const targets = await searchMentionTargets('tier');

    expect(targets.map((target) => target.path)).toEqual(['src/tier.ts']);
  });

  it('does not offer the same file and range twice', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      symbol('Tier', vscode.SymbolKind.Class, '/repo/src/tier.ts', [0, 0], [0, 0]),
      symbol('Tier', vscode.SymbolKind.Interface, '/repo/src/tier.ts', [0, 0], [0, 0]),
    ]);

    const targets = await searchMentionTargets('tier');

    expect(targets).toHaveLength(1);
  });
});
