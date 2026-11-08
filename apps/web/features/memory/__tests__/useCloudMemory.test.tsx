import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ManagedCloudAccountWorkspaces } from '@agiworkforce/cloud-contracts';
import {
  admitWorkspace,
  observeWorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';
import { cloudMemoryScopeKey, createCloudMemoryController } from '../cloud-memory-controller';
import { useCloudMemoryAdapter, useMemoryView } from '../use-cloud-memory';

const retirements: Array<() => void> = [];
let sequence = 0;
function admittedController() {
  let current = true;
  const data: ManagedCloudAccountWorkspaces = {
    scope: 'personal',
    activeWorkspaceId: 'personal',
    activeOrganizationId: null,
    workspaces: [],
  };
  const owner = observeWorkspaceOwner({
    userId: `memory-view-account-${++sequence}`,
    sessionId: 'session',
    isCurrent: () => current,
    getToken: async () => 'fixture-view-token',
  })!;
  admitWorkspace(owner, owner.epoch, cloudMemoryScopeKey(data));
  const controller = createCloudMemoryController(owner, data);
  retirements.push(() => {
    current = false;
    controller.retire();
  });
  return controller;
}

afterEach(() => {
  for (const retire of retirements.splice(0)) retire();
  observeWorkspaceOwner(null);
  vi.unstubAllGlobals();
});

describe('cloud memory view lifecycle source fixtures (unexecuted)', () => {
  it('never revives a captured predicate after close and reopen with the same owner', () => {
    const controller = admittedController();
    const first = renderHook(() => useMemoryView(controller));
    const oldView = first.result.current();
    expect(oldView()).toBe(true);
    first.unmount();
    expect(oldView()).toBe(false);
    const reopened = renderHook(() => useMemoryView(controller));
    expect(reopened.result.current()()).toBe(true);
    expect(oldView()).toBe(false);
    reopened.unmount();
  });

  it('retires a view generation on controller replacement and keeps the replacement live', () => {
    const controller = admittedController();
    const view = renderHook(({ value }) => useMemoryView(value), {
      initialProps: { value: controller },
    });
    const oldView = view.result.current();
    const replacement = admittedController();
    view.rerender({ value: replacement });
    expect(oldView()).toBe(false);
    expect(view.result.current()()).toBe(true);
    view.unmount();
  });

  it('hydrates only on explicit demand and invalidates a retained adapter after unmount', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ memories: [], hasMore: false })));
    vi.stubGlobal('fetch', transport);
    const controller = admittedController();
    const view = renderHook(() => useCloudMemoryAdapter(controller));
    expect(transport).not.toHaveBeenCalled();
    await act(async () => {
      await view.result.current.hydrateFromServer();
    });
    expect(view.result.current.syncStatus).toBe('synced');
    const retained = view.result.current;
    view.unmount();
    expect(retained.isCurrent()).toBe(false);
    await expect(retained.add('Must not dispatch')).rejects.toMatchObject({ name: 'AbortError' });
    expect(transport).toHaveBeenCalledTimes(1);
    const reopened = renderHook(() => useCloudMemoryAdapter(controller));
    expect(reopened.result.current.isCurrent()).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
    reopened.unmount();
  });
});
