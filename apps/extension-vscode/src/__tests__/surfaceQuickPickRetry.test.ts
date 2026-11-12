import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { SURFACE_REFRESH_COMMANDS, showSurfaceQuickPick } from '../features/surfaces/treeQuickPick';

describe('a failed surface list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reloads in place when its Retry row is chosen, instead of closing', async () => {
    const retry = new vscode.TreeItem('Cloud tasks could not be loaded');
    retry.command = { command: 'agi-workforce.refreshCloudTasks', title: 'Retry' };
    const loaded = new vscode.TreeItem('Fix the build');
    const getChildren = vi.fn().mockResolvedValueOnce([retry]).mockResolvedValueOnce([loaded]);
    const shown = showSurfaceQuickPick({
      title: 'Cloud tasks',
      placeholder: 'Pick a task',
      provider: { getChildren } as never,
    });
    const pick = vi.mocked(vscode.window.createQuickPick).mock.results.at(-1)?.value;
    await vi.waitFor(() => expect(pick?.items).toHaveLength(1));
    pick.selectedItems = [pick.items[0]];

    pick.fire('accept');

    await vi.waitFor(() =>
      expect(pick.items.map((item: vscode.QuickPickItem) => item.label)).toEqual(['Fix the build']),
    );
    expect(pick.shown).toBe(true);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'agi-workforce.refreshCloudTasks',
    );
    pick.hide();
    await shown;
  });

  it('keeps the refresh commands, which only a list can answer, out of the palette', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
    ) as { contributes: { menus: { commandPalette: Array<{ command: string; when?: string }> } } };
    for (const command of SURFACE_REFRESH_COMMANDS) {
      expect(pkg.contributes.menus.commandPalette).toContainEqual({ command, when: 'false' });
    }
  });
});
