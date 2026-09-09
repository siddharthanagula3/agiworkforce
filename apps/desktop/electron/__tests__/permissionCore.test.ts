import { describe, expect, it } from 'vitest';
import {
  permissionKey,
  type PermissionDecision,
  type PermissionScope,
} from '@agiworkforce/local-runtime-contract';
import {
  buildDecision,
  evaluatePermission,
  isPersistable,
  isSingleUse,
  normalizeGrantDuration,
  type PermissionLookup,
} from '../runtime/permissionCore';

const projectA: PermissionScope = { kind: 'workspace', target: '/work/a' };
const projectB: PermissionScope = { kind: 'workspace', target: '/work/b' };

function store(...decisions: PermissionDecision[]): PermissionLookup {
  const persisted = new Map<string, PermissionDecision>();
  const session = new Map<string, PermissionDecision>();
  for (const decision of decisions) {
    const target = decision.duration === 'always' ? persisted : session;
    target.set(permissionKey(decision.capability, decision.scope), decision);
  }
  return { persisted, session };
}

describe('evaluatePermission', () => {
  it('prompts when nothing has been decided', () => {
    expect(evaluatePermission(store(), 'filesystem.read', projectA)).toBe('prompt');
  });

  it('returns a recorded grant and a recorded denial', () => {
    const granted = store(buildDecision('filesystem.read', projectA, 'granted', 'always', 0));
    const denied = store(buildDecision('filesystem.read', projectA, 'denied', 'session', 0));
    expect(evaluatePermission(granted, 'filesystem.read', projectA)).toBe('granted');
    expect(evaluatePermission(denied, 'filesystem.read', projectA)).toBe('denied');
  });

  it('does not let a grant on one workspace leak to another', () => {
    const lookup = store(buildDecision('filesystem.read', projectA, 'granted', 'always', 0));
    expect(evaluatePermission(lookup, 'filesystem.read', projectB)).toBe('prompt');
  });

  it('does not let a grant on one capability leak to another', () => {
    const lookup = store(buildDecision('filesystem.read', projectA, 'granted', 'always', 0));
    expect(evaluatePermission(lookup, 'shell.execute', projectA)).toBe('prompt');
  });

  it('treats write access as covering read on the same workspace', () => {
    const lookup = store(buildDecision('filesystem.write', projectA, 'granted', 'always', 0));
    expect(evaluatePermission(lookup, 'filesystem.read', projectA)).toBe('granted');
  });

  it('does not treat read access as covering write', () => {
    const lookup = store(buildDecision('filesystem.read', projectA, 'granted', 'always', 0));
    expect(evaluatePermission(lookup, 'filesystem.write', projectA)).toBe('prompt');
  });

  it('does not let a denied write imply a denied read', () => {
    const lookup = store(buildDecision('filesystem.write', projectA, 'denied', 'session', 0));
    expect(evaluatePermission(lookup, 'filesystem.read', projectA)).toBe('prompt');
  });

  it('lets a session decision override a persisted one', () => {
    const persisted = new Map([
      [
        permissionKey('filesystem.read', projectA),
        buildDecision('filesystem.read', projectA, 'granted', 'always', 0),
      ],
    ]);
    const session = new Map([
      [
        permissionKey('filesystem.read', projectA),
        buildDecision('filesystem.read', projectA, 'denied', 'session', 1),
      ],
    ]);
    expect(evaluatePermission({ persisted, session }, 'filesystem.read', projectA)).toBe('denied');
  });

  it('does not let a global grant stand in for a scoped one', () => {
    const lookup = store(
      buildDecision('filesystem.read', { kind: 'global' }, 'granted', 'always', 0),
    );
    expect(evaluatePermission(lookup, 'filesystem.read', projectA)).toBe('prompt');
  });
});

describe('normalizeGrantDuration', () => {
  it('leaves an ordinary capability at the requested duration', () => {
    expect(normalizeGrantDuration('filesystem.read', 'always', false)).toBe('always');
    expect(normalizeGrantDuration('filesystem.read', 'once', false)).toBe('once');
  });

  it('caps an unacknowledged high-risk grant at the session', () => {
    expect(normalizeGrantDuration('shell.execute', 'always', false)).toBe('session');
    expect(normalizeGrantDuration('computer.use', 'always', false)).toBe('session');
    expect(normalizeGrantDuration('git.destructive', 'always', false)).toBe('session');
  });

  it('allows a high-risk standing grant only once acknowledged', () => {
    expect(normalizeGrantDuration('shell.execute', 'always', true)).toBe('always');
  });

  it('never widens a narrower request', () => {
    expect(normalizeGrantDuration('shell.execute', 'once', true)).toBe('once');
    expect(normalizeGrantDuration('shell.execute', 'session', true)).toBe('session');
  });
});

describe('decision classification', () => {
  it('persists only standing grants', () => {
    expect(isPersistable(buildDecision('filesystem.read', projectA, 'granted', 'always', 0))).toBe(
      true,
    );
    expect(isPersistable(buildDecision('filesystem.read', projectA, 'granted', 'session', 0))).toBe(
      false,
    );
    expect(isPersistable(buildDecision('filesystem.read', projectA, 'granted', 'once', 0))).toBe(
      false,
    );
  });

  it('marks single-use grants for consumption', () => {
    expect(isSingleUse(buildDecision('filesystem.read', projectA, 'granted', 'once', 0))).toBe(
      true,
    );
    expect(isSingleUse(buildDecision('filesystem.read', projectA, 'granted', 'session', 0))).toBe(
      false,
    );
  });
});
