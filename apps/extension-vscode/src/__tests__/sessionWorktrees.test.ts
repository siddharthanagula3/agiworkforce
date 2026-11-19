import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CliCapabilityAdapter } from '../features/surfaces';
import { manageSessionWorktrees } from '../features/surfaces/sessionWorktrees';
import type { LocalRuntimePool } from '../integrations/localRuntimePool';

const FOLDER_A = { uri: vscode.Uri.file('/repo-a'), name: 'repo-a', index: 0 };
const FOLDER_B = { uri: vscode.Uri.file('/repo-b'), name: 'repo-b', index: 1 };

const REVIEW = {
  name: 'review',
  branch: 'agi/review',
  path: '/repo-a/.agi/worktrees/review',
  hasWork: true,
};

function editorIn(folder: typeof FOLDER_A): unknown {
  return { document: { uri: vscode.Uri.file(`${folder.uri.fsPath}/file.ts`) } };
}

function client(
  label: string,
  calls: string[],
  listed: () => Promise<unknown>,
): Record<string, unknown> {
  return {
    initialize: async () => ({ capabilities: { worktrees: true } }),
    listWorktrees: async () => {
      calls.push(`${label}:list`);
      return listed();
    },
    removeWorktree: async (name: string, force: boolean) => {
      calls.push(`${label}:remove:${name}:${String(force)}`);
      return [];
    },
  };
}

describe('Session Worktrees workspace binding', () => {
  beforeEach(() => {
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [FOLDER_A, FOLDER_B];
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockImplementation(((uri: vscode.Uri) =>
      [FOLDER_A, FOLDER_B].find((folder) =>
        uri.fsPath.startsWith(folder.uri.fsPath),
      )) as typeof vscode.workspace.getWorkspaceFolder);
    (vscode.window as { activeTextEditor: unknown }).activeTextEditor = editorIn(FOLDER_A);
  });

  afterEach(() => {
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
    (vscode.window as { activeTextEditor: unknown }).activeTextEditor = undefined;
    vi.restoreAllMocks();
  });

  it('removes from the repository that was listed when the active editor moves mid-list', async () => {
    const calls: string[] = [];
    let releaseList!: () => void;
    const listGate = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    const clients: Record<string, Record<string, unknown>> = {
      '/repo-a': client('a', calls, async () => {
        await listGate;
        return [REVIEW];
      }),
      '/repo-b': client('b', calls, async () => []),
    };
    const pool = {
      forWorkspace: (root: string) => clients[root],
    } as unknown as LocalRuntimePool;
    vi.mocked(vscode.window.showQuickPick)
      .mockImplementationOnce((async (items: readonly { worktree?: unknown }[]) =>
        items.find((item) => item.worktree !== undefined)) as never)
      .mockImplementationOnce((async (items: readonly { id: string }[]) =>
        items.find((item) => item.id === 'remove')) as never);
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
      'Remove and discard changes' as never,
    );

    const managing = manageSessionWorktrees(new CliCapabilityAdapter(pool));
    await vi.waitFor(() => expect(calls).toContain('a:list'));
    (vscode.window as { activeTextEditor: unknown }).activeTextEditor = editorIn(FOLDER_B);
    releaseList();
    await managing;

    expect(calls).toEqual(['a:list', 'a:remove:review:true']);
  });

  it('stops without a request when no workspace can be resolved', async () => {
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
    const forWorkspace = vi.fn();
    const pool = { forWorkspace } as unknown as LocalRuntimePool;

    await manageSessionWorktrees(new CliCapabilityAdapter(pool));

    expect(forWorkspace).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Open a trusted workspace'),
    );
  });
});
