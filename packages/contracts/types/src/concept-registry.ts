/**
 * @file concept-registry.ts
 * @module @agiworkforce/types/concept-registry
 *
 * # One name, one schema, one owner, per domain concept
 *
 * Before this file each concept answered "where does it live" in whatever
 * guard happened to cover it: check-service-domain-ownership.mjs for three
 * packages, check-model-catalog-integrity.mjs for the catalogue,
 * check-plan-tier-predicates.mjs for one enum. Nothing enumerated, per
 * concept, its canonical schema, every table that stores it, every service
 * that mutates it, and every vocabulary that spells it a second time.
 *
 * `concept-registry.json` is that enumeration and this file is its type.
 * `scripts/check-concept-registry.mjs` re-derives the storage, the mutators
 * and the duplicate vocabularies from the tree on every run and fails when a
 * claim here no longer holds, so the registry cannot quietly go stale.
 *
 * The column contract below names roles, not spellings. `owner` is the role
 * "the account this row belongs to"; which column plays it is per concept
 * (`user_id` for a conversation, `owner_account_id` for a workspace). A table
 * created after `baselineMigration` has to fill the required roles or be
 * recorded as an exemption with a reason.
 */

import conceptRegistryJson from './concept-registry.json' with { type: 'json' };
import type { ResourceChildDisposition, ResourceLifecycleState } from './resource-lifecycle';
import type { SourceSurface } from './suite-contracts';

export const CONCEPT_NAMES = [
  'conversation',
  'message',
  'project',
  'memory',
  'schedule',
  'skill',
  'connector',
  'artifact',
  'workspace',
  'subscription',
  'credit-bucket',
  'usage-reservation',
  'audit-event',
  'file',
  'notification',
  'device',
  'agent-run',
  'feature-release',
  'client-capability-manifest',
] as const;

export type ConceptName = (typeof CONCEPT_NAMES)[number];

/** A row is produced by a product surface, or by the public API on its behalf. */
export type OriginSurface = SourceSurface | 'api';

export type ResourceColumnRole =
  | 'owner'
  | 'tenant'
  | 'parent'
  | 'project'
  | 'createdBy'
  | 'updatedBy'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
  | 'originSurface';

/**
 * How a concept's rows are scoped. `parent` is a child object with no owner of
 * its own: a message is reachable only through the conversation that owns it.
 */
export type ConceptOwnership =
  'user' | 'organization' | 'user-and-organization' | 'platform' | 'parent';

export type ConceptSyncDirection =
  'server-authoritative' | 'client-authoritative' | 'bidirectional' | 'none';

export type ConceptVersioning =
  'server-version' | 'revision-counter' | 'updated-at' | 'append-only' | 'none';

/**
 * Whose deletion takes the row with it. `retained-after-tenant-deletion` is the
 * audit trail's boundary: the rows outlive the organization they describe.
 */
export type ConceptAuditBoundary =
  'none' | 'user' | 'organization' | 'retained-after-tenant-deletion';

export interface ResourceColumnRule {
  column: string;
  why: string;
}

export interface ResourceColumnContract {
  baselineMigration: number;
  roles: Readonly<Record<ResourceColumnRole, ResourceColumnRule>>;
}

/**
 * Who may reach a row. The rule is not a restatement of the ownership: a
 * workspace row is owned by an account and reached by a role, and conflating
 * the two is how a member reads a row an admin was meant to.
 */
export type ConceptAccessRule =
  | 'owner-only'
  | 'owner-or-tenant-member'
  | 'tenant-role'
  | 'parent-inherited'
  | 'share-token'
  | 'platform-only';

export type ConceptDataClass =
  'user-content' | 'identity' | 'credential' | 'billing' | 'operational' | 'telemetry';

/** Where the object lives. A device object never reaches a table. */
export type ConceptStorageScope = 'cloud' | 'device' | 'both';

/**
 * What ends the row. `swept` names the module that does it, because a
 * retention promise nothing executes is the promise most often believed.
 */
export type ConceptRetention =
  | { kind: 'until-deleted' }
  | { kind: 'swept'; purgedBy: string }
  | { kind: 'audit-class'; class: string }
  | { kind: 'tenant-policy'; policy: string };

export interface ConceptRecord {
  name: ConceptName;
  label: string;
  schema: string;
  symbol: string;
  /** Every other name the concept's own code uses for it, and no other's. */
  aliases: readonly string[];
  tables: readonly string[];
  /** The primary key of the first table, or null for a device-only object. */
  identity: string | null;
  writeFunctions: readonly string[];
  mutators: readonly string[];
  projections: readonly string[];
  providerCopies: readonly string[];
  ownership: ConceptOwnership;
  access: ConceptAccessRule;
  parent?: ConceptName;
  sync: ConceptSyncDirection;
  storage: ConceptStorageScope;
  versioning: ConceptVersioning;
  lifecycle: ResourceLifecycleState;
  childDisposition: ResourceChildDisposition;
  retention: ConceptRetention;
  classification: readonly ConceptDataClass[];
  auditBoundary: ConceptAuditBoundary;
  /** The audit event types whose emission concerns this concept. */
  events: readonly string[];
  /** The product link target that addresses it, or null when it has no URL. */
  deepLink: string | null;
  columns: Readonly<Partial<Record<ResourceColumnRole, string>>>;
}

export type TableDisposition =
  'identity' | 'operational' | 'telemetry' | 'pre-account' | 'canonical-gap';

/**
 * A table a user owns that is not a canonical object, and why. `canonical-gap`
 * is the only defect in the list: it names the object the table should belong
 * to and the change that would make it one.
 */
export interface TableDispositionRecord {
  table: string;
  disposition: TableDisposition;
  why: string;
  becomes?: string;
  fix?: string;
}

export interface ConceptVocabularyReference {
  file: string;
  name: string;
}

/**
 * A concept spelled twice. `migrateBy` is not decoration: an unmerged duplicate
 * without a date is a duplicate nobody owns, and the guard rejects it.
 */
export interface DuplicateVocabulary {
  first: ConceptVocabularyReference;
  second: ConceptVocabularyReference;
  resolution: 'merge' | 'keep-distinct';
  migrateBy: string;
  why: string;
}

export interface ConceptRegistry {
  columnContract: ResourceColumnContract;
  originSurfaces: readonly OriginSurface[];
  concepts: readonly ConceptRecord[];
  duplicateVocabularies: readonly DuplicateVocabulary[];
  columnExemptions: readonly { table: string; why: string; exempt?: readonly string[] }[];
  tableDispositions: readonly TableDispositionRecord[];
  uiStateColumns: readonly { match: string; why: string }[];
  vendorImports: readonly string[];
  /** A canonical schema still outside the shared packages, with the move that fixes it. */
  schemaHomeExemptions: readonly { concept: string; schema: string; why: string; fix: string }[];
}

export const CONCEPT_REGISTRY = conceptRegistryJson as ConceptRegistry;

export const RESOURCE_COLUMN_CONTRACT = CONCEPT_REGISTRY.columnContract;

export const ORIGIN_SURFACES = CONCEPT_REGISTRY.originSurfaces;

export function isConceptName(value: string | null | undefined): value is ConceptName {
  return typeof value === 'string' && (CONCEPT_NAMES as readonly string[]).includes(value);
}

export function isOriginSurface(value: string | null | undefined): value is OriginSurface {
  return typeof value === 'string' && (ORIGIN_SURFACES as readonly string[]).includes(value);
}

export function getConcept(name: ConceptName): ConceptRecord {
  const concept = CONCEPT_REGISTRY.concepts.find((candidate) => candidate.name === name);
  if (!concept) throw new Error(`Concept ${name} is not registered`);
  return concept;
}

export function conceptForTable(table: string): ConceptRecord | null {
  return CONCEPT_REGISTRY.concepts.find((concept) => concept.tables.includes(table)) ?? null;
}

export function resourceColumn(name: ConceptName, role: ResourceColumnRole): string | null {
  return getConcept(name).columns[role] ?? null;
}

export function conceptByAlias(name: string): ConceptRecord | null {
  const lowered = name.toLowerCase();
  return (
    CONCEPT_REGISTRY.concepts.find(
      (concept) => concept.name === lowered || concept.aliases.includes(lowered),
    ) ?? null
  );
}

export function tableDisposition(table: string): TableDispositionRecord | null {
  return CONCEPT_REGISTRY.tableDispositions.find((entry) => entry.table === table) ?? null;
}
