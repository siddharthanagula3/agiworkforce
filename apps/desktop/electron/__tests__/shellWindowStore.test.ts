import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MAX_SECONDARY_PANEL_WIDTH, MIN_SECONDARY_PANEL_WIDTH } from '../windowState';

let userData = '';
vi.mock('electron', () => ({ app: { getPath: () => userData } }));

beforeEach(() => {
  userData = mkdtempSync(path.join(tmpdir(), 'agi-shell-window-store-'));
});

describe('the layout the shell holds for every window', () => {
  it('gives back what was written, across a fresh read of the file', async () => {
    const { readShellLayout, writeShellLayout } = await import('../shellWindowStore');

    expect(writeShellLayout({ sidebarCollapsed: true, secondaryPanelWidth: 380 })).toEqual({
      sidebarCollapsed: true,
      secondaryPanelWidth: 380,
    });
    expect(readShellLayout()).toEqual({ sidebarCollapsed: true, secondaryPanelWidth: 380 });
  });

  it('changes only the value it was given', async () => {
    const { readShellLayout, writeShellLayout } = await import('../shellWindowStore');

    writeShellLayout({ sidebarCollapsed: true, secondaryPanelWidth: 380 });
    writeShellLayout({ sidebarCollapsed: false });

    expect(readShellLayout()).toEqual({ sidebarCollapsed: false, secondaryPanelWidth: 380 });
  });

  it('holds a panel width the layout can actually draw', async () => {
    const { writeShellLayout } = await import('../shellWindowStore');

    expect(writeShellLayout({ secondaryPanelWidth: 4 }).secondaryPanelWidth).toBe(
      MIN_SECONDARY_PANEL_WIDTH,
    );
    expect(writeShellLayout({ secondaryPanelWidth: 9_000 }).secondaryPanelWidth).toBe(
      MAX_SECONDARY_PANEL_WIDTH,
    );
    expect(writeShellLayout({ secondaryPanelWidth: 'wide' }).secondaryPanelWidth).toBeNull();
  });

  it('keeps the frames a window wrote when the layout changes', async () => {
    const { patchShellWindowState, readShellWindowState, writeShellLayout, windowStatePath } =
      await import('../shellWindowStore');

    patchShellWindowState({
      frames: {
        '1512x920@0,25': { x: 1, y: 2, width: 900, height: 700, maximized: false, updatedAt: 5 },
      },
    });
    writeShellLayout({ sidebarCollapsed: true });

    expect(Object.keys(readShellWindowState().frames)).toEqual(['1512x920@0,25']);
    expect(windowStatePath().endsWith('window-state.json')).toBe(true);
  });

  it('starts from the defaults rather than throwing on a corrupt file', async () => {
    const { readShellLayout, windowStatePath } = await import('../shellWindowStore');
    writeFileSync(windowStatePath(), '{ not json', 'utf8');

    expect(readShellLayout()).toEqual({ sidebarCollapsed: null, secondaryPanelWidth: null });
  });
});
