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
