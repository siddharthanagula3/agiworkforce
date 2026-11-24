import { PRODUCT_NAMES } from '@agiworkforce/types';
import * as vscode from 'vscode';

import type { WorktreeSummary } from '../../integrations/localRuntimeClient';
import { CLI_WORKSPACE_REQUIREMENT, type CliCapabilityAdapter } from './cliCapabilities';

const TITLE = `${PRODUCT_NAMES.code}, Session Worktrees`;

async function openWorktree(worktree: WorktreeSummary): Promise<void> {
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(worktree.path), {
    forceNewWindow: true,
  });
}

export async function newSessionInWorktree(
  cli: CliCapabilityAdapter,
  name?: string,
): Promise<void> {
  const created = await cli.call<WorktreeSummary>('worktreeCreate', name);
  if (created.status !== 'ok') {
    void vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: ${created.reason}`);
    return;
  }
  await openWorktree(created.value);
}

async function removeWorktree(cli: CliCapabilityAdapter, worktree: WorktreeSummary): Promise<void> {
  const action = worktree.hasWork ? 'Remove and discard changes' : 'Remove';
  const confirmed = await vscode.window.showWarningMessage(
    `Remove the worktree "${worktree.name}"?`,
    {
      modal: true,
      detail: worktree.hasWork
        ? `It has changes or commits that are not on its base. Removing it deletes them and the branch ${worktree.branch}.`
        : `Its folder and the branch ${worktree.branch} are deleted.`,
    },
    action,
  );
  if (confirmed !== action) return;
  const removed = await cli.call<WorktreeSummary[]>(
    'worktreeRemove',
    worktree.name,
    worktree.hasWork,
  );
  if (removed.status !== 'ok') {
    void vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: ${removed.reason}`);
    return;
  }
  void vscode.window.showInformationMessage(`${PRODUCT_NAMES.code}: removed ${worktree.name}.`);
}

export async function manageSessionWorktrees(adapter: CliCapabilityAdapter): Promise<void> {
  const cli = await adapter.pinToWorkspace();
  if (cli === undefined) {
    void vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: ${CLI_WORKSPACE_REQUIREMENT}`);
    return;
  }
  const listed = await cli.call<WorktreeSummary[]>('worktreeList');
  if (listed.status !== 'ok') {
    void vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: ${listed.reason}`);
    return;
  }
  type Item = vscode.QuickPickItem & { worktree?: WorktreeSummary; create?: 'automatic' | 'named' };
  const items: Item[] = [
    {
      label: '$(add) New session in a worktree',
      description: 'Its own folder and branch, opened in a new window',
      create: 'automatic',
    },
    {
      label: '$(tag) Open or create a named worktree',
      description: 'Reuse an existing checkout or choose a name for a new one',
      create: 'named',
    },
    ...listed.value.map((worktree) => ({
      label: `$(git-branch) ${worktree.name}`,
      description: worktree.branch,
      ...(worktree.hasWork ? { detail: 'Has changes or commits that are not on its base' } : {}),
      worktree,
    })),
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title: TITLE,
    placeHolder:
      listed.value.length === 0
        ? 'No session worktrees yet'
        : 'Choose a worktree to open or remove',
  });
  if (picked === undefined) return;
  if (picked.create === 'automatic') {
    await newSessionInWorktree(cli);
    return;
  }
  if (picked.create === 'named') {
    const name = await vscode.window.showInputBox({
      title: TITLE,
      prompt: 'Enter a worktree name',
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() === '' ? 'Enter a worktree name.' : undefined),
    });
    if (name?.trim()) await newSessionInWorktree(cli, name.trim());
    return;
  }
  const worktree = picked.worktree;
  if (worktree === undefined) return;
  const action = await vscode.window.showQuickPick(
    [
      { label: '$(window) Open in a new window', id: 'open' as const },
      { label: '$(trash) Remove', id: 'remove' as const },
    ],
    { title: `${TITLE}: ${worktree.name}` },
  );
  if (action?.id === 'open') await openWorktree(worktree);
  if (action?.id === 'remove') await removeWorktree(cli, worktree);
}
