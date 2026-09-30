import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  ContextPanelProvider,
  validateWorkspaceContextFile,
} from '../features/trees/contextPanelProvider';
import { HOST_CUSTOM_INSTRUCTIONS_KEY } from '../features/instructions';

describe('workspace context-file selection', () => {
  let root: string;
  let originalFolders: typeof vscode.workspace.workspaceFolders;
  let originalFolder: ((uri: vscode.Uri) => vscode.WorkspaceFolder | undefined) | undefined;

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-reference-')));
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(path.join(root, 'src/app.ts'), 'controlled ordinary code');
    execFileSync('git', ['-c', 'init.templateDir=', 'init', '-q'], { cwd: root });
    originalFolders = vscode.workspace.workspaceFolders;
    originalFolder = vi.mocked(vscode.workspace.getWorkspaceFolder).getMockImplementation();
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockImplementation((uri) =>
      uri.fsPath.startsWith(`${root}${path.sep}`)
        ? { name: 'workspace', index: 0, uri: vscode.Uri.file(root) }
        : undefined,
    );
    vi.clearAllMocks();
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file(root) },
    ];
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
      type: vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: 12,
    });
  });

  afterEach(async () => {
    vscode.workspace.workspaceFolders = originalFolders;
    if (originalFolder !== undefined)
      vi.mocked(vscode.workspace.getWorkspaceFolder).mockImplementation(originalFolder);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('accepts an ordinary file inside an open workspace', async () => {
    await expect(
      validateWorkspaceContextFile(vscode.Uri.file(path.join(root, 'src/app.ts'))),
    ).resolves.toEqual({
      ok: true,
      uri: vscode.Uri.file(path.join(root, 'src/app.ts')),
    });
  });

  it('pins an ordinary symlink reference to its validated target', async () => {
    const alias = path.join(root, 'alias.ts');
    const target = path.join(root, 'src/app.ts');
    await fs.symlink(target, alias);

    expect(await validateWorkspaceContextFile(vscode.Uri.file(alias))).toEqual({
      ok: true,
      uri: vscode.Uri.file(target),
    });
  });

  it('refuses unresolved references even when an editor reports cached file metadata', async () => {
    expect(
      (await validateWorkspaceContextFile(vscode.Uri.file(path.join(root, 'missing.ts')))).ok,
    ).toBe(false);
  });

  it('refuses an explicit reference to a gitignored file', async () => {
    const file = path.join(root, 'private.txt');
    await fs.writeFile(file, 'CONTROLLED_CREDENTIAL_CONTENT');
    await fs.writeFile(path.join(root, '.gitignore'), 'private.txt\n');

    expect((await validateWorkspaceContextFile(vscode.Uri.file(file))).ok).toBe(false);
  });

  it('visibly rejects files outside every open workspace', async () => {
    const result = await validateWorkspaceContextFile(vscode.Uri.file('/tmp/secrets.txt'));

    expect(result).toEqual({
      ok: false,
      message: 'Path is not inside any open workspace folder.',
    });
  });

  it('rejects folders instead of silently pinning an unusable path', async () => {
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValueOnce({
      type: vscode.FileType.Directory,
      ctime: 0,
      mtime: 0,
      size: 0,
    });

    const result = await validateWorkspaceContextFile(vscode.Uri.file(path.join(root, 'src')));

    expect(result).toEqual({
      ok: false,
      message: 'Choose a file. Folder context is not supported by the local runtime.',
    });
  });

  it('does not add a rejected path to the context provider', async () => {
    const provider = new ContextPanelProvider();
    const addFile = vi.spyOn(provider, 'addFile');
    const result = await validateWorkspaceContextFile(vscode.Uri.file(path.join(root, '.env')));

    if (result.ok) provider.addFile(result.uri);

    expect(result.ok).toBe(false);
    expect(addFile).not.toHaveBeenCalled();
    provider.dispose();
  });

  it('shows the exact effective custom prelude beside runtime-discovered project sources', async () => {
    const context = new vscode.ExtensionContext();
    await context.globalState.update(
      HOST_CUSTOM_INSTRUCTIONS_KEY,
      'Prefer focused integration tests.',
    );
    vi.mocked(vscode.workspace.fs.readFile).mockImplementation(async (uri) => {
      if (uri.fsPath.endsWith('AGENTS.md')) return Buffer.from('Use pnpm.');
      throw new Error('not found');
    });
    const provider = new ContextPanelProvider(context);

    await provider.refreshInstructionContext();
    const instructionGroup = provider
      .getChildren()
      .find((item) => String(item.label).startsWith('Instructions'));
    expect(instructionGroup).toBeDefined();
    const instructionItems = provider.getChildren(instructionGroup);

    expect(instructionItems.map((item) => item.label)).toEqual([
      'Custom instructions',
      'AGENTS.md',
    ]);
    expect(String(instructionItems[0]?.tooltip)).toContain('Prefer focused integration tests.');
    expect(String(instructionItems[1]?.tooltip)).toContain('Use pnpm.');
    provider.dispose();
  });
});
