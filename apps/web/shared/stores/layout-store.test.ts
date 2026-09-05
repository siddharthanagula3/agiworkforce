import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUIStore } from './layout-store';

describe('Layout Store', () => {
  beforeEach(() => {
    useUIStore.getState().reset();
  });

  it('starts with the sidebar expanded', () => {
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('setSidebarCollapsed drives the flag WebChatPage reads', () => {
    useUIStore.getState().setSidebarCollapsed(true);
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);

    useUIStore.getState().setSidebarCollapsed(false);
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('reset returns the store to its initial state on sign-out', () => {
    useUIStore.getState().setSidebarCollapsed(true);
    useUIStore.getState().reset();
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('exposes no member without a production consumer', () => {
    expect(Object.keys(useUIStore.getState()).sort()).toEqual([
      'agiWorkAutonomyNoticeDismissed',
      'dismissAgiWorkAutonomyNotice',
      'reset',
      'setSidebarCollapsed',
      'sidebarCollapsed',
    ]);
  });
});

describe('Layout Store, persisted v1 blobs', () => {
  it('keeps sidebarCollapsed and drops the retired keys on rehydrate', async () => {
    localStorage.setItem(
      'agi-ui-store',
      JSON.stringify({
        state: {
          sidebarOpen: false,
          sidebarCollapsed: true,
          theme: 'dark',
          dashboard: { viewMode: 'list', filters: {}, sortBy: 'name', sortOrder: 'asc' },
          notifications: { enabled: false, sound: false, desktop: false },
        },
        version: 1,
      }),
    );

    vi.resetModules();
    const { useUIStore: rehydrated } = await import('./layout-store');
    await rehydrated.persist.rehydrate();

    expect(rehydrated.getState().sidebarCollapsed).toBe(true);
    expect(Object.keys(rehydrated.getState()).sort()).toEqual([
      'agiWorkAutonomyNoticeDismissed',
      'dismissAgiWorkAutonomyNotice',
      'reset',
      'setSidebarCollapsed',
      'sidebarCollapsed',
    ]);
    // The autonomy disclosure is owed once per session, so a persisted blob
    // must never come back with it already dismissed.
    expect(rehydrated.getState().agiWorkAutonomyNoticeDismissed).toBe(false);
    localStorage.removeItem('agi-ui-store');
  });
});
