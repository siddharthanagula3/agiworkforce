import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatProjectStore } from '@agiworkforce/unified-chat';
import type { Project } from '@agiworkforce/unified-chat';
import {
  hydrateManagedCloudProjectStore,
  loadMoreManagedCloudProjects,
  resetManagedCloudProjectStore,
  useManagedCloudProjectSessionStore,
} from '../stores/project-store';

const ACCOUNT = 'user-1';
const PAGE_SIZE = 3;

function project(id: string): Project {
  return {
    id,
    name: id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Project;
}

function pagesOf(all: Project[]) {
  return vi.fn(async ({ limit, offset }: { limit: number; offset: number }) =>
    all.slice(offset, offset + limit),
  );
}

function loadedIds(): string[] {
  return useChatProjectStore.getState().projects.map((entry) => entry.id);
}

beforeEach(() => {
  resetManagedCloudProjectStore();
  vi.clearAllMocks();
});

describe('managed cloud projects paging', () => {
  it('asks for one page, not the whole list', async () => {
    const listProjects = pagesOf([project('a'), project('b'), project('c'), project('d')]);

    await hydrateManagedCloudProjectStore({
      accountId: ACCOUNT,
      listProjects,
      pageSize: PAGE_SIZE,
    });

    expect(listProjects).toHaveBeenCalledWith({ limit: PAGE_SIZE, offset: 0 });
    expect(loadedIds()).toEqual(['a', 'b', 'c']);
    expect(useManagedCloudProjectSessionStore.getState().hasMore).toBe(true);
  });

  it('reports no more when the first page comes back short', async () => {
    await hydrateManagedCloudProjectStore({
      accountId: ACCOUNT,
      listProjects: pagesOf([project('a')]),
      pageSize: PAGE_SIZE,
    });

    expect(useManagedCloudProjectSessionStore.getState().hasMore).toBe(false);
  });

  it('appends the next page and stops when it runs short', async () => {
    const all = [project('a'), project('b'), project('c'), project('d'), project('e')];
    const listProjects = pagesOf(all);
    await hydrateManagedCloudProjectStore({
      accountId: ACCOUNT,
      listProjects,
      pageSize: PAGE_SIZE,
    });

    await loadMoreManagedCloudProjects({ accountId: ACCOUNT, listProjects, pageSize: PAGE_SIZE });

    expect(listProjects).toHaveBeenLastCalledWith({ limit: PAGE_SIZE, offset: 3 });
    expect(loadedIds()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(useManagedCloudProjectSessionStore.getState().hasMore).toBe(false);
  });

  /**
   * W07. Removing a loaded project shifts every later row down by one. Resuming
   * from a count captured when the first page arrived would step over exactly as
   * many rows as were removed, and they could never be reached again.
   */
  it('skips no project when one is removed before the next page', async () => {
    const all = [project('a'), project('b'), project('c'), project('d'), project('e')];
    const listProjects = pagesOf(all);
    await hydrateManagedCloudProjectStore({
      accountId: ACCOUNT,
      listProjects,
      pageSize: PAGE_SIZE,
    });

    const remaining = all.filter((entry) => entry.id !== 'b');
    useChatProjectStore.setState({
      projects: useChatProjectStore.getState().projects.filter((entry) => entry.id !== 'b'),
    });
    const afterRemoval = pagesOf(remaining);

    await loadMoreManagedCloudProjects({
      accountId: ACCOUNT,
      listProjects: afterRemoval,
      pageSize: PAGE_SIZE,
    });

    expect(afterRemoval).toHaveBeenLastCalledWith({ limit: PAGE_SIZE, offset: 2 });
    expect(loadedIds()).toEqual(['a', 'c', 'd', 'e']);
  });

  it('never lists the same project twice when a page overlaps', async () => {
    const all = [project('a'), project('b'), project('c'), project('d')];
    const listProjects = pagesOf(all);
    await hydrateManagedCloudProjectStore({
      accountId: ACCOUNT,
      listProjects,
      pageSize: PAGE_SIZE,
    });

    const overlapping = vi.fn(async () => [project('c'), project('d')]);
    await loadMoreManagedCloudProjects({
      accountId: ACCOUNT,
      listProjects: overlapping,
      pageSize: PAGE_SIZE,
    });

    expect(loadedIds()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not fire a second page while one is in flight', async () => {
    const all = [project('a'), project('b'), project('c'), project('d')];
    await hydrateManagedCloudProjectStore({
      accountId: ACCOUNT,
      listProjects: pagesOf(all),
      pageSize: PAGE_SIZE,
    });

    let release: (value: Project[]) => void = () => undefined;
    const slow = vi.fn(
      () =>
        new Promise<Project[]>((resolve) => {
          release = resolve;
        }),
    );

    const first = loadMoreManagedCloudProjects({
      accountId: ACCOUNT,
      listProjects: slow,
      pageSize: PAGE_SIZE,
    });
    await loadMoreManagedCloudProjects({
      accountId: ACCOUNT,
      listProjects: slow,
      pageSize: PAGE_SIZE,
    });

    expect(slow).toHaveBeenCalledTimes(1);
    release([project('d')]);
    await first;
  });

  it('keeps what is loaded and says so when the next page fails', async () => {
    const all = [project('a'), project('b'), project('c'), project('d')];
    await hydrateManagedCloudProjectStore({
      accountId: ACCOUNT,
      listProjects: pagesOf(all),
      pageSize: PAGE_SIZE,
    });

    await loadMoreManagedCloudProjects({
      accountId: ACCOUNT,
      listProjects: vi.fn(async () => {
        throw new Error('network down');
      }),
      pageSize: PAGE_SIZE,
    });

    expect(loadedIds()).toEqual(['a', 'b', 'c']);
    const session = useManagedCloudProjectSessionStore.getState();
    expect(session.isLoadingMore).toBe(false);
    expect(session.error).toBeTruthy();
  });

  it('ignores a page requested for an account that is no longer signed in', async () => {
    const all = [project('a'), project('b'), project('c'), project('d')];
    await hydrateManagedCloudProjectStore({
      accountId: ACCOUNT,
      listProjects: pagesOf(all),
      pageSize: PAGE_SIZE,
    });

    await loadMoreManagedCloudProjects({
      accountId: 'someone-else',
      listProjects: pagesOf(all),
      pageSize: PAGE_SIZE,
    });

    expect(loadedIds()).toEqual(['a', 'b', 'c']);
  });
});
