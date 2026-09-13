import { dialog, type BrowserWindow } from 'electron';
import { stat } from 'node:fs/promises';
import { grantRoot, WorkspaceGrantRefused } from './runtime/workspaceStore';

const GRANT_TITLE = 'Approve this folder?';
const APPROVE_LABEL = 'Approve folder';
const CANCEL_LABEL = 'Cancel';
const REFUSED_TITLE = 'That folder was not approved';

async function directoriesAmong(paths: readonly string[]): Promise<string[]> {
  const directories: string[] = [];
  for (const candidate of paths) {
    try {
      if ((await stat(candidate)).isDirectory()) directories.push(candidate);
    } catch {
      continue;
    }
  }
  return directories;
}

/**
 * A folder dropped on the window asks for the same grant the picker asks for.
 * Files are left alone: the page's own drop handler attaches those, and this
 * must not take a drop away from it.
 */
export async function handleWorkspaceDrop(
  window: BrowserWindow | null,
  paths: readonly string[],
): Promise<void> {
  const directories = await directoriesAmong(paths);
  if (directories.length === 0 || !window || window.isDestroyed()) return;

  for (const directory of directories) {
    const { response } = await dialog.showMessageBox(window, {
      type: 'question',
      title: GRANT_TITLE,
      message: `Let AGI Cloud open ${directory}?`,
      detail:
        'AGI can then read and write files inside this folder when you ask it to, and you can attach them from the composer. Remove the folder any time in Settings, under Capabilities.',
      buttons: [APPROVE_LABEL, CANCEL_LABEL],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response !== 0) continue;

    try {
      await grantRoot(directory);
    } catch (error) {
      const detail =
        error instanceof WorkspaceGrantRefused
          ? error.message
          : 'That folder could not be approved.';
      await dialog.showMessageBox(window, {
        type: 'info',
        title: REFUSED_TITLE,
        message: detail,
        buttons: ['OK'],
      });
    }
  }
}
