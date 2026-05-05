/**
 * workspaceFolders.test.ts — Multi-root workspace helpers
 *
 * Locks in the C4 fix: callsites that previously did `workspaceFolders[0]`
 * silently scoped to the first root in a multi-root workspace.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  getActiveWorkspaceFolder,
  getActiveWorkspaceFolderSync,
  getAllWorkspaceFolders,
  getWorkspaceDisplayName,
  getWorkspaceFolderForUri,
  isPathInWorkspace,
} from '../utils/workspaceFolders';

const folderA = {
  uri: vscode.Uri.file('/repo/proj-frontend'),
  name: 'proj-frontend',
  index: 0,
};
const folderB = {
  uri: vscode.Uri.file('/repo/proj-backend'),
  name: 'proj-backend',
  index: 1,
};

function setFolders(folders: Array<{ uri: vscode.Uri; name: string; index: number }> | undefined) {
  (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = folders;
}
function setActiveEditor(uri: vscode.Uri | undefined) {
  (vscode.window as { activeTextEditor: unknown }).activeTextEditor =
    uri === undefined ? undefined : { document: { uri } };
}
function setGetWorkspaceFolderResult(folder: { uri: vscode.Uri; name: string } | undefined) {
  (vscode.workspace.getWorkspaceFolder as ReturnType<typeof vi.fn>).mockReturnValue(folder);
}

describe('workspaceFolders helpers', () => {
  beforeEach(() => {
    setFolders(undefined);
    setActiveEditor(undefined);
    setGetWorkspaceFolderResult(undefined);
    (vscode.workspace as { name: string | undefined }).name = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getActiveWorkspaceFolderSync', () => {
    it('returns undefined when no workspace open', () => {
      expect(getActiveWorkspaceFolderSync()).toBeUndefined();
    });

    it('returns single folder when only one root', () => {
      setFolders([folderA]);
      expect(getActiveWorkspaceFolderSync()?.name).toBe('proj-frontend');
    });

    it('returns active editor folder in multi-root', () => {
      setFolders([folderA, folderB]);
      setActiveEditor(vscode.Uri.file('/repo/proj-backend/src/auth.ts'));
      setGetWorkspaceFolderResult(folderB);
      expect(getActiveWorkspaceFolderSync()?.name).toBe('proj-backend');
    });

    it('returns undefined in multi-root with no active editor', () => {
      setFolders([folderA, folderB]);
      expect(getActiveWorkspaceFolderSync()).toBeUndefined();
    });

    it('returns undefined when active editor is outside any folder', () => {
      setFolders([folderA, folderB]);
      setActiveEditor(vscode.Uri.file('/tmp/scratch.ts'));
      setGetWorkspaceFolderResult(undefined);
      expect(getActiveWorkspaceFolderSync()).toBeUndefined();
    });
  });

  describe('getActiveWorkspaceFolder (interactive)', () => {
    it('falls back to QuickPick in multi-root with no active editor', async () => {
      setFolders([folderA, folderB]);
      const showQuickPick = vscode.window.showQuickPick as ReturnType<typeof vi.fn>;
      showQuickPick.mockResolvedValueOnce({ folder: folderB });

      const result = await getActiveWorkspaceFolder();
      expect(result?.name).toBe('proj-backend');
      expect(showQuickPick).toHaveBeenCalledOnce();
    });

    it('returns undefined when user cancels QuickPick', async () => {
      setFolders([folderA, folderB]);
      const showQuickPick = vscode.window.showQuickPick as ReturnType<typeof vi.fn>;
      showQuickPick.mockResolvedValueOnce(undefined);

      expect(await getActiveWorkspaceFolder()).toBeUndefined();
    });

    it('does not prompt when only one folder open', async () => {
      setFolders([folderA]);
      const showQuickPick = vscode.window.showQuickPick as ReturnType<typeof vi.fn>;
      const result = await getActiveWorkspaceFolder();
      expect(result?.name).toBe('proj-frontend');
      expect(showQuickPick).not.toHaveBeenCalled();
    });
  });

  describe('isPathInWorkspace', () => {
    it('rejects path outside any folder', () => {
      setFolders([folderA, folderB]);
      expect(isPathInWorkspace('/etc/passwd')).toBe(false);
      expect(isPathInWorkspace('/tmp/x')).toBe(false);
    });

    it('accepts path inside a folder', () => {
      setFolders([folderA, folderB]);
      expect(isPathInWorkspace('/repo/proj-backend/src/auth.ts')).toBe(true);
      expect(isPathInWorkspace('/repo/proj-frontend')).toBe(true);
    });

    it('avoids the proj-frontend / proj-frontend-other false positive', () => {
      setFolders([{ ...folderA, uri: vscode.Uri.file('/repo/proj') }]);
      expect(isPathInWorkspace('/repo/proj-other/src/file.ts')).toBe(false);
      expect(isPathInWorkspace('/repo/proj/src/file.ts')).toBe(true);
    });

    it('returns false when no folders open', () => {
      expect(isPathInWorkspace('/anywhere')).toBe(false);
    });
  });

  describe('getWorkspaceDisplayName', () => {
    it('returns "<no workspace>" when no folders open', () => {
      expect(getWorkspaceDisplayName()).toBe('<no workspace>');
    });

    it('returns active folder name when active editor resolves', () => {
      setFolders([folderA, folderB]);
      setActiveEditor(vscode.Uri.file('/repo/proj-backend/x.ts'));
      setGetWorkspaceFolderResult(folderB);
      expect(getWorkspaceDisplayName()).toBe('proj-backend');
    });

    it('falls back to workspace.name in multi-root with no active editor', () => {
      setFolders([folderA, folderB]);
      (vscode.workspace as { name: string | undefined }).name = 'my-workspace.code-workspace';
      expect(getWorkspaceDisplayName()).toBe('my-workspace.code-workspace');
    });

    it('falls back to "<N roots>" if workspace.name is unset in multi-root', () => {
      setFolders([folderA, folderB]);
      expect(getWorkspaceDisplayName()).toBe('<2 roots>');
    });

    it('returns folder name when only one root', () => {
      setFolders([folderA]);
      expect(getWorkspaceDisplayName()).toBe('proj-frontend');
    });
  });

  describe('getAllWorkspaceFolders', () => {
    it('returns empty array when no folders open', () => {
      expect(getAllWorkspaceFolders()).toEqual([]);
    });

    it('returns all open folders', () => {
      setFolders([folderA, folderB]);
      expect(getAllWorkspaceFolders()).toHaveLength(2);
    });
  });

  describe('getWorkspaceFolderForUri', () => {
    it('delegates to vscode.workspace.getWorkspaceFolder', () => {
      const uri = vscode.Uri.file('/repo/proj-backend/x.ts');
      setGetWorkspaceFolderResult(folderB);
      const result = getWorkspaceFolderForUri(uri);
      expect(result?.name).toBe('proj-backend');
      expect(vscode.workspace.getWorkspaceFolder).toHaveBeenCalledWith(uri);
    });

    it('returns undefined when not inside any folder', () => {
      const uri = vscode.Uri.file('/tmp/x.ts');
      setGetWorkspaceFolderResult(undefined);
      expect(getWorkspaceFolderForUri(uri)).toBeUndefined();
    });
  });
});
