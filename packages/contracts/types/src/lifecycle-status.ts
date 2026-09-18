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
import { ErrorCode, type ErrorCodeValue } from './errors';
import type { ResourceLifecycleState } from './resource-lifecycle';
import { SyncState } from './web-offline';

export const LIFECYCLE_STATUSES = [
  'idle',
  'pending',
  'queued',
  'running',
  'awaiting_input',
  'completed',
  'failed',
  'cancelled',
  'outcome_unknown',
] as const;

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

/**
 * `outcome_unknown` is absent on purpose: it is the state of work whose result
 * was never observed, so it still owes a reconciliation and is not an ending.
 */
export const TERMINAL_LIFECYCLE_STATUSES = [
  'completed',
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
  running: ['awaiting_input', 'completed', 'failed', 'cancelled', 'outcome_unknown'],
  awaiting_input: ['running', 'completed', 'failed', 'cancelled'],
  outcome_unknown: ['completed', 'failed', 'cancelled'],
  completed: [],
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
  'success',
  'error',
  'offline',
  'permission_denied',
  'policy_blocked',
  'entitlement_blocked',
  'unsupported',
  'deleted',
  'archived',
] as const;

export type SurfaceState = (typeof SURFACE_STATES)[number];

export const SURFACE_REMEDIES = [
  'wait',
  'retry',
  'reconnect',
  'sign_in',
  'request_access',
  'change_policy',
  'upgrade_plan',
  'choose_another',
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
}

/**
 * `offline` is retryable and never permanent: the request was never refused,
 * it was never made. Rendering it as a failure is the defect this table exists
 * to prevent.
 */
export const SURFACE_STATE_RULES: Readonly<Record<SurfaceState, SurfaceStateRule>> = {
  idle: { permanentFailure: false, retryable: false, remedy: null },
  loading: { permanentFailure: false, retryable: false, remedy: 'wait' },
  success: { permanentFailure: false, retryable: false, remedy: null },
  error: { permanentFailure: false, retryable: true, remedy: 'retry' },
  offline: { permanentFailure: false, retryable: true, remedy: 'reconnect' },
  permission_denied: { permanentFailure: true, retryable: false, remedy: 'request_access' },
  policy_blocked: { permanentFailure: true, retryable: false, remedy: 'change_policy' },
  entitlement_blocked: { permanentFailure: true, retryable: false, remedy: 'upgrade_plan' },
  unsupported: { permanentFailure: true, retryable: false, remedy: 'choose_another' },
  deleted: { permanentFailure: true, retryable: false, remedy: 'restore' },
  archived: { permanentFailure: false, retryable: false, remedy: 'restore' },
};

export function isSurfaceState(value: string): value is SurfaceState {
  return (SURFACE_STATES as readonly string[]).includes(value);
}

export function isPermanentFailureSurfaceState(state: SurfaceState): boolean {
  return SURFACE_STATE_RULES[state].permanentFailure;
}

const ERROR_CODE_SURFACE_STATES: Readonly<Partial<Record<ErrorCodeValue, SurfaceState>>> = {
  [ErrorCode.UNAUTHORIZED]: 'permission_denied',
  [ErrorCode.FORBIDDEN]: 'permission_denied',
  [ErrorCode.MFA_REQUIRED]: 'policy_blocked',
  [ErrorCode.IP_NOT_ALLOWED]: 'policy_blocked',
  [ErrorCode.PAYMENT_REQUIRED]: 'entitlement_blocked',
  [ErrorCode.CAPABILITY_UNAVAILABLE]: 'unsupported',
  [ErrorCode.NETWORK_ERROR]: 'offline',
};

export function surfaceStateForErrorCode(code: ErrorCodeValue): SurfaceState {
  return ERROR_CODE_SURFACE_STATES[code] ?? 'error';
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

export function surfaceStateForSyncState(state: SyncState): SurfaceState {
  switch (state) {
    case SyncState.OFFLINE:
      return 'offline';
    case SyncState.SYNCING:
      return 'loading';
    case SyncState.ERROR:
      return 'error';
    case SyncState.IDLE:
      return 'idle';
    default:
      return 'success';
  }
}
