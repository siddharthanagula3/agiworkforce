import {
  isHighRiskCapability,
  permissionKey,
  type DesktopCapability,
  type PermissionDecision,
  type PermissionGrantDuration,
  type PermissionScope,
  type PermissionState,
} from '@agiworkforce/local-runtime-contract';

/**
 * Permission evaluation, with no Electron and no storage.
 *
 * Grants are matched on the exact capability and scope. There is deliberately
 * no hierarchy: a grant on one workspace says nothing about another, and a
 * `global` grant does not stand in for a scoped one. The single exception is
 * spelled out in `IMPLIED_BY`, because a user who approved writing to a folder
 * has plainly approved reading it.
 */

const IMPLIED_BY: Partial<Record<DesktopCapability, DesktopCapability>> = {
  'filesystem.read': 'filesystem.write',
  'git.read': 'git.write',
};

export interface PermissionLookup {
  persisted: ReadonlyMap<string, PermissionDecision>;
  session: ReadonlyMap<string, PermissionDecision>;
}

function lookup(store: PermissionLookup, key: string): PermissionDecision | undefined {
  return store.session.get(key) ?? store.persisted.get(key);
}

export function evaluatePermission(
  store: PermissionLookup,
  capability: DesktopCapability,
  scope: PermissionScope,
): PermissionState {
  const direct = lookup(store, permissionKey(capability, scope));
  if (direct) return direct.state;

  const implier = IMPLIED_BY[capability];
  if (implier) {
    const implied = lookup(store, permissionKey(implier, scope));
    if (implied?.state === 'granted') return 'granted';
  }

  return 'prompt';
}

/**
 * A high-risk capability never becomes a standing grant by accident. Without an
 * explicit acknowledgement the strongest duration it can reach is the current
 * session, so closing the app revokes it.
 */
export function normalizeGrantDuration(
  capability: DesktopCapability,
  requested: PermissionGrantDuration,
  acknowledgedHighRisk: boolean,
): PermissionGrantDuration {
  if (requested !== 'always') return requested;
  if (!isHighRiskCapability(capability)) return 'always';
  return acknowledgedHighRisk ? 'always' : 'session';
}

export function buildDecision(
  capability: DesktopCapability,
  scope: PermissionScope,
  state: 'granted' | 'denied',
  duration: PermissionGrantDuration,
  nowMs: number,
): PermissionDecision {
  return { capability, scope, state, duration, decidedAtMs: nowMs };
}

export function isPersistable(decision: PermissionDecision): boolean {
  return decision.duration === 'always';
}

export function isSingleUse(decision: PermissionDecision): boolean {
  return decision.duration === 'once';
}
