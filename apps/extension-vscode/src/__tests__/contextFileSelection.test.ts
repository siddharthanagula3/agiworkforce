import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  ContextPanelProvider,
  validateWorkspaceContextFile,
} from '../features/trees/contextPanelProvider';
import { HOST_CUSTOM_INSTRUCTIONS_KEY } from '../features/instructions';

describe('workspace context-file selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
      type: vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: 12,
    });
  });

  it('accepts an ordinary file inside an open workspace', async () => {
    await expect(
      validateWorkspaceContextFile(vscode.Uri.file('/workspace/src/app.ts')),
    ).resolves.toEqual({
      ok: true,
      uri: vscode.Uri.file('/workspace/src/app.ts'),
    });
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

    const result = await validateWorkspaceContextFile(vscode.Uri.file('/workspace/src'));

    expect(result).toEqual({
      ok: false,
      message: 'Choose a file. Folder context is not supported by the local runtime.',
    });
  });

  it('does not add a rejected path to the context provider', async () => {
    const provider = new ContextPanelProvider();
    const addFile = vi.spyOn(provider, 'addFile');
    const result = await validateWorkspaceContextFile(vscode.Uri.file('/workspace/.env'));

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
