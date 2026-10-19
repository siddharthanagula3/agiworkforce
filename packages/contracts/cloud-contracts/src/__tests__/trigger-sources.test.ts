import { describe, expect, it } from 'vitest';
import {
  MANAGED_CLOUD_TRIGGER_SOURCE_OPTIONS,
  managedCloudMailboxWatchNotice,
  managedCloudTriggerEventTypesFromText,
  managedCloudTriggerSourceAvailable,
} from '../trigger-sources';
import { MANAGED_CLOUD_TRIGGER_SOURCES } from '../triggers';

describe('trigger sources', () => {
  it('describes every trigger source the server accepts', () => {
    expect(MANAGED_CLOUD_TRIGGER_SOURCE_OPTIONS.map((option) => option.value).sort()).toEqual(
      [...MANAGED_CLOUD_TRIGGER_SOURCES].sort(),
    );
  });

  it('holds connector-backed sources until connectors are released', () => {
    expect(managedCloudTriggerSourceAvailable('gmail', 'coming_soon')).toBe(false);
    expect(managedCloudTriggerSourceAvailable('gmail', 'released')).toBe(true);
    expect(managedCloudTriggerSourceAvailable('github', 'coming_soon')).toBe(true);
  });

  it('turns blank event types into the wildcard', () => {
    expect(managedCloudTriggerEventTypesFromText(' ')).toEqual(['*']);
    expect(managedCloudTriggerEventTypesFromText('push, pull_request.opened')).toEqual([
      'push',
      'pull_request.opened',
    ]);
  });

  it('explains why a Gmail trigger is not firing', () => {
    const base = {
      source: 'gmail' as const,
      watchError: null,
      verificationStatus: 'verified' as const,
      watchExpiresAt: '2026-10-01T00:00:00.000Z',
    };
    expect(managedCloudMailboxWatchNotice(base, Date.parse('2026-10-02T00:00:00.000Z'))).toMatch(
      /lapsed/,
    );
    expect(managedCloudMailboxWatchNotice({ ...base, verificationStatus: 'pending' })).toMatch(
      /not registered/,
    );
    expect(managedCloudMailboxWatchNotice({ ...base, source: 'github' })).toBeNull();
  });
});
