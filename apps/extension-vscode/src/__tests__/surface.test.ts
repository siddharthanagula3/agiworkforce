
import { describe, expect, it } from 'vitest';
import {
  assertSurfaceCanSyncChats,
  isDeveloperSessionSurface,
  isSyncedAppSurface,
} from '@agiworkforce/types';
import { SOURCE_SURFACE, DEVELOPER_SURFACE } from '../platform/surface';

describe('vscode SOURCE_SURFACE', () => {
  it('is the literal "vscode"', () => {
    expect(SOURCE_SURFACE).toBe('vscode');
    expect(DEVELOPER_SURFACE).toBe('vscode');
  });

  it('is classified as a developer surface', () => {
    expect(isDeveloperSessionSurface(SOURCE_SURFACE)).toBe(true);
  });

  it('is NOT a synced-app surface (consumer chat sync stays Web/Desktop/Mobile)', () => {
    expect(isSyncedAppSurface(SOURCE_SURFACE)).toBe(false);
  });

  it('triggers assertSurfaceCanSyncChats to throw the sync-rule violation', () => {
    expect(() => assertSurfaceCanSyncChats(SOURCE_SURFACE)).toThrow(/sync-rule violation/i);
  });
});
