import { describe, expect, it } from 'vitest';

import {
  SURFACE_STATES,
  SURFACE_STATE_RULES,
  isSurfaceState,
  surfaceStateForSyncState,
  toSurfaceState,
} from '../lifecycle-status';
import {
  DEGRADED_ROUND_TRIP_MS,
  NETWORK_CONDITIONS,
  NETWORK_CONDITION_RULES,
  NETWORK_FAULT_ORIGINS,
  classifyNetworkCondition,
  isNetworkCondition,
  networkConditionIsReaderActionable,
  networkRemedy,
  networkSurfaceState,
} from '../network-state';
import { SyncState } from '../web-offline';

describe('every network condition answers the whole model', () => {
  it('renders through the surface vocabulary and nothing else', () => {
    for (const condition of NETWORK_CONDITIONS) {
      const rule = NETWORK_CONDITION_RULES[condition];
      expect(isSurfaceState(rule.surfaceState), condition).toBe(true);
      expect(NETWORK_FAULT_ORIGINS, condition).toContain(rule.origin);
      expect(isNetworkCondition(condition)).toBe(true);
    }
    expect(Object.keys(NETWORK_CONDITION_RULES).sort()).toEqual([...NETWORK_CONDITIONS].sort());
  });

  it('names a fault for every condition but the working one', () => {
    for (const condition of NETWORK_CONDITIONS) {
      const { origin } = NETWORK_CONDITION_RULES[condition];
      expect(origin === 'none', condition).toBe(condition === 'online');
    }
  });

  it('asks the reader to act only when the fault is theirs to reach', () => {
    for (const condition of NETWORK_CONDITIONS) {
      const { origin } = NETWORK_CONDITION_RULES[condition];
      const actionable = networkConditionIsReaderActionable(condition);
      expect(actionable, condition).toBe(origin === 'device' || origin === 'network');
      if (origin === 'platform' || origin === 'provider') {
        expect(networkRemedy(condition), condition).not.toBe('reconnect');
      }
    }
  });

  it('owes the reader a sentence for every condition that is not working', () => {
    for (const condition of NETWORK_CONDITIONS) {
      const rendered = networkSurfaceState(condition);
      expect(SURFACE_STATE_RULES[rendered].needsExplanation, condition).toBe(
        condition !== 'online',
      );
    }
  });

  it('calls nothing permanent, because a network comes back', () => {
    for (const condition of NETWORK_CONDITIONS) {
      expect(SURFACE_STATE_RULES[networkSurfaceState(condition)].permanentFailure, condition).toBe(
        false,
      );
    }
  });

  it('never reports a read that failed as a read that returned nothing', () => {
    for (const condition of NETWORK_CONDITIONS) {
      expect(SURFACE_STATE_RULES[networkSurfaceState(condition)].meansNoData, condition).toBe(
        false,
      );
    }
  });
});

describe('what the observations decide', () => {
  const link = { interfaceUp: true, backendReachable: true, authReachable: true } as const;

  it('reads a link the device has not confirmed as offline', () => {
    expect(classifyNetworkCondition({})).toBe('offline');
    expect(classifyNetworkCondition({ interfaceUp: false })).toBe('offline');
  });

  it('tells a sign-in page apart from silence', () => {
    expect(classifyNetworkCondition({ interfaceUp: true, probeIntercepted: true })).toBe(
      'captive_portal',
    );
    expect(classifyNetworkCondition({ interfaceUp: true, backendReachable: false })).toBe(
      'backend_unreachable',
    );
  });

  it('keeps a live session when only sign-in is down', () => {
    const condition = classifyNetworkCondition({ ...link, authReachable: false });
    expect(condition).toBe('auth_unreachable');
    expect(NETWORK_CONDITION_RULES[condition].reachesBackend).toBe(true);
  });

  it('blames a provider only once our own backend has answered', () => {
    expect(classifyNetworkCondition({ ...link, providerImpaired: true })).toBe('provider_degraded');
    expect(
      classifyNetworkCondition({ ...link, backendReachable: false, providerImpaired: true }),
    ).toBe('backend_unreachable');
  });

  it('calls a slow round trip degraded rather than broken', () => {
    expect(classifyNetworkCondition({ ...link, roundTripMs: DEGRADED_ROUND_TRIP_MS })).toBe(
      'degraded_high_latency',
    );
    expect(classifyNetworkCondition({ ...link, roundTripMs: DEGRADED_ROUND_TRIP_MS - 1 })).toBe(
      'online',
    );
  });

  it('reads a working network as working', () => {
    expect(classifyNetworkCondition(link)).toBe('online');
    expect(networkSurfaceState('online')).toBe('success');
  });
});

describe('a device that can still do the work is not offline', () => {
  it('renders degraded wherever a local runtime carries the work', () => {
    for (const condition of NETWORK_CONDITIONS) {
      const rendered = networkSurfaceState(condition, { localRuntimeAvailable: true });
      const { localRuntimeHelps, surfaceState } = NETWORK_CONDITION_RULES[condition];
      expect(rendered, condition).toBe(localRuntimeHelps ? 'degraded' : surfaceState);
      if (localRuntimeHelps)
        expect(networkRemedy(condition, { localRuntimeAvailable: true })).toBe('wait');
    }
  });

  it('says reconnecting while the client is doing it, and asks nothing of the reader', () => {
    expect(networkSurfaceState('offline', { reconnecting: true })).toBe('reconnecting');
    expect(networkRemedy('offline', { reconnecting: true })).toBe('wait');
    expect(networkSurfaceState('offline')).toBe('offline');
    expect(networkRemedy('offline')).toBe('reconnect');
  });

  it('does not claim a reconnection for a condition that is already through', () => {
    expect(networkSurfaceState('provider_degraded', { reconnecting: true })).toBe('degraded');
  });
});

describe('one vocabulary, read by the spellings that came before it', () => {
  it('resolves every sync state the offline client stores', () => {
    for (const state of Object.values(SyncState)) {
      const resolved = toSurfaceState(state);
      expect(resolved, state).not.toBeNull();
      expect(SURFACE_STATES, state).toContain(resolved);
      expect(surfaceStateForSyncState(state), state).toBe(resolved);
    }
  });
});
