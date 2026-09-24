/**
 * @file network-state.ts
 * @module @agiworkforce/types/network-state
 *
 * Why a request did not get an answer, told apart. Every surface had collapsed
 * this into one boolean, so a hotel sign-in page, our own backend being down, a
 * provider answering slowly and a genuinely dead radio all rendered as "you are
 * offline" and all offered the same useless remedy. They are not the same
 * condition, they do not have the same fault, and three of the four are not the
 * reader's to fix.
 *
 * A condition says where the fault is and whether work can continue. What the
 * reader is shown comes from `SurfaceState`, so nothing here invents a second
 * way to render a failure.
 */

import { type SurfaceRemedy, type SurfaceState, SURFACE_STATE_RULES } from './lifecycle-status';

export const NETWORK_CONDITIONS = [
  'online',
  'offline',
  'captive_portal',
  'backend_unreachable',
  'auth_unreachable',
  'degraded_high_latency',
  'provider_degraded',
] as const;

export type NetworkCondition = (typeof NETWORK_CONDITIONS)[number];

/**
 * Whose problem it is. This is the field that decides what a reader is told, so
 * it is never inferred from the transport: a dead radio is the device's, a
 * portal is the network the device joined, our backend is ours, and a model
 * answering badly is the provider's. Telling a reader to check their wifi
 * because our API is down is the defect this field exists to prevent.
 */
export const NETWORK_FAULT_ORIGINS = ['none', 'device', 'network', 'platform', 'provider'] as const;

export type NetworkFaultOrigin = (typeof NETWORK_FAULT_ORIGINS)[number];

export interface NetworkConditionRule {
  origin: NetworkFaultOrigin;
  /** What a reader is shown while this holds, with no local runtime. */
  surfaceState: SurfaceState;
  /** Whether a request can reach our API at all. */
  reachesBackend: boolean;
  /** Whether a token can be minted or refreshed. A session may outlive this. */
  reachesAuth: boolean;
  /** Whether a local runtime could carry the work instead. */
  localRuntimeHelps: boolean;
}

/**
 * `auth_unreachable` reaches the backend, so work already holding a valid token
 * keeps going and only a sign-in stops: rendering the whole product as offline
 * for it throws away a working session.
 */
export const NETWORK_CONDITION_RULES: Readonly<Record<NetworkCondition, NetworkConditionRule>> = {
  online: {
    origin: 'none',
    surfaceState: 'success',
    reachesBackend: true,
    reachesAuth: true,
    localRuntimeHelps: false,
  },
  offline: {
    origin: 'device',
    surfaceState: 'offline',
    reachesBackend: false,
    reachesAuth: false,
    localRuntimeHelps: true,
  },
  captive_portal: {
    origin: 'network',
    surfaceState: 'offline',
    reachesBackend: false,
    reachesAuth: false,
    localRuntimeHelps: true,
  },
  backend_unreachable: {
    origin: 'platform',
    surfaceState: 'error',
    reachesBackend: false,
    reachesAuth: false,
    localRuntimeHelps: true,
  },
  auth_unreachable: {
    origin: 'platform',
    surfaceState: 'error',
    reachesBackend: true,
    reachesAuth: false,
    localRuntimeHelps: false,
  },
  degraded_high_latency: {
    origin: 'network',
    surfaceState: 'degraded',
    reachesBackend: true,
    reachesAuth: true,
    localRuntimeHelps: true,
  },
  provider_degraded: {
    origin: 'provider',
    surfaceState: 'degraded',
    reachesBackend: true,
    reachesAuth: true,
    localRuntimeHelps: true,
  },
};

export function isNetworkCondition(value: string): value is NetworkCondition {
  return (NETWORK_CONDITIONS as readonly string[]).includes(value);
}

export function networkConditionRule(condition: NetworkCondition): NetworkConditionRule {
  return NETWORK_CONDITION_RULES[condition];
}

/** A round trip above this is slow enough that a reader notices and asks. */
export const DEGRADED_ROUND_TRIP_MS = 3_000;

export interface NetworkObservation {
  /** The device believes it has a link. It may still reach nothing. */
  interfaceUp?: boolean;
  /**
   * A probe for a known response came back as something else, which is what a
   * sign-in portal does. Absence of an answer is not this: that is `offline`.
   */
  probeIntercepted?: boolean;
  /** Our API answered, whatever it answered with. */
  backendReachable?: boolean;
  /** The identity provider answered. */
  authReachable?: boolean;
  roundTripMs?: number;
  /** An upstream model provider is failing or slow, and ours is not. */
  providerImpaired?: boolean;
}

/**
 * The one reading of a network. Order is the point: a portal is decided before
 * unreachability because a portal answers every request, and a provider is
 * blamed only once our own backend has been shown to be fine. A link the device
 * has not confirmed is not a link, so nothing observed reads as offline.
 */
export function classifyNetworkCondition(observation: NetworkObservation): NetworkCondition {
  if (observation.interfaceUp !== true) return 'offline';
  if (observation.probeIntercepted === true) return 'captive_portal';
  if (observation.backendReachable === false) return 'backend_unreachable';
  if (observation.authReachable === false) return 'auth_unreachable';
  if (observation.providerImpaired === true) return 'provider_degraded';
  if (observation.roundTripMs !== undefined && observation.roundTripMs >= DEGRADED_ROUND_TRIP_MS) {
    return 'degraded_high_latency';
  }
  return 'online';
}

export interface NetworkSurfaceInput {
  /** A runtime on this device that can answer without the cloud. */
  localRuntimeAvailable?: boolean;
  /** The client has decided to re-establish the connection and is doing it. */
  reconnecting?: boolean;
}

/**
 * What the reader sees. A device holding a local runtime is not offline in any
 * sense they care about, it is working with less, which is `degraded` rather
 * than a dead end with a `reconnect` button that changes nothing.
 */
export function networkSurfaceState(
  condition: NetworkCondition,
  input: NetworkSurfaceInput = {},
): SurfaceState {
  const rule = NETWORK_CONDITION_RULES[condition];
  if (input.localRuntimeAvailable === true && rule.localRuntimeHelps) return 'degraded';
  if (input.reconnecting === true && !rule.reachesBackend) return 'reconnecting';
  return rule.surfaceState;
}

export function networkRemedy(
  condition: NetworkCondition,
  input: NetworkSurfaceInput = {},
): SurfaceRemedy | null {
  return SURFACE_STATE_RULES[networkSurfaceState(condition, input)].remedy;
}

/**
 * Whether the reader is the one who can act. Everything else is ours or the
 * network's, and a remedy aimed at them for those is worse than none.
 */
export function networkConditionIsReaderActionable(condition: NetworkCondition): boolean {
  const { origin } = NETWORK_CONDITION_RULES[condition];
  return origin === 'device' || origin === 'network';
}
