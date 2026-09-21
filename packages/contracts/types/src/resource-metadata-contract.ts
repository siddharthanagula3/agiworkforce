/**
 * The metadata every persistent resource carries, named once so a surface
 * reads a role rather than guessing at a column spelling.
 * `scripts/check-resource-metadata.mjs` resolves each role against the
 * migration history, so a role named here without a carrier fails the build.
 *
 * @module resource-metadata-contract
 */

export const RESOURCE_METADATA_ROLES = [
  'resourceType',
  'schemaVersion',
  'ownerAccount',
  'organization',
  'workspace',
  'project',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'archivedAt',
  'version',
  'visibility',
  'retentionClass',
  'source',
  'originSurface',
  'parent',
  'operationId',
  'startedAt',
  'progress',
  'stage',
  'cancellation',
  'retry',
  'result',
  'error',
  'requestId',
  'cost',
  'completedAt',
] as const;

export type ResourceMetadataRole = (typeof RESOURCE_METADATA_ROLES)[number];

export function isResourceMetadataRole(value: string): value is ResourceMetadataRole {
  return (RESOURCE_METADATA_ROLES as readonly string[]).includes(value);
}

/**
 * The shape stored rows are written against. A reader that finds a higher
 * version than it knows must refuse the row rather than interpret it.
 */
export const RESOURCE_SCHEMA_VERSION = 1;

export interface ResourceSchemaRef {
  resourceType: string;
  schemaVersion: number;
}

export function isReadableResourceSchema(
  ref: Pick<ResourceSchemaRef, 'schemaVersion'>,
  readerVersion: number = RESOURCE_SCHEMA_VERSION,
): boolean {
  return (
    Number.isInteger(ref.schemaVersion) &&
    ref.schemaVersion >= 1 &&
    ref.schemaVersion <= readerVersion
  );
}

/**
 * What an update quotes and what it is answered with. Without the expected
 * version a second writer replaces the first and neither is told; with it the
 * server can say whose write it kept and what the reader should do next.
 */
export interface VersionedWrite<Payload> {
  expectedVersion: number;
  payload: Payload;
}

export const WRITE_OUTCOMES = ['applied', 'conflict', 'stale_reader'] as const;

export type WriteOutcome = (typeof WRITE_OUTCOMES)[number];

export interface WriteConflict<Payload> {
  outcome: 'conflict' | 'stale_reader';
  /** What the row actually holds, so the reader can refresh without a second round trip. */
  current: Payload;
  currentVersion: number;
  expectedVersion: number;
  /** True when the two edits touch different fields and can be combined. */
  mergeable: boolean;
}

export type WriteResult<Payload> =
  { outcome: 'applied'; current: Payload; currentVersion: number } | WriteConflict<Payload>;

export interface ResolveWriteInput<Payload extends object> {
  stored: Payload;
  storedVersion: number;
  write: VersionedWrite<Payload>;
  /** The fields the writer actually changed, for deciding whether a merge is possible. */
  changedFields: readonly (keyof Payload)[];
  /** The fields changed since the version the writer read. */
  fieldsChangedSince: readonly (keyof Payload)[];
}

/**
 * A write that quotes the version it read either lands or is refused with the
 * row it lost to. An overwrite that discards someone else's field is the one
 * case that has to be recorded, because nobody else can see that it happened.
 */
export function resolveVersionedWrite<Payload extends object>(
  input: ResolveWriteInput<Payload>,
): WriteResult<Payload> {
  const { stored, storedVersion, write } = input;
  if (write.expectedVersion === storedVersion) {
    return { outcome: 'applied', current: write.payload, currentVersion: storedVersion + 1 };
  }
  const overlapping = input.changedFields.filter((field) =>
    input.fieldsChangedSince.includes(field),
  );
  return {
    outcome: write.expectedVersion > storedVersion ? 'stale_reader' : 'conflict',
    current: stored,
    currentVersion: storedVersion,
    expectedVersion: write.expectedVersion,
    mergeable: overlapping.length === 0,
  };
}

export function mergeVersionedWrite<Payload extends object>(
  conflict: WriteConflict<Payload>,
  payload: Payload,
  changedFields: readonly (keyof Payload)[],
): Payload | null {
  if (!conflict.mergeable) return null;
  const merged = { ...conflict.current };
  for (const field of changedFields) merged[field] = payload[field];
  return merged;
}

/** An overwrite a reader cannot see for themselves is one the audit trail owes them. */
export function overwriteNeedsAudit<Payload extends object>(
  result: WriteResult<Payload>,
  forced: boolean,
): boolean {
  return forced && result.outcome !== 'applied';
}
