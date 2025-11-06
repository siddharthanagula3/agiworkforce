import { describe, expect, it } from 'vitest';
import { useCloudStore } from '../cloudStore';

describe('cloudStore', () => {
  it('initializes with sensible defaults', () => {
    const state = useCloudStore.getState();

    expect(state.accounts).toEqual([]);
    expect(state.activeAccountId).toBeNull();
    expect(state.currentPath).toBe('/');
    expect(state.pendingAuth).toBeNull();
    expect(state.loading).toBe(false);
  });
});
