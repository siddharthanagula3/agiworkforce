/**
 * @file lifecycle-status.ts
 * @module @agiworkforce/types/lifecycle-status
 *
 * One vocabulary for "where is this work", and one for "what does the surface
 * render". Before this file each domain picked its own spelling of the same
 * state: an action was `completed`, a video job was `completed` but reached it
 * through `submitting`/`processing`, a settlement was `succeeded`, and a client
 * that wanted to say "you may not do this" had only `error`.
 *
 * The two vocabularies are deliberately separate. `LifecycleStatus` is what an
 * object is doing and is written by the owner of that object. `SurfaceState` is
 * what a reader is shown and folds in the reasons a read never happened at all:
 * permission, policy, entitlement, support, deletion, and being offline.
 */

import type { CapabilityLayer } from './capability-handshake/types';
import { DomainErrorCode, ErrorCode, type ClassifiedErrorCode } from './errors';
import type { ResourceLifecycleState } from './resource-lifecycle';
import { SyncState } from './web-offline';

export const LIFECYCLE_STATUSES = [
  'idle',
  'pending',
  'queued',
  'running',
  'awaiting_input',
  'completed',
  'completed_partial',
  'failed',
  'cancelled',
  'outcome_unknown',
] as const;

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

/**
 * `outcome_unknown` is absent on purpose: it is the state of work whose result
 * was never observed, so it still owes a reconciliation and is not an ending.
 * `completed_partial` is an ending: the work stopped and part of it landed.
 */
export const TERMINAL_LIFECYCLE_STATUSES = [
  'completed',
  'completed_partial',
  'failed',
  'cancelled',
] as const satisfies readonly LifecycleStatus[];

export type TerminalLifecycleStatus = (typeof TERMINAL_LIFECYCLE_STATUSES)[number];

/**
 * The five states a unit of work with a synchronous caller passes through. Four
 * domains had spelled this list out for themselves before it lived here.
 */
export const WORK_LIFECYCLE_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly LifecycleStatus[];

export type WorkLifecycleStatus = (typeof WORK_LIFECYCLE_STATUSES)[number];

export function isLifecycleStatus(value: string): value is LifecycleStatus {
  return (LIFECYCLE_STATUSES as readonly string[]).includes(value);
}

export function isTerminalLifecycleStatus(
  value: LifecycleStatus,
): value is TerminalLifecycleStatus {
  return (TERMINAL_LIFECYCLE_STATUSES as readonly string[]).includes(value);
}

/**
 * Spellings persisted before this vocabulary existed. They stay readable so no
 * stored row or shipped client has to be rewritten to be understood.
 */
export const LIFECYCLE_STATUS_ALIASES = {
  submitting: 'pending',
  accepted: 'pending',
  waiting: 'queued',
  processing: 'running',
  in_progress: 'running',
  executing: 'running',
  streaming: 'running',
  paused: 'awaiting_input',
  complete: 'completed',
  completed_successfully: 'completed',
  done: 'completed',
  finished: 'completed',
  succeeded: 'completed',
  success: 'completed',
  error: 'failed',
  errored: 'failed',
  canceled: 'cancelled',
  aborted: 'cancelled',
  unknown: 'outcome_unknown',
  partial: 'completed_partial',
  partial_success: 'completed_partial',
  incomplete: 'completed_partial',
} as const satisfies Readonly<Record<string, LifecycleStatus>>;

export type LifecycleStatusAlias = keyof typeof LIFECYCLE_STATUS_ALIASES;

/**
 * Every way the codebase has spelled "it ended well". None of them may become a
 * canonical member: `completed` is the only one, and the guard test proves it.
 */
export const COMPLETION_SPELLINGS_RESERVED_AS_ALIASES = [
  'complete',
  'done',
  'finished',
  'succeeded',
  'success',
] as const satisfies readonly LifecycleStatusAlias[];

export function toLifecycleStatus(value: string): LifecycleStatus | null {
  if (isLifecycleStatus(value)) return value;
  const alias = (LIFECYCLE_STATUS_ALIASES as Readonly<Record<string, LifecycleStatus>>)[value];
  return alias ?? null;
}

export const LIFECYCLE_TRANSITIONS = {
  idle: ['pending', 'queued', 'running', 'cancelled'],
  pending: ['queued', 'running', 'failed', 'cancelled'],
  queued: ['running', 'failed', 'cancelled'],
  running: [
    'awaiting_input',
    'completed',
    'completed_partial',
    'failed',
    'cancelled',
    'outcome_unknown',
  ],
  awaiting_input: ['running', 'completed', 'completed_partial', 'failed', 'cancelled'],
  outcome_unknown: ['completed', 'completed_partial', 'failed', 'cancelled'],
  completed: [],
  completed_partial: [],
  failed: [],
  cancelled: [],
} as const satisfies Readonly<Record<LifecycleStatus, readonly LifecycleStatus[]>>;

export function canTransitionLifecycleStatus(from: LifecycleStatus, to: LifecycleStatus): boolean {
  return (LIFECYCLE_TRANSITIONS[from] as readonly LifecycleStatus[]).includes(to);
}

/**
 * A transition is observable outside the service that owns it when work starts
 * and when it ends, so those two are the ones that owe a domain event.
 */
export function lifecycleTransitionEmitsEvent(from: LifecycleStatus, to: LifecycleStatus): boolean {
  if (!canTransitionLifecycleStatus(from, to)) return false;
  return to === 'running' || isTerminalLifecycleStatus(to) || to === 'outcome_unknown';
}

/**
 * The ending of a whole, derived from the endings of its parts rather than
 * stored beside them. A part that failed while others landed is the case every
 * domain used to collapse into `failed`, which told the reader their finished
 * work was lost.
 */
export function lifecycleStatusFromParts(parts: readonly LifecycleStatus[]): LifecycleStatus {
  if (parts.length === 0) return 'completed';
  if (parts.includes('outcome_unknown')) return 'outcome_unknown';
  if (parts.some((part) => !isTerminalLifecycleStatus(part))) return 'running';
  const partial = parts.includes('completed_partial');
  const landed = partial || parts.includes('completed');
  if (parts.includes('failed')) return landed ? 'completed_partial' : 'failed';
  if (!landed) return 'cancelled';
  return partial || parts.includes('cancelled') ? 'completed_partial' : 'completed';
}

/** The stage a reader is told about is the first one that has not ended. */
export function currentLifecycleStage<Stage extends { status: LifecycleStatus }>(
  stages: readonly Stage[],
): Stage | null {
  return stages.find((stage) => !isTerminalLifecycleStatus(stage.status)) ?? null;
}

/**
 * A domain keeps the states it genuinely needs and declares what each one means
 * in the shared vocabulary. Totality is asserted by the type, not by a comment.
 */
export type LifecycleProjection<DomainStatus extends string> = Readonly<
  Record<DomainStatus, LifecycleStatus>
>;

export function projectLifecycleStatus<DomainStatus extends string>(
  projection: LifecycleProjection<DomainStatus>,
  status: DomainStatus,
): LifecycleStatus {
  return projection[status];
}

/**
 * The state a surface renders. The first four are the values every client
 * already had; the rest are the outcomes those four used to collapse into
 * `error`, which is why a blocked plan and a dead network looked the same.
 */
export const SURFACE_STATES = [
  'idle',
  'loading',
  'refreshing',
  'success',
  'empty',
  'partial',
  'stale',
  'degraded',
  'error',
  'retrying',
  'rate_limited',
  'reconnecting',
  'offline',
  'permission_denied',
  'policy_blocked',
  'entitlement_blocked',
  'unsupported',
  'deleted',
  'archived',
] as const;

export type SurfaceState = (typeof SURFACE_STATES)[number];

/**
 * `success` is the loaded state. The word every surface reached for first is
 * kept readable so a stored value or a shipped client does not have to be
 * rewritten, and so nothing adds a second canonical spelling of it.
 */
export const SURFACE_STATE_ALIASES = {
  loaded: 'success',
  ready: 'success',
  done: 'success',
  online: 'success',
  fetching: 'loading',
  syncing: 'loading',
  reloading: 'refreshing',
  throttled: 'rate_limited',
} as const satisfies Readonly<Record<string, SurfaceState>>;

export function toSurfaceState(value: string): SurfaceState | null {
  if (isSurfaceState(value)) return value;
  return (SURFACE_STATE_ALIASES as Readonly<Record<string, SurfaceState>>)[value] ?? null;
}

export const SURFACE_REMEDIES = [
  'wait',
  'retry',
  'refresh',
  'reconnect',
  'sign_in',
  'request_access',
  'change_policy',
  'upgrade_plan',
  'choose_another',
  'correct_input',
  'revise_request',
  'contact_support',
  'restore',
] as const;

export type SurfaceRemedy = (typeof SURFACE_REMEDIES)[number];

export interface SurfaceStateRule {
  /** The reader must be told this will not change until something else does. */
  permanentFailure: boolean;
  /** Repeating the same request can succeed with nothing else changing. */
  retryable: boolean;
  /** What the reader can do about it, or null when nothing they do helps. */
  remedy: SurfaceRemedy | null;
  /** The read landed and there was genuinely nothing to show. */
  meansNoData: boolean;
  /** What is on screen is older than the server's answer. */
  meansStaleData: boolean;
  /** The reader is owed a sentence saying who decided and why. */
  needsExplanation: boolean;
}

/**
 * `offline` is retryable and never permanent: the request was never refused,
 * it was never made. Rendering it as a failure is the defect this table exists
 * to prevent. `empty` is the only state that means no data, so a read that
 * failed cannot be rendered as one that returned nothing.
 */
export const SURFACE_STATE_RULES: Readonly<Record<SurfaceState, SurfaceStateRule>> = {
  idle: {
    permanentFailure: false,
    retryable: false,
    remedy: null,
    meansNoData: false,
    meansStaleData: false,
    needsExplanation: false,
  },
  loading: {
    permanentFailure: false,
    retryable: false,
    remedy: 'wait',
    meansNoData: false,
    meansStaleData: false,
    needsExplanation: false,
  },
  refreshing: {
    permanentFailure: false,
    retryable: false,
    remedy: 'wait',
    meansNoData: false,
    meansStaleData: true,
    needsExplanation: false,
  },
  success: {
    permanentFailure: false,
    retryable: false,
    remedy: null,
    meansNoData: false,
    meansStaleData: false,
    needsExplanation: false,
  },
  empty: {
    permanentFailure: false,
    retryable: false,
    remedy: null,
    meansNoData: true,
    meansStaleData: false,
    needsExplanation: false,
  },
  partial: {
    permanentFailure: false,
    retryable: true,
    remedy: 'retry',
    meansNoData: false,
    meansStaleData: false,
    needsExplanation: true,
  },
  stale: {
    permanentFailure: false,
    retryable: true,
    remedy: 'refresh',
    meansNoData: false,
    meansStaleData: true,
    needsExplanation: true,
  },
  // The answer arrived and the service is answering worse than it should.
  // Retrying makes it worse, so the reader is told to wait, not to act.
  degraded: {
    permanentFailure: false,
    retryable: false,
    remedy: 'wait',
    meansNoData: false,
    meansStaleData: false,
    needsExplanation: true,
  },
  error: {
    permanentFailure: false,
    retryable: true,
    remedy: 'retry',
    meansNoData: false,
    meansStaleData: false,
    needsExplanation: true,
  },
  retrying: {
    permanentFailure: false,
    retryable: false,
    remedy: 'wait',
    meansNoData: false,
    meansStaleData: false,
    needsExplanation: false,
  },
  rate_limited: {
    permanentFailure: false,
    retryable: true,
    remedy: 'wait',
    meansNoData: false,
    meansStaleData: false,
    needsExplanation: true,
  },
  // The connection dropped and the client is already re-establishing it, which
  // is why nothing is asked of the reader. `retrying` is one request going out
  // again; this is the transport underneath it coming back.
  reconnecting: {
    permanentFailure: false,
    retryable: false,
    remedy: 'wait',
    meansNoData: false,
    meansStaleData: true,
    needsExplanation: true,
  },
  offline: {
    permanentFailure: false,
    retryable: true,
    remedy: 'reconnect',
    meansNoData: false,
    meansStaleData: true,
    needsExplanation: true,
  },
  permission_denied: {
    permanentFailure: true,
    retryable: false,
    remedy: 'request_access',
    meansNoData: false,
    meansStaleData: false,
    needsExplanation: true,
  },
  policy_blocked: {
    permanentFailure: true,
    retryable: false,
    remedy: 'change_policy',
    meansNoData: false,
    meansStaleData: false,
    needsExplanation: true,
  },
  entitlement_blocked: {
    permanentFailure: true,
    retryable: false,
    remedy: 'upgrade_plan',
    meansNoData: false,
    meansStaleData: false,
    needsExplanation: true,
  },
  unsupported: {
    permanentFailure: true,
    retryable: false,
    remedy: 'choose_another',
    meansNoData: false,
    meansStaleData: false,
    needsExplanation: true,
  },
  deleted: {
    permanentFailure: true,
    retryable: false,
    remedy: 'restore',
    meansNoData: false,
    meansStaleData: false,
    needsExplanation: true,
  },
  archived: {
    permanentFailure: false,
    retryable: false,
    remedy: 'restore',
    meansNoData: false,
    meansStaleData: false,
    needsExplanation: true,
  },
};

export function isSurfaceState(value: string): value is SurfaceState {
  return (SURFACE_STATES as readonly string[]).includes(value);
}

export function isPermanentFailureSurfaceState(state: SurfaceState): boolean {
  return SURFACE_STATE_RULES[state].permanentFailure;
}

const ERROR_CODE_SURFACE_STATES: Readonly<Partial<Record<ClassifiedErrorCode, SurfaceState>>> = {
  [ErrorCode.UNAUTHORIZED]: 'permission_denied',
  [ErrorCode.FORBIDDEN]: 'permission_denied',
  [ErrorCode.MFA_REQUIRED]: 'policy_blocked',
  [ErrorCode.IP_NOT_ALLOWED]: 'policy_blocked',
  [ErrorCode.PAYMENT_REQUIRED]: 'entitlement_blocked',
  [ErrorCode.CAPABILITY_UNAVAILABLE]: 'unsupported',
  [ErrorCode.NETWORK_ERROR]: 'offline',
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 'rate_limited',
  [DomainErrorCode.RESOURCE_DELETED]: 'deleted',
  [DomainErrorCode.SAFETY_BLOCKED]: 'policy_blocked',
};

export function surfaceStateForErrorCode(code: ClassifiedErrorCode): SurfaceState {
  return ERROR_CODE_SURFACE_STATES[code] ?? 'error';
}

export interface SurfaceReadOutcome {
  /** The request has not come back yet. */
  pending?: boolean;
  /** Something was already on screen when the request went out. */
  hadData?: boolean;
  /** The request failed, with the code the server decided on. */
  failedWith?: ClassifiedErrorCode | null;
  /** The request was never made because the client has no connection. */
  disconnected?: boolean;
  /** The request came back and carried nothing. */
  rowCount?: number;
  /** The answer landed short of what was asked for. */
  truncated?: boolean;
  /** What is on screen predates the server's current answer. */
  ageExceedsFreshness?: boolean;
  /** The client is between attempts of a retry it decided to make. */
  retryScheduled?: boolean;
}

/**
 * One reading of a read. A failure never becomes `empty`, because the count is
 * only consulted once the request has actually come back, and an offline read
 * that has something on screen is stale rather than blank.
 */
export function surfaceStateForRead(outcome: SurfaceReadOutcome): SurfaceState {
  const hadData = outcome.hadData === true;
  if (outcome.failedWith !== undefined && outcome.failedWith !== null) {
    if (outcome.retryScheduled === true) return 'retrying';
    return surfaceStateForErrorCode(outcome.failedWith);
  }
  if (outcome.disconnected === true) return 'offline';
  if (outcome.pending === true) return hadData ? 'refreshing' : 'loading';
  if (outcome.rowCount === undefined) return hadData ? 'stale' : 'idle';
  if (outcome.truncated === true) return 'partial';
  if (outcome.ageExceedsFreshness === true) return 'stale';
  return outcome.rowCount === 0 ? 'empty' : 'success';
}

export function surfaceStateMeansNoData(state: SurfaceState): boolean {
  return SURFACE_STATE_RULES[state].meansNoData;
}

export function surfaceStateRemedy(state: SurfaceState): SurfaceRemedy | null {
  return SURFACE_STATE_RULES[state].remedy;
}

/**
 * Never send a reader to a paywall for something that would still not work once
 * they paid, so an unsupported denial outranks a policy one and both outrank a
 * tier one.
 */
const DENIAL_LAYER_SURFACE_STATES: Readonly<Record<CapabilityLayer, SurfaceState>> = {
  model: 'unsupported',
  surface: 'unsupported',
  settings: 'policy_blocked',
  tier: 'entitlement_blocked',
};

const DENIAL_STATE_PRECEDENCE: readonly SurfaceState[] = [
  'unsupported',
  'policy_blocked',
  'entitlement_blocked',
];

export function surfaceStateForDenialLayers(layers: readonly CapabilityLayer[]): SurfaceState {
  const denied = new Set(layers.map((layer) => DENIAL_LAYER_SURFACE_STATES[layer]));
  return DENIAL_STATE_PRECEDENCE.find((state) => denied.has(state)) ?? 'error';
}

export function surfaceStateForResourceLifecycle(state: ResourceLifecycleState): SurfaceState {
  if (state === 'active') return 'success';
  if (state === 'archived') return 'archived';
  return 'deleted';
}

/**
 * The offline client's own spelling of the same idea, read through the one
 * vocabulary. Total on purpose: a sixth `SyncState` fails the build here rather
 * than falling through to `success`, which is what a default case used to do.
 */
const SYNC_STATE_SURFACE_STATES: Readonly<Record<SyncState, SurfaceState>> = {
  [SyncState.IDLE]: 'idle',
  [SyncState.SYNCING]: 'loading',
  [SyncState.ONLINE]: 'success',
  [SyncState.OFFLINE]: 'offline',
  [SyncState.ERROR]: 'error',
};

export function surfaceStateForSyncState(state: SyncState): SurfaceState {
  return SYNC_STATE_SURFACE_STATES[state];
}
