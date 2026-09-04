import { afterEach, describe, expect, it } from 'vitest';

import {
  INITIAL_ARTIFACT_SYNC_CURSOR,
  clearArtifactSyncCursor,
  readArtifactSyncCursor,
  writeArtifactSyncCursor,
} from './artifact-sync-cursor-storage';

afterEach(() => {
  window.localStorage.clear();
});

describe('artifact sync cursor storage', () => {
  it('defaults an unseen user to the initial cursor', () => {
    expect(readArtifactSyncCursor('user-unseen')).toBe(INITIAL_ARTIFACT_SYNC_CURSOR);
  });

  it('persists and reloads a cursor for the same user', () => {
    writeArtifactSyncCursor('user-1', '42');
    expect(readArtifactSyncCursor('user-1')).toBe('42');
  });

  it('keeps cursors isolated between users', () => {
    writeArtifactSyncCursor('user-1', '42');
    writeArtifactSyncCursor('user-2', '7');
    expect(readArtifactSyncCursor('user-1')).toBe('42');
    expect(readArtifactSyncCursor('user-2')).toBe('7');
  });

  it('resets a user back to the initial cursor after clearing', () => {
    writeArtifactSyncCursor('user-1', '42');
    clearArtifactSyncCursor('user-1');
    expect(readArtifactSyncCursor('user-1')).toBe(INITIAL_ARTIFACT_SYNC_CURSOR);
  });

  it('matches the agi- prefix that the logout purge scans for', () => {
    writeArtifactSyncCursor('user-1', '42');
    const keys = Object.keys(window.localStorage).filter((key) => /^agi[-_.]/i.test(key));
    expect(keys.length).toBeGreaterThan(0);
  });
});
