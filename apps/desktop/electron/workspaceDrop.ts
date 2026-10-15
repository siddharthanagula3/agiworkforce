import { type BrowserWindow } from 'electron';
import { realpath, stat } from 'node:fs/promises';
import { grantRoot, WorkspaceGrantRefused } from './runtime/workspaceStore';
import { shownValue } from './runtime/dialogText';
import { showNativeMessage } from './runtime/nativeSurface';

const GRANT_TITLE = 'Approve this folder?';
const APPROVE_LABEL = 'Approve folder';
const CANCEL_LABEL = 'Cancel';
const CANCEL_BUTTON = 0;
const APPROVE_BUTTON = 1;
const REFUSED_TITLE = 'That folder was not approved';
const FOLDER_SHOWN = { head: 400, tail: 200 };

async function directoriesAmong(paths: readonly string[]): Promise<string[]> {
  const directories: string[] = [];
  // A touch drag and a multi-select drop both repeat a path, and one folder
  // must not ask for the same grant twice in the same drop.
  for (const candidate of new Set(paths)) {
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
 * must not take a drop away from it. Each grant is reported so open pages can
 * reread their folder lists.
 */
export async function handleWorkspaceDrop(
  window: BrowserWindow | null,
  paths: readonly string[],
  onGranted: (rootId: string) => void,
): Promise<void> {
  const directories = await directoriesAmong(paths);
  if (directories.length === 0 || !window || window.isDestroyed()) return;

  for (const dropped of directories) {
    // Each prompt awaits the user, and the window can be closed while it is up.
    if (window.isDestroyed()) return;
    let directory: string;
    try {
      directory = await realpath(dropped);
    } catch {
      continue;
    }
    const { response } = await showNativeMessage(window, {
      type: 'question',
      title: GRANT_TITLE,
      message: 'Let AGI Cloud open this folder?',
      detail: [
        'AGI can then read and write files inside this folder when you ask it to, and you can attach them from the composer. Remove the folder any time in Settings, under Capabilities.',
        [
          `Folder: ${shownValue(directory, FOLDER_SHOWN)}`,
          ...(directory === dropped
            ? []
            : [
                `You dropped: ${shownValue(dropped, FOLDER_SHOWN)}, which is a link to the folder above. The folder above is what is opened.`,
              ]),
        ].join('\n'),
      ].join('\n\n'),
      buttons: [CANCEL_LABEL, APPROVE_LABEL],
      defaultId: CANCEL_BUTTON,
      cancelId: CANCEL_BUTTON,
      noLink: true,
    });
    if (response !== APPROVE_BUTTON) continue;

    try {
      onGranted((await grantRoot(directory)).id);
    } catch (error) {
      const detail =
        error instanceof WorkspaceGrantRefused
          ? error.message
          : 'That folder could not be approved.';
      await showNativeMessage(window, {
        type: 'info',
        title: REFUSED_TITLE,
        message: detail,
        buttons: ['OK'],
      });
    }
  }
}
