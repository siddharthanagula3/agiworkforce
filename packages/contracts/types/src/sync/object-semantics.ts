/**
 * What cross-device sync carries and how it resolves a conflict, for every
 * object type, in one place. Each type used to answer separately in whichever
 * client module implemented it, five types the product treats as synced
 * answered nowhere, and a surface with no way to ask guessed instead.
 */

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
