import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ execFile: execFileMock }));

import { ContextBuilder } from '../data/contextBuilder';

type ExecCallback = (error: Error | null, result?: { stdout: string; stderr: string }) => void;

function gitReturns(outputs: { status: string; diff?: string }) {
  execFileMock.mockImplementation(
    (_command: string, args: string[], _options: unknown, callback: ExecCallback) => {
      callback(null, {
        stdout: args[0] === 'status' ? outputs.status : (outputs.diff ?? ''),
        stderr: '',
      });
    },
  );
}

afterEach(() => {
  execFileMock.mockReset();
  (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
});

describe('ContextBuilder.getGitContext', () => {
  it('reads a worktree-only change on the first status line as modified, path intact', async () => {
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
      { uri: vscode.Uri.file('/repo'), name: 'repo', index: 0 },
    ];
    gitReturns({ status: ' M src/a.ts\nM  src/b.ts\n?? notes.md\n' });

    const context = await new ContextBuilder().getGitContext();

    expect(context).toContain('Modified (1): src/a.ts');
    expect(context).toContain('Staged (1): src/b.ts');
    expect(context).toContain('Untracked (1): notes.md');
  });
});
