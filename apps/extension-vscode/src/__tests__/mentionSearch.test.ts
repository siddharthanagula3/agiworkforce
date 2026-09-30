import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

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
  let root: string;
  let originalFolders: typeof vscode.workspace.workspaceFolders;
  let originalFolder: ((uri: vscode.Uri) => vscode.WorkspaceFolder | undefined) | undefined;

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-mentions-')));
    await fs.mkdir(path.join(root, 'src'));
    await fs.mkdir(path.join(root, 'docs'));
    await fs.writeFile(path.join(root, 'src/tier.ts'), 'ordinary code');
    await fs.writeFile(path.join(root, 'docs/tier.md'), 'ordinary documentation');
    execFileSync('git', ['-c', 'init.templateDir=', 'init', '-q'], { cwd: root });
    originalFolders = vscode.workspace.workspaceFolders;
    originalFolder = vi.mocked(vscode.workspace.getWorkspaceFolder).getMockImplementation();
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file(root) },
    ];
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockImplementation((uri) =>
      uri.fsPath.startsWith(`${root}${path.sep}`)
        ? { name: 'workspace', index: 0, uri: vscode.Uri.file(root) }
        : undefined,
    );
    vi.clearAllMocks();
    vscode.window.activeTextEditor = undefined;
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);
    vi.mocked(vscode.workspace.asRelativePath).mockImplementation((target: unknown) =>
      String((target as { fsPath?: string }).fsPath ?? target).replace(`${root}${path.sep}`, ''),
    );
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vscode.workspace.workspaceFolders = originalFolders;
    if (originalFolder !== undefined)
      vi.mocked(vscode.workspace.getWorkspaceFolder).mockImplementation(originalFolder);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('offers a symbol the language server knows, with the lines it occupies', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      symbol(
        'resolveTierSync',
        vscode.SymbolKind.Function,
        path.join(root, 'src/tier.ts'),
        [11, 0],
        [19, 1],
      ),
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
      symbol('Tier', vscode.SymbolKind.Class, path.join(root, 'src/tier.ts'), [3, 0], [8, 1]),
    ]);
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
      vscode.Uri.file(path.join(root, 'docs/tier.md')),
    ]);

    const targets = await searchMentionTargets('tier');

    expect(targets.map((target) => target.path)).toEqual(['src/tier.ts', 'docs/tier.md']);
  });

  it('still offers files in an editor with no workspace symbol provider', async () => {
    vi.mocked(vscode.commands.executeCommand).mockRejectedValue(
      new Error('command not found: vscode.executeWorkspaceSymbolProvider'),
    );
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
      vscode.Uri.file(path.join(root, 'src/tier.ts')),
    ]);

    const targets = await searchMentionTargets('tier');

    expect(targets.map((target) => target.path)).toEqual(['src/tier.ts']);
  });

  it('withholds ignored files even when the language server offers them', async () => {
    await fs.writeFile(path.join(root, '.gitignore'), 'src/tier.ts\n');
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      symbol('Tier', vscode.SymbolKind.Class, path.join(root, 'src/tier.ts'), [0, 0], [0, 0]),
    ]);
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
      vscode.Uri.file(path.join(root, 'src/tier.ts')),
    ]);

    expect(await searchMentionTargets('tier')).toEqual([]);
  });

  it('withholds a symbol offered through a credential symlink', async () => {
    await fs.writeFile(path.join(root, '.env'), 'controlled credential');
    const alias = path.join(root, 'alias.ts');
    await fs.symlink(path.join(root, '.env'), alias);
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      symbol('Tier', vscode.SymbolKind.Class, alias, [0, 0], [0, 0]),
    ]);

    expect(await searchMentionTargets('tier')).toEqual([]);
  });

  it('does not offer the same file and range twice', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      symbol('Tier', vscode.SymbolKind.Class, path.join(root, 'src/tier.ts'), [0, 0], [0, 0]),
      symbol('Tier', vscode.SymbolKind.Interface, path.join(root, 'src/tier.ts'), [0, 0], [0, 0]),
    ]);

    const targets = await searchMentionTargets('tier');

    expect(targets).toHaveLength(1);
  });
});
