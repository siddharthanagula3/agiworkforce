import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

let userData = '';

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  dialog: { showMessageBox: vi.fn() },
}));

const { findContainingRoot, grantRoot, listRoots, revokeRoot } =
  await import('../runtime/workspaceStore');
const { getPermissionState, recordDecision } = await import('../runtime/permissionManager');

const scratch: string[] = [];

function project(name: string): string {
  const home = mkdtempSync(path.join(tmpdir(), 'agi-workspace-'));
  scratch.push(home);
  const folder = path.join(home, 'code', name);
  mkdirSync(folder, { recursive: true });
  return folder;
}

beforeEach(() => {
  userData = mkdtempSync(path.join(tmpdir(), 'agi-userdata-'));
  scratch.push(userData);
  for (const root of listRoots()) revokeRoot(root.id);
});

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('the workspaces the app has been given', () => {
  it('belong to the app, so every window sees the same ones', async () => {
    const granted = await grantRoot(project('ledger'));

    // Two callers, no window between them and the store: the grant a user made
    // in one window is the grant the next window already has.
    expect(listRoots().map((root) => root.id)).toEqual([granted.id]);
    expect(listRoots().map((root) => root.id)).toEqual([granted.id]);
    expect(findContainingRoot(path.join(granted.path, 'src', 'index.ts'))?.id).toBe(granted.id);
  });

  it('are written down once, not once per window', async () => {
    const first = await grantRoot(project('ledger'));
    const second = await grantRoot(project('atlas'));

    const stored = JSON.parse(
      readFileSync(path.join(userData, 'desktop-workspaces.json'), 'utf8'),
    ) as { id: string }[];

    expect(stored.map((root) => root.id).sort()).toEqual([first.id, second.id].sort());
  });

  it('are withdrawn everywhere at once when one is revoked', async () => {
    const granted = await grantRoot(project('ledger'));

    expect(revokeRoot(granted.id)).toBe(true);
    expect(listRoots()).toEqual([]);
    expect(findContainingRoot(path.join(granted.path, 'src'))).toBeUndefined();
  });

  it('take every grant made on them along when one is revoked, and leave a refusal standing', async () => {
    const ledger = await grantRoot(project('ledger'));
    const atlas = await grantRoot(project('atlas'));
    const ledgerScope = { kind: 'workspace', target: ledger.path } as const;
    const atlasScope = { kind: 'workspace', target: atlas.path } as const;
    recordDecision('filesystem.write', ledgerScope, 'granted', 'always');
    recordDecision('shell.execute', ledgerScope, 'granted', 'session');
    recordDecision('filesystem.write', atlasScope, 'granted', 'always');
    recordDecision('git.write', ledgerScope, 'denied', 'session');

    expect(revokeRoot(ledger.id)).toBe(true);

    expect(getPermissionState('filesystem.write', ledgerScope)).toBe('prompt');
    expect(getPermissionState('shell.execute', ledgerScope)).toBe('prompt');
    expect(getPermissionState('git.write', ledgerScope)).toBe('denied');
    expect(getPermissionState('filesystem.write', atlasScope)).toBe('granted');

    const again = await grantRoot(ledger.path);
    expect(getPermissionState('filesystem.write', { kind: 'workspace', target: again.path })).toBe(
      'prompt',
    );
  });

  it('answer false, and forget nothing, for a folder that was never approved', async () => {
    const atlas = await grantRoot(project('atlas'));
    const scope = { kind: 'workspace', target: atlas.path } as const;
    recordDecision('filesystem.write', scope, 'granted', 'always');

    expect(revokeRoot('not-a-root')).toBe(false);
    expect(getPermissionState('filesystem.write', scope)).toBe('granted');
  });

  it('refuse a location too broad to be one project, or where keys are kept', async () => {
    for (const location of [homedir(), path.dirname(homedir()), '/private', '/tmp']) {
      if (!existsSync(location)) continue;
      await expect(grantRoot(location), location).rejects.toThrow(
        /cannot be approved as a workspace/,
      );
    }
    for (const kept of ['.ssh', 'Library']) {
      const location = path.join(homedir(), kept);
      if (!existsSync(location)) continue;
      await expect(grantRoot(location), location).rejects.toThrow(
        /cannot be approved as a workspace/,
      );
    }
  });
});
