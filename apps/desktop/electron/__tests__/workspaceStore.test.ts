import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

let userData = '';

vi.mock('electron', () => ({
  app: { getPath: () => userData },
}));

const { findContainingRoot, grantRoot, listRoots, revokeRoot } =
  await import('../runtime/workspaceStore');

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

  it('refuse a location too broad to be one project', async () => {
    await expect(grantRoot(homedir())).rejects.toThrow(/too broad/);
  });
});
