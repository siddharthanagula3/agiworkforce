import { describe, expect, it } from 'vitest';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import {
  admitWorkspace,
  beginWorkspaceSwitch,
  finishWorkspaceSwitch,
  observeWorkspaceOwner,
  workspaceOwnerIsCurrent,
  workspaceQueryKey,
} from './workspace-admission';

function session(userId = 'account', sessionId = 'session') {
  let current = true;
  const identity: SessionAuthority = {
    userId,
    sessionId,
    isCurrent: () => current,
    getToken: async () => 'fixture-token',
  };
  return {
    identity,
    retire: () => {
      current = false;
    },
  };
}

describe('canonical workspace admission', () => {
  it('retires the epoch when a validated refresh reveals another workspace', () => {
    const identity = session('externally-changed');
    const owner = observeWorkspaceOwner(identity.identity)!;
    const epoch = owner.epoch;
    admitWorkspace(owner, epoch, 'personal');
    admitWorkspace(owner, epoch, 'organization');
    expect(workspaceOwnerIsCurrent(owner, epoch)).toBe(false);
    expect(owner.phase).toBe('uncertain');
    identity.retire();
    const replacement = session('externally-changed', 'next-session');
    expect(observeWorkspaceOwner(replacement.identity)?.phase).toBe('uncertain');
    replacement.retire();
  });

  it('retires admission before a switch and does not admit a background read during it', () => {
    const identity = session();
    const owner = observeWorkspaceOwner(identity.identity)!;
    const oldEpoch = owner.epoch;
    admitWorkspace(owner, oldEpoch, 'personal');
    const epoch = beginWorkspaceSwitch(owner, owner.epoch);
    expect(workspaceOwnerIsCurrent(owner, oldEpoch)).toBe(false);
    expect(owner.phase).toBe('switching');
    admitWorkspace(owner, epoch, 'personal');
    expect(owner.phase).toBe('switching');
    expect(() => beginWorkspaceSwitch(owner, owner.epoch)).toThrow();
    finishWorkspaceSwitch(owner, epoch, true);
    admitWorkspace(owner, epoch, 'personal');
    expect(owner.phase).toBe('uncertain');
    expect(() => beginWorkspaceSwitch(owner, owner.epoch)).toThrow();
    identity.retire();
  });

  it('never reuses a query key for a replacement session with the same IDs', () => {
    const first = session('replacement-account');
    const owner = observeWorkspaceOwner(first.identity)!;
    const epoch = owner.epoch;
    const key = workspaceQueryKey(owner);
    first.retire();
    const second = session('replacement-account');
    const replacement = observeWorkspaceOwner(second.identity)!;
    expect(workspaceOwnerIsCurrent(owner, epoch)).toBe(false);
    expect(workspaceQueryKey(replacement)).not.toEqual(key);
    admitWorkspace(owner, epoch, 'personal');
    expect(replacement.phase).toBe('resolving');
    second.retire();
  });

  it('serializes switching across account owners and cannot retire the replacement', () => {
    const first = session('first');
    const owner = observeWorkspaceOwner(first.identity)!;
    admitWorkspace(owner, owner.epoch, 'personal');
    const epoch = beginWorkspaceSwitch(owner, owner.epoch);
    first.retire();
    const second = session('second');
    const replacement = observeWorkspaceOwner(second.identity)!;
    admitWorkspace(replacement, replacement.epoch, 'personal');
    expect(() => beginWorkspaceSwitch(replacement, replacement.epoch)).toThrow();
    finishWorkspaceSwitch(owner, epoch, true);
    expect(replacement.phase).toBe('admitted');
    const nextEpoch = beginWorkspaceSwitch(replacement, replacement.epoch);
    finishWorkspaceSwitch(replacement, nextEpoch, true);
    second.retire();
  });
});
