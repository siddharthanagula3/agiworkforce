/**
 * Layout store tests.
 *
 * PP-24 shrank this store to the two members `WebChatPage` actually consumes
 * plus the sign-out `reset` verb. The previous 386-line suite covered modals,
 * theme, dashboard filters/sorting and notification toggles — none of which
 * had a production reader or writer. Those tests were the ONLY thing exercising
 * that state, which is exactly how it survived: a store member can look
 * thoroughly tested and still be wired to nothing.
 */

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
    // Guards the shape rather than a list of names: a member added back here
    // has to be justified in the PP-24 guard test as well.
    expect(Object.keys(useUIStore.getState()).sort()).toEqual([
      'reset',
      'setSidebarCollapsed',
      'sidebarCollapsed',
    ]);
  });
});

describe('Layout Store — persisted v1 blobs', () => {
  it('keeps sidebarCollapsed and drops the retired keys on rehydrate', async () => {
    // Exactly what a browser that ran the old build still holds under
    // `agi-ui-store`: the v1 partialize wrote five keys, four of which no
    // longer exist in the code. Without the version bump + migrate, zustand
    // merges this blob over the initial state and puts `theme`/`dashboard`/
    // `notifications` back on the live store object.
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
      'reset',
      'setSidebarCollapsed',
      'sidebarCollapsed',
    ]);
    localStorage.removeItem('agi-ui-store');
  });
});
