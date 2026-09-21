/**
 * The lifecycle of one negotiated commercial agreement, as one table.
 * Every surface that moves an agreement asks here whether the move is legal.
 */

export const CONTRACT_LIFECYCLE_STATES = [
  'draft',
  'pending_signature',
  'executed',
  'expired',
  'terminated',
  'superseded',
] as const;

export type ContractLifecycleState = (typeof CONTRACT_LIFECYCLE_STATES)[number];

export const CONTRACT_LIFECYCLE_EVENTS = [
  'send_for_signature',
  'record_signature',
  'amend',
  'renew',
  'terminate',
  'term_lapsed',
] as const;

export type ContractLifecycleEvent = (typeof CONTRACT_LIFECYCLE_EVENTS)[number];

export const CONTRACT_TRANSITION_REFUSALS = [
  'already_pending_signature',
  'already_executed',
  'not_signed_yet',
  'agreement_not_in_force',
  'agreement_already_ended',
  'history_is_immutable',
  'no_term_in_force',
  'term_already_lapsed',
] as const;

export type ContractTransitionRefusal = (typeof CONTRACT_TRANSITION_REFUSALS)[number];

export interface AllowedContractTransition {
  readonly allowed: true;
  /** The state the version the event was applied to ends in. */
  readonly to: ContractLifecycleState;
  /** Whether the event authors a superseding version alongside that move. */
  readonly authorsNewVersion: boolean;
}

export interface RefusedContractTransition {
  readonly allowed: false;
  readonly refusal: ContractTransitionRefusal;
}

export type ContractTransition = AllowedContractTransition | RefusedContractTransition;

type TransitionTable = Readonly<
  Record<ContractLifecycleState, Readonly<Record<ContractLifecycleEvent, ContractTransition>>>
>;

function move(to: ContractLifecycleState, authorsNewVersion = false): AllowedContractTransition {
  return Object.freeze({ allowed: true, to, authorsNewVersion });
}

function refuse(refusal: ContractTransitionRefusal): RefusedContractTransition {
  return Object.freeze({ allowed: false, refusal });
}

export const CONTRACT_TRANSITIONS: TransitionTable = Object.freeze({
  draft: Object.freeze({
    send_for_signature: move('pending_signature'),
    record_signature: move('executed'),
    amend: refuse('not_signed_yet'),
    renew: refuse('not_signed_yet'),
    terminate: refuse('not_signed_yet'),
    term_lapsed: refuse('no_term_in_force'),
  }),
  pending_signature: Object.freeze({
    send_for_signature: refuse('already_pending_signature'),
    record_signature: move('executed'),
    amend: refuse('not_signed_yet'),
    renew: refuse('not_signed_yet'),
    terminate: refuse('not_signed_yet'),
    term_lapsed: refuse('no_term_in_force'),
  }),
  executed: Object.freeze({
    send_for_signature: refuse('already_executed'),
    record_signature: refuse('already_executed'),
    amend: move('superseded', true),
    renew: move('superseded', true),
    terminate: move('terminated'),
    term_lapsed: move('expired'),
  }),
  expired: Object.freeze({
    send_for_signature: refuse('agreement_already_ended'),
    record_signature: refuse('agreement_already_ended'),
    amend: refuse('agreement_not_in_force'),
    renew: move('superseded', true),
    terminate: refuse('agreement_already_ended'),
    term_lapsed: refuse('term_already_lapsed'),
  }),
  terminated: Object.freeze({
    send_for_signature: refuse('agreement_already_ended'),
    record_signature: refuse('agreement_already_ended'),
    amend: refuse('agreement_already_ended'),
    renew: refuse('agreement_already_ended'),
    terminate: refuse('agreement_already_ended'),
    term_lapsed: refuse('agreement_already_ended'),
  }),
  superseded: Object.freeze({
    send_for_signature: refuse('history_is_immutable'),
    record_signature: refuse('history_is_immutable'),
    amend: refuse('history_is_immutable'),
    renew: refuse('history_is_immutable'),
    terminate: refuse('history_is_immutable'),
    term_lapsed: refuse('history_is_immutable'),
  }),
});

/** States a version can still be moved out of. */
export const TERMINAL_CONTRACT_LIFECYCLE_STATES: readonly ContractLifecycleState[] = Object.freeze([
  'terminated',
  'superseded',
]);

/** The only state whose terms a workspace is billed and entitled under. */
export const CONTRACT_STATES_IN_FORCE: readonly ContractLifecycleState[] = Object.freeze([
  'executed',
]);

/**
 * States the agreement table stores as a status. An ending is a date on the
 * row, and expiry is read from the term, so neither is ever swept into place.
 */
export const PERSISTED_CONTRACT_STATES: readonly ContractLifecycleState[] = Object.freeze([
  'draft',
  'pending_signature',
  'executed',
  'superseded',
]);

/** States that exist only as a consequence of a date on the row. */
export const DERIVED_CONTRACT_STATES: readonly ContractLifecycleState[] = Object.freeze([
  'expired',
  'terminated',
]);

export function isContractLifecycleState(value: unknown): value is ContractLifecycleState {
  return (
    typeof value === 'string' && CONTRACT_LIFECYCLE_STATES.includes(value as ContractLifecycleState)
  );
}

export function applyContractEvent(
  state: ContractLifecycleState,
  event: ContractLifecycleEvent,
): ContractTransition {
  return CONTRACT_TRANSITIONS[state][event];
}

export function allowedContractEvents(
  state: ContractLifecycleState,
): readonly ContractLifecycleEvent[] {
  return CONTRACT_LIFECYCLE_EVENTS.filter((event) => CONTRACT_TRANSITIONS[state][event].allowed);
}

/**
 * The state a newly authored version starts in. A version is executed only when
 * the signature that executes it is in hand.
 */
export function authoredVersionState(hasSignature: boolean): ContractLifecycleState {
  return hasSignature ? 'executed' : 'draft';
}

export const CONTRACT_CHANGE_KINDS = ['initial', 'amendment', 'renewal'] as const;

export type ContractChangeKind = (typeof CONTRACT_CHANGE_KINDS)[number];

export function changeKindForEvent(event: ContractLifecycleEvent): ContractChangeKind | null {
  if (event === 'amend') return 'amendment';
  if (event === 'renew') return 'renewal';
  return null;
}

export interface ContractTermWindow {
  /** Inclusive first day of the term, as YYYY-MM-DD. */
  readonly termStart: string;
  /** Inclusive last day of the term, as YYYY-MM-DD. */
  readonly termEnd: string;
  /** Whole days past the term end the agreement keeps granting, negotiated per contract. */
  readonly expiryGraceDays: number;
}

export const CONTRACT_FORCE_REASONS = [
  'in_force',
  'in_grace',
  'not_started',
  'expired',
  'terminated',
  'superseded',
  'not_executed',
] as const;

export type ContractForceReason = (typeof CONTRACT_FORCE_REASONS)[number];

export interface ContractForce {
  readonly inForce: boolean;
  readonly reason: ContractForceReason;
  readonly lifecycleState: ContractLifecycleState;
  /** Last day the agreement grants anything, grace included. */
  readonly grantsThrough: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

function dayNumber(isoDate: string): number {
  if (!ISO_DATE.test(isoDate)) {
    throw new RangeError(`A contract date must be written as YYYY-MM-DD, received "${isoDate}".`);
  }
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  const utc = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(utc)) {
    throw new RangeError(`"${isoDate}" is not a calendar date.`);
  }
  return Math.floor(utc / MS_PER_DAY);
}

export function addDaysToContractDate(isoDate: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new RangeError('A contract date moves by whole days only.');
  }
  const moved = new Date((dayNumber(isoDate) + days) * MS_PER_DAY);
  return moved.toISOString().slice(0, 10);
}

export function contractDaysBetween(fromIsoDate: string, toIsoDate: string): number {
  return dayNumber(toIsoDate) - dayNumber(fromIsoDate);
}

/**
 * Whether an agreement grants anything on a given day. Expiry is computed from
 * the term and the negotiated grace, so nothing has to run for it to take effect.
 */
export function resolveContractForce(input: {
  readonly state: ContractLifecycleState;
  readonly window: ContractTermWindow;
  readonly asOfDate: string;
}): ContractForce {
  const { state, window, asOfDate } = input;
  if (state === 'terminated') {
    return { inForce: false, reason: 'terminated', lifecycleState: state, grantsThrough: null };
  }
  if (state === 'superseded') {
    return { inForce: false, reason: 'superseded', lifecycleState: state, grantsThrough: null };
  }
  if (state !== 'executed' && state !== 'expired') {
    return { inForce: false, reason: 'not_executed', lifecycleState: state, grantsThrough: null };
  }

  if (!Number.isInteger(window.expiryGraceDays) || window.expiryGraceDays < 0) {
    throw new RangeError('A contract expiry grace is a whole number of days, zero or more.');
  }
  const grantsThrough = addDaysToContractDate(window.termEnd, window.expiryGraceDays);
  const today = dayNumber(asOfDate);

  if (today < dayNumber(window.termStart)) {
    return { inForce: false, reason: 'not_started', lifecycleState: 'executed', grantsThrough };
  }
  if (today > dayNumber(grantsThrough)) {
    return { inForce: false, reason: 'expired', lifecycleState: 'expired', grantsThrough };
  }
  if (today > dayNumber(window.termEnd)) {
    return { inForce: true, reason: 'in_grace', lifecycleState: 'expired', grantsThrough };
  }
  return { inForce: true, reason: 'in_force', lifecycleState: 'executed', grantsThrough };
}
