import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

let userData = '';
const beforeRename = vi.hoisted(() => vi.fn<(target: string) => void>());

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return {
    ...fs,
    renameSync: (...args: Parameters<typeof fs.renameSync>) => {
      beforeRename(String(args[1]));
      fs.renameSync(...args);
    },
  };
});

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  dialog: { showMessageBox: vi.fn() },
}));

const { grantRoot, listRoots, revokeRoot } = await import('../runtime/workspaceStore');
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
  });

  it('are written down once, not once per window', async () => {
    const first = await grantRoot(project('ledger'));
    const second = await grantRoot(project('atlas'));

    const stored = JSON.parse(
      readFileSync(path.join(userData, 'desktop-workspaces.json'), 'utf8'),
    ) as { id: string }[];

    expect(stored.map((root) => root.id).sort()).toEqual([first.id, second.id].sort());
  });

  it('preserves the last saved folder approvals if a replacement fails', async () => {
    const first = await grantRoot(project('ledger'));
    const other = project('atlas');
    const file = path.join(userData, 'desktop-workspaces.json');
    const original = readFileSync(file, 'utf8');
    const valuesBeforeReplacement: string[] = [];
    const failReplacement = () =>
      beforeRename.mockImplementationOnce((target) => {
        valuesBeforeReplacement.push(readFileSync(target, 'utf8'));
        throw new Error('simulated rename failure');
      });

    failReplacement();
    await expect(grantRoot(other)).rejects.toThrow('Could not save approved folders.');
    failReplacement();
    expect(() => revokeRoot(first.id)).toThrow('Could not save approved folders.');

    expect(valuesBeforeReplacement).toEqual([original, original]);
    expect(listRoots()).toEqual([first]);
    expect(readFileSync(file, 'utf8')).toBe(original);
    expect(readdirSync(userData).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
    expect((await grantRoot(other)).name).toBe('atlas');
    expect(revokeRoot(first.id)).toBe(true);
  });

  it('saves repository metadata together with the approval', async () => {
    const folder = await grantRoot(project('ledger'));
    const repository = await grantRoot(folder.path, 'repository');
    expect(repository).toMatchObject({ id: folder.id, gitRoot: folder.path });
    expect(
      JSON.parse(readFileSync(path.join(userData, 'desktop-workspaces.json'), 'utf8')),
    ).toEqual([repository]);
  });

  it('are withdrawn everywhere at once when one is revoked', async () => {
    const granted = await grantRoot(project('ledger'));

    expect(revokeRoot(granted.id)).toBe(true);
    expect(listRoots()).toEqual([]);
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
