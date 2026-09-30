import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as vscode from 'vscode';
import { vi } from 'vitest';

export async function workspaceFileFixture(files: readonly string[]) {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'agi-reference-fixture-')),
  );
  for (const file of files) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), 'controlled ordinary file');
  }
  execFileSync('git', ['-c', 'init.templateDir=', 'init', '-q'], { cwd: root });
  const folders = vscode.workspace.workspaceFolders;
  const folder = vi.mocked(vscode.workspace.getWorkspaceFolder).getMockImplementation();
  vscode.workspace.workspaceFolders = [{ name: 'workspace', index: 0, uri: vscode.Uri.file(root) }];
  vi.mocked(vscode.workspace.getWorkspaceFolder).mockImplementation((uri) =>
    uri.fsPath.startsWith(`${root}${path.sep}`)
      ? { name: 'workspace', index: 0, uri: vscode.Uri.file(root) }
      : undefined,
  );
  return {
    root,
    async dispose() {
      vscode.workspace.workspaceFolders = folders;
      if (folder === undefined) vi.mocked(vscode.workspace.getWorkspaceFolder).mockReset();
      else vi.mocked(vscode.workspace.getWorkspaceFolder).mockImplementation(folder);
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}
