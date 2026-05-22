/**
 * Surface anchor tests for the Chrome extension.
 *
 * The /goal sync rule says CLI / VS Code / Chrome are developer surfaces and
 * must not be enrolled into the consumer chat sync pipeline. These tests
 * lock the constant + assert the canonical helpers from `@agiworkforce/types`
 * agree.
 */

import { describe, expect, it } from 'vitest';
import {
  assertSurfaceCanSyncChats,
  isDeveloperSessionSurface,
  isSyncedAppSurface,
} from '@agiworkforce/types';
import { SOURCE_SURFACE, DEVELOPER_SURFACE } from '../src/surface';

describe('chrome SOURCE_SURFACE', () => {
  it('is the literal "chrome"', () => {
    expect(SOURCE_SURFACE).toBe('chrome');
    expect(DEVELOPER_SURFACE).toBe('chrome');
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
