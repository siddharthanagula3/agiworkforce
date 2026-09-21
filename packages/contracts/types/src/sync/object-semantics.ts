/**
 * What cross-device sync carries and how it resolves a conflict, for every
 * object type, in one place. Each type used to answer separately in whichever
 * client module implemented it, five types the product treats as synced
 * answered nowhere, and a surface with no way to ask guessed instead.
 */

import type { SurfaceState } from '../lifecycle-status';

export const SYNC_OBJECT_TYPES = [
  'conversation',
  'message',
  'artifact',
  'project',
  'project-metadata',
  'memory',
  'memory-controls',
  'settings',
  'task',
  'notification',
  'connector',
  'skill',
  'device',
] as const;

export type SyncObjectType = (typeof SYNC_OBJECT_TYPES)[number];

/** Which surfaces sit inside the server-version sync boundary. */
export const SYNC_SURFACES = ['web', 'desktop', 'mobile'] as const;
export type SyncSurface = (typeof SYNC_SURFACES)[number];

/**
 * Surfaces outside the boundary. Each one is out for a reason, not by omission:
 * CLI and VS Code own developer sessions whose source of truth is the local
 * workspace, and Chrome keeps an authoritative local copy because a page's
 * turns may never be eligible for the cloud at all.
 */
export const NON_SYNC_SURFACES = ['cli', 'vscode', 'chrome'] as const;
export type NonSyncSurface = (typeof NON_SYNC_SURFACES)[number];

export type SyncConflictRule =
  | 'server-version-cas'
  | 'last-writer-wins'
  | 'restrictive-wins'
  | 'server-authoritative'
  | 'append-only';

export type SyncDeletionMode = 'tombstone' | 'hard-delete' | 'document-replace' | 'server-expiry';

/** Where the object's bytes live, which is a different question from its row. */
export type SyncPayloadLocation = 'cloud' | 'cloud-or-device' | 'device-only';

export interface SyncObjectSemantics {
  type: SyncObjectType;
  conflict: SyncConflictRule;
  deletion: SyncDeletionMode;
  payload: SyncPayloadLocation;
  /** False for a type the server owns outright and a client only mirrors. */
  clientMayWrite: boolean;
  surfaces: readonly SyncSurface[];
}

const ALL_SURFACES = SYNC_SURFACES;

export const SYNC_OBJECT_SEMANTICS: Readonly<Record<SyncObjectType, SyncObjectSemantics>> = {
  conversation: {
    type: 'conversation',
    conflict: 'server-version-cas',
    deletion: 'tombstone',
    payload: 'cloud',
    clientMayWrite: true,
    surfaces: ALL_SURFACES,
  },
  message: {
    type: 'message',
    conflict: 'server-version-cas',
    deletion: 'tombstone',
    payload: 'cloud',
    clientMayWrite: true,
    surfaces: ALL_SURFACES,
  },
  artifact: {
    type: 'artifact',
    conflict: 'server-version-cas',
    deletion: 'tombstone',
    payload: 'cloud-or-device',
    clientMayWrite: true,
    surfaces: ALL_SURFACES,
  },
  project: {
    type: 'project',
    conflict: 'server-version-cas',
    deletion: 'tombstone',
    payload: 'cloud',
    clientMayWrite: true,
    surfaces: ALL_SURFACES,
  },
  'project-metadata': {
    type: 'project-metadata',
    conflict: 'server-version-cas',
    deletion: 'tombstone',
    payload: 'cloud',
    clientMayWrite: true,
    surfaces: ALL_SURFACES,
  },
  memory: {
    type: 'memory',
    conflict: 'server-version-cas',
    deletion: 'tombstone',
    payload: 'cloud',
    clientMayWrite: true,
    surfaces: ALL_SURFACES,
  },
  // A consent decision, not content: the restrictive side of a conflict wins,
  // because losing "memory off" to a stale device collects what was refused.
  'memory-controls': {
    type: 'memory-controls',
    conflict: 'restrictive-wins',
    deletion: 'document-replace',
    payload: 'cloud',
    clientMayWrite: true,
    surfaces: ALL_SURFACES,
  },
  settings: {
    type: 'settings',
    conflict: 'server-version-cas',
    deletion: 'document-replace',
    payload: 'cloud',
    clientMayWrite: true,
    surfaces: ALL_SURFACES,
  },
  task: {
    type: 'task',
    conflict: 'server-authoritative',
    deletion: 'tombstone',
    payload: 'cloud',
    clientMayWrite: true,
    surfaces: ALL_SURFACES,
  },
  notification: {
    type: 'notification',
    conflict: 'server-authoritative',
    deletion: 'server-expiry',
    payload: 'cloud',
    clientMayWrite: false,
    surfaces: ALL_SURFACES,
  },
  connector: {
    type: 'connector',
    conflict: 'server-authoritative',
    deletion: 'hard-delete',
    payload: 'cloud',
    clientMayWrite: false,
    surfaces: ALL_SURFACES,
  },
  skill: {
    type: 'skill',
    conflict: 'server-authoritative',
    deletion: 'tombstone',
    payload: 'cloud-or-device',
    clientMayWrite: false,
    surfaces: ALL_SURFACES,
  },
  // A device row describes the device that sends it, so a second device never
  // edits it and there is no conflict to resolve.
  device: {
    type: 'device',
    conflict: 'server-authoritative',
    deletion: 'server-expiry',
    payload: 'cloud',
    clientMayWrite: false,
    surfaces: ALL_SURFACES,
  },
};

export function syncObjectSemantics(type: SyncObjectType): SyncObjectSemantics {
  return SYNC_OBJECT_SEMANTICS[type];
}

export function isSyncObjectType(value: string): value is SyncObjectType {
  return (SYNC_OBJECT_TYPES as readonly string[]).includes(value);
}

export function syncObjectCarriesTombstone(type: SyncObjectType): boolean {
  return SYNC_OBJECT_SEMANTICS[type].deletion === 'tombstone';
}

export function surfaceIsInsideSyncBoundary(surface: string): surface is SyncSurface {
  return (SYNC_SURFACES as readonly string[]).includes(surface);
}

/**
 * A row syncs; bytes do not have to. Two of the payload locations above mean a
 * reader can hold the row, the title and the timestamps and still have nothing
 * to open, because the bytes are on a device that is asleep, was removed from
 * the account, or stopped reporting. A surface that assumed every row it synced
 * had bytes in the cloud rendered those as empty or broken, which told the
 * reader their work was gone.
 */
export const PAYLOAD_UNAVAILABILITY_REASONS = [
  'holder_unreachable',
  'holder_removed',
  'holder_lost',
  'remote_access_denied',
] as const;

export type PayloadUnavailabilityReason = (typeof PAYLOAD_UNAVAILABILITY_REASONS)[number];

/**
 * What became of the device whose disk the bytes are on. `lost` is a device
 * that stopped reporting without being removed, which is not the same as one a
 * user deliberately unlinked: the first may come back, the second will not.
 */
export const PAYLOAD_HOLDER_STATES = [
  'cloud',
  'this_device',
  'reachable',
  'unreachable',
  'removed',
  'lost',
] as const;

export type PayloadHolderState = (typeof PAYLOAD_HOLDER_STATES)[number];

/**
 * Where a type's bytes are permitted to be does not say where this object's
 * bytes actually are, so the caller states both and this refuses the pairs that
 * cannot happen. A `device-only` object with a cloud holder is a sync bug, not
 * a reading, and answering it would hide the bug behind an available payload.
 */
export function payloadHolderIsPossible(
  payload: SyncPayloadLocation,
  holder: PayloadHolderState,
): boolean {
  if (payload === 'cloud') return holder === 'cloud';
  if (payload === 'device-only') return holder !== 'cloud';
  return true;
}

export interface PayloadReadInput {
  payload: SyncPayloadLocation;
  holder: PayloadHolderState;
  /** Whether this account may pull bytes from another of its own devices. */
  remoteAccessAllowed?: boolean;
}

export interface PayloadReadOutcome {
  /** Whether the bytes can be produced for this reader at all. */
  available: boolean;
  reason: PayloadUnavailabilityReason | null;
  /** Whether waiting or reconnecting could make it available without a restore. */
  recoverable: boolean;
}

const AVAILABLE: PayloadReadOutcome = Object.freeze({
  available: true,
  reason: null,
  recoverable: false,
});

const unavailable = (
  reason: PayloadUnavailabilityReason,
  recoverable: boolean,
): PayloadReadOutcome => ({ available: false, reason, recoverable });

/**
 * Whether a reader can open this object's bytes, and if not, why and whether
 * that is temporary. A device that was unlinked or lost does not come back on
 * its own, so those two are not recoverable and the reader is owed a restore
 * rather than a spinner.
 */
export function payloadReadOutcome(input: PayloadReadInput): PayloadReadOutcome {
  if (input.holder === 'cloud' || input.holder === 'this_device') return AVAILABLE;
  if (input.holder === 'removed') return unavailable('holder_removed', false);
  if (input.holder === 'lost') return unavailable('holder_lost', false);
  if (input.remoteAccessAllowed !== true) return unavailable('remote_access_denied', false);
  if (input.holder === 'unreachable') return unavailable('holder_unreachable', true);
  return AVAILABLE;
}

/**
 * What the reader is shown. `empty` is deliberately unreachable here: bytes
 * nobody can produce are not an object with nothing in it, and rendering them
 * that way is how a user concludes their work was lost.
 */
const PAYLOAD_UNAVAILABILITY_SURFACE_STATES: Readonly<
  Record<PayloadUnavailabilityReason, SurfaceState>
> = {
  holder_unreachable: 'offline',
  holder_removed: 'deleted',
  holder_lost: 'deleted',
  remote_access_denied: 'policy_blocked',
};

export function surfaceStateForPayloadRead(outcome: PayloadReadOutcome): SurfaceState {
  if (outcome.reason === null) return 'success';
  return PAYLOAD_UNAVAILABILITY_SURFACE_STATES[outcome.reason];
}

/** The types whose bytes may not be in the cloud, so a reader may come up empty. */
export function deviceBoundSyncObjectTypes(): readonly SyncObjectType[] {
  return SYNC_OBJECT_TYPES.filter((type) => SYNC_OBJECT_SEMANTICS[type].payload !== 'cloud');
}
