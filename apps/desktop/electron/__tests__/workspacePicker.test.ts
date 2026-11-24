import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRoot, WorkspaceRootKind } from '@agiworkforce/local-runtime-contract';

const findRepositoryRoot = vi.fn<(directory: string) => Promise<string | null>>();
const stored = new Map<string, WorkspaceRoot>();

class WorkspaceGrantRefused extends Error {}

vi.mock('../runtime/gitService', () => ({ findRepositoryRoot }));
vi.mock('../runtime/workspaceStore', () => ({
  WorkspaceGrantRefused,
  grantRoot: vi.fn(async (selected: string, kind?: WorkspaceRootKind) => {
    const root: WorkspaceRoot = {
      id: `root:${selected}`,
      path: selected,
      name: selected.split('/').pop() ?? selected,
      grantedAtMs: 1,
      lastOpenedAtMs: 1,
      ...(kind === 'repository' ? { gitRoot: selected } : {}),
    };
    stored.set(root.id, root);
    return root;
  }),
}));

const { grantPickedRoot } = await import('../runtime/workspacePicker');

beforeEach(() => {
  stored.clear();
  findRepositoryRoot.mockReset();
});

describe('grantPickedRoot', () => {
  it('approves a folder exactly as chosen without asking git', async () => {
    const root = await grantPickedRoot('/work/notes', 'folder');
    expect(root.path).toBe('/work/notes');
    expect(root.gitRoot).toBeUndefined();
    expect(findRepositoryRoot).not.toHaveBeenCalled();
  });

  it('approves a repository at its top level even when a subfolder was chosen', async () => {
    findRepositoryRoot.mockResolvedValue('/work/app');
    const root = await grantPickedRoot('/work/app/src/lib', 'repository');
    expect(findRepositoryRoot).toHaveBeenCalledWith('/work/app/src/lib');
    expect(root).toMatchObject({ path: '/work/app', gitRoot: '/work/app', name: 'app' });
  });

  it('refuses a repository pick outside any git repository', async () => {
    findRepositoryRoot.mockResolvedValue(null);
    await expect(grantPickedRoot('/work/notes', 'repository')).rejects.toBeInstanceOf(
      WorkspaceGrantRefused,
    );
    expect(stored.size).toBe(0);
  });
});
