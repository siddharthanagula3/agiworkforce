import { describe, expect, it, vi } from 'vitest';

import {
  captureContextPolicySnapshot,
  contextPolicySnapshotIsCurrent,
  contextPolicySnapshotsMatch,
} from './context-policy-snapshot';
import { contextPolicySnapshotFixture } from './__tests__/fixtures/context-policy-snapshot';

const snapshot = contextPolicySnapshotFixture();

describe('checkpoint organization context policy authority', () => {
  it.each([
    undefined,
    null,
    {},
    { ...snapshot, version: 2 },
    { ...snapshot, userId: '' },
    { ...snapshot, policy: { ...snapshot.policy, allowMemory: 'true' } },
    { ...snapshot, policy: { allowMemory: true } },
    { ...snapshot, extraAuthority: true },
  ])('rejects legacy or malformed snapshots: %j', async (saved) => {
    const query = vi.fn();
    expect(contextPolicySnapshotsMatch(saved, snapshot)).toBe(false);
    expect(contextPolicySnapshotsMatch(snapshot, saved)).toBe(false);
    await expect(contextPolicySnapshotIsCurrent({ query }, 'user-1', null, saved)).resolves.toBe(
      false,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('accepts the exact policy without depending on object property order', () => {
    expect(
      contextPolicySnapshotsMatch(snapshot, {
        policy: {
          allowWebResults: true,
          allowConnectorResults: true,
          allowPastChats: true,
          allowMemory: true,
        },
        organizationId: null,
        userId: 'user-1',
        version: 1,
      }),
    ).toBe(true);
  });

  it.each(['allowMemory', 'allowPastChats', 'allowConnectorResults', 'allowWebResults'] as const)(
    'refuses both narrowing and widening of %s',
    (flag) => {
      const changed = { ...snapshot, policy: { ...snapshot.policy, [flag]: false } };
      expect(contextPolicySnapshotsMatch(snapshot, changed)).toBe(false);
      expect(contextPolicySnapshotsMatch(changed, snapshot)).toBe(false);
    },
  );

  it('binds the snapshot to both the actor and organization', async () => {
    const query = vi
      .fn()
      .mockResolvedValue([
        { allow_memory: true, allow_connector_context: true, allow_web_result_context: true },
      ]);
    await expect(
      contextPolicySnapshotIsCurrent({ query }, 'other-user', null, snapshot),
    ).resolves.toBe(false);
    await expect(
      contextPolicySnapshotIsCurrent({ query }, 'user-1', 'other-org', snapshot),
    ).resolves.toBe(false);
  });

  it('does not turn an unreadable policy into a trusted closed snapshot', async () => {
    const query = vi.fn().mockRejectedValue(new Error('policy read unavailable'));
    const saved = contextPolicySnapshotFixture('user-1', 'org-1');
    await expect(captureContextPolicySnapshot({ query }, 'user-1', 'org-1')).resolves.toBeNull();
    await expect(contextPolicySnapshotIsCurrent({ query }, 'user-1', 'org-1', saved)).resolves.toBe(
      false,
    );
  });

  it('captures exactly the policy returned by the authoritative read', async () => {
    const query = vi
      .fn()
      .mockResolvedValue([
        { allow_memory: false, allow_connector_context: true, allow_web_result_context: false },
      ]);
    await expect(captureContextPolicySnapshot({ query }, 'user-1', 'org-1')).resolves.toEqual({
      version: 1,
      userId: 'user-1',
      organizationId: 'org-1',
      policy: {
        allowMemory: false,
        allowPastChats: false,
        allowConnectorResults: true,
        allowWebResults: false,
      },
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('organization_admin_policies'), [
      'org-1',
    ]);
  });
});
