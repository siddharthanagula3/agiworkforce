import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { openTurnChanges, writtenFilePath } from '../features/sidebar-webview/turnChanges';

describe('files a reply changed', () => {
  it('reads the path a write tool names, and nothing from other tools', () => {
    expect(writtenFilePath('Edit File', { path: 'src/math.ts' })).toBe('src/math.ts');
    expect(writtenFilePath('write_file', { file_path: '/repo/new.ts' })).toBe('/repo/new.ts');
    expect(writtenFilePath('read_file', { path: 'src/math.ts' })).toBeUndefined();
    expect(writtenFilePath('apply_patch', { patch: '*** Begin Patch' })).toBeUndefined();
    expect(writtenFilePath('edit_file', null)).toBeUndefined();
  });
});

describe('reviewing what a reply changed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens one multi-file diff of every changed file against its last commit', async () => {
    const toGitUri = vi.fn((uri: vscode.Uri, ref: string) =>
      vscode.Uri.parse(`git:${uri.path}?ref=${ref}`),
    );
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: true,
      exports: { getAPI: () => ({ toGitUri }) },
    } as never);

    await openTurnChanges(['/repo/src/a.ts', '/repo/src/b.ts']);

    expect(toGitUri).toHaveBeenCalledTimes(2);
    expect(toGitUri.mock.calls.map((call) => call[1])).toEqual(['HEAD', 'HEAD']);
    const call = vi
      .mocked(vscode.commands.executeCommand)
      .mock.calls.find((entry) => entry[0] === 'vscode.changes');
    expect(call?.[1]).toBe('Changes in 2 files');
    expect((call?.[2] as unknown[]).length).toBe(2);
  });
});
