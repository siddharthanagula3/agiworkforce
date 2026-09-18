import { describe, expect, it } from 'vitest';

import {
  applyMemoryControlsDelta,
  mapMemoryControlsWireDelta,
  memoryControlsAllowCategory,
  memoryControlsMatch,
  mergeMemoryControls,
  shouldPushMemoryControls,
  toMemoryControlsPushItem,
  type SyncMemoryControls,
} from '../memory-controls';

function controls(overrides: Partial<SyncMemoryControls> = {}): SyncMemoryControls {
  return {
    enabled: true,
    referenceChatHistory: true,
    disabledCategories: [],
    retentionDays: null,
    updatedAt: '2026-09-18T00:00:00.000Z',
    serverVersion: '10',
    ...overrides,
  };
}

describe('memory controls sync on their own path', () => {
  it('maps the wire delta and sorts the disabled categories so comparison is stable', () => {
    expect(
      mapMemoryControlsWireDelta({
        enabled: false,
        reference_chat_history: true,
        disabled_categories: ['preference', 'fact'],
        retention_days: 30,
        updated_at: '2026-09-18T00:00:00.000Z',
        server_version: '11',
      }),
    ).toEqual({
      enabled: false,
      referenceChatHistory: true,
      disabledCategories: ['fact', 'preference'],
      retentionDays: 30,
      updatedAt: '2026-09-18T00:00:00.000Z',
      serverVersion: '11',
    });
  });

  it('resolves a conflict to the more restrictive side, not to the later writer', () => {
    const merged = mergeMemoryControls(
      controls({ serverVersion: '12' }),
      controls({ enabled: false, disabledCategories: ['fact'], retentionDays: 7 }),
    );

    expect(merged.enabled).toBe(false);
    expect(merged.disabledCategories).toEqual(['fact']);
    expect(merged.retentionDays).toBe(7);
    expect(merged.serverVersion).toBe('12');
  });

  it('keeps memory off on a device that switched it off while the server still says on', () => {
    const local = controls({ enabled: false, serverVersion: '10' });
    const applied = applyMemoryControlsDelta(
      local,
      controls({ enabled: true, serverVersion: '11' }),
    );

    expect(applied.enabled).toBe(false);
    expect(applied.serverVersion).toBe('11');
  });

  it('drops a delta the device has already moved past', () => {
    const current = controls({ serverVersion: '20' });
    expect(applyMemoryControlsDelta(current, controls({ serverVersion: '9' }))).toBe(current);
    expect(applyMemoryControlsDelta(null, controls())).toEqual(controls());
  });

  it('answers whether a category may be collected at all', () => {
    expect(memoryControlsAllowCategory(controls(), 'fact')).toBe(true);
    expect(memoryControlsAllowCategory(controls({ disabledCategories: ['fact'] }), 'fact')).toBe(
      false,
    );
    expect(memoryControlsAllowCategory(controls({ enabled: false }), 'fact')).toBe(false);
  });

  it('pushes only what changed, with the version it last saw as the CAS base', () => {
    expect(shouldPushMemoryControls(controls(), controls())).toBe(false);
    expect(shouldPushMemoryControls(controls({ enabled: false }), controls())).toBe(true);
    expect(shouldPushMemoryControls(controls(), null)).toBe(true);
    expect(memoryControlsMatch(controls(), controls({ serverVersion: '99' }))).toBe(true);
    expect(toMemoryControlsPushItem(controls({ serverVersion: '7' })).baseVersion).toBe('7');
  });
});
