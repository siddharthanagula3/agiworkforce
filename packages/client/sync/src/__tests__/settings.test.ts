import { describe, it, expect } from 'vitest';
import { shouldPushSettings, shouldApplyPulledSettings } from '../settings';

describe('shouldPushSettings', () => {
  it('never pushes before any local cloud-safe edit (settingsUpdatedAt === null)', () => {
    expect(shouldPushSettings(null, '{"a":1}', '')).toBe(false);
  });

  it('skips a push when the current projection matches the last-pushed snapshot', () => {
    expect(shouldPushSettings('2026-07-01T00:00:00.000Z', '{"a":1}', '{"a":1}')).toBe(false);
  });

  it('pushes when there is an edit and the projection changed', () => {
    expect(shouldPushSettings('2026-07-01T00:00:00.000Z', '{"a":2}', '{"a":1}')).toBe(true);
  });

  it('pushes on the very first edit (lastPushedSnapshot empty)', () => {
    expect(shouldPushSettings('2026-07-01T00:00:00.000Z', '{"a":1}', '')).toBe(true);
  });
});

describe('shouldApplyPulledSettings', () => {
  it('does not apply when the cursor did not advance', () => {
    expect(shouldApplyPulledSettings('5', '5', 3)).toBe(false);
  });

  it('does not apply an advanced cursor with an empty namespace bag', () => {
    expect(shouldApplyPulledSettings('9', '5', 0)).toBe(false);
  });

  it('applies when the cursor advanced and namespaces are present', () => {
    expect(shouldApplyPulledSettings('9', '5', 2)).toBe(true);
  });
});
