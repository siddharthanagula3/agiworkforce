import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  ContextPanelProvider,
  validateWorkspaceContextFile,
} from '../features/trees/contextPanelProvider';

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
});
