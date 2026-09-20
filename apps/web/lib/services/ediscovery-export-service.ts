import 'server-only';

import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  HOLD_COLUMNS,
  LEGAL_HOLD_RESOURCE_TYPES,
  formatHold,
  heldSubjects,
  holdCovers,
  type HoldRow,
  type LegalHold,
  type LegalHoldResourceType,
} from './retention-service';

export const EDISCOVERY_PAGE_SIZE = 500;

export type EdiscoveryRecordType = 'hold' | LegalHoldResourceType;

export interface EdiscoveryRecord {
  type: EdiscoveryRecordType;
  data: Record<string, unknown>;
}

interface SourceDefinition {
  type: LegalHoldResourceType;
  /** The table the contract declares for this store, read back by the guard. */
  table: string;
  sql: string;
}

/**
 * Every source binds the same parameters in the same order, so a filter that
 * reaches one store reaches all of them. Nulls in $2, $6 and $7 mean unbounded.
 */
const SOURCES: readonly SourceDefinition[] = [
  {
    type: 'conversation',
    table: 'web_conversations',
    sql: `select c.id, c.user_id, c.title, c.model, c.project_id, c.created_at, c.updated_at,
                 c.deleted_at,
                 true as content_preserved
            from public.web_conversations c
           where c.organization_id = $1
             and ($2::text[] is null or c.user_id = any($2::text[]))
             and (c.created_at, c.id) > ($3::timestamptz, $4::uuid)
             and ($6::timestamptz is null or c.created_at >= $6)
             and ($7::timestamptz is null or c.created_at < $7)
           order by c.created_at, c.id
           limit $5`,
  },
  {
    type: 'message',
    table: 'web_messages',
    sql: `select m.id, m.conversation_id, c.user_id, m.role, m.content, m.model, m.provider,
                 m.created_at, true as content_preserved
            from public.web_messages m
            join public.web_conversations c on c.id = m.conversation_id
           where c.organization_id = $1
             and ($2::text[] is null or c.user_id = any($2::text[]))
             and (m.created_at, m.id) > ($3::timestamptz, $4::uuid)
             and ($6::timestamptz is null or m.created_at >= $6)
             and ($7::timestamptz is null or m.created_at < $7)
           order by m.created_at, m.id
           limit $5`,
  },
  {
    type: 'project',
    table: 'user_projects',
    sql: `select p.id, p.user_id, p.name, p.description, p.instructions, p.is_archived,
                 p.created_at, p.updated_at, true as content_preserved
            from public.user_projects p
           where p.organization_id = $1
             and ($2::text[] is null or p.user_id = any($2::text[]))
             and (p.created_at, p.id) > ($3::timestamptz, $4::uuid)
             and ($6::timestamptz is null or p.created_at >= $6)
             and ($7::timestamptz is null or p.created_at < $7)
           order by p.created_at, p.id
           limit $5`,
  },
  {
    type: 'project_file',
    table: 'project_knowledge_files',
    sql: `select k.id, k.project_id, p.user_id, k.file_name, k.mime_type, k.byte_count,
                 k.checksum_sha256, k.summary, k.storage_uri, k.added_by_user_id, k.created_at,
                 (k.storage_uri is not null) as content_preserved
            from public.project_knowledge_files k
            join public.user_projects p on p.id = k.project_id
           where p.organization_id = $1
             and ($2::text[] is null or p.user_id = any($2::text[]))
             and (k.created_at, k.id) > ($3::timestamptz, $4::uuid)
             and ($6::timestamptz is null or k.created_at >= $6)
             and ($7::timestamptz is null or k.created_at < $7)
           order by k.created_at, k.id
           limit $5`,
  },
  {
    type: 'file',
    table: 'media_assets',
    sql: `select f.id, f.user_id, f.kind, f.mime_type, f.byte_size, f.storage_pathname, f.prompt,
                 f.provider, f.model, f.source_surface, f.created_at, f.deleted_at,
                 (f.storage_pathname is not null) as content_preserved
            from public.media_assets f
           where f.organization_id = $1
             and ($2::text[] is null or f.user_id = any($2::text[]))
             and (f.created_at, f.id) > ($3::timestamptz, $4::uuid)
             and ($6::timestamptz is null or f.created_at >= $6)
             and ($7::timestamptz is null or f.created_at < $7)
           order by f.created_at, f.id
           limit $5`,
  },
  {
    type: 'artifact',
    table: 'web_artifacts',
    sql: `select a.id, a.user_id, a.conversation_id, a.title, a.artifact_type, a.language,
                 a.content, a.current_version, a.created_at, a.updated_at, a.deleted_at,
                 true as content_preserved
            from public.web_artifacts a
           where a.organization_id = $1
             and ($2::text[] is null or a.user_id = any($2::text[]))
             and (a.created_at, a.id) > ($3::timestamptz, $4::uuid)
             and ($6::timestamptz is null or a.created_at >= $6)
             and ($7::timestamptz is null or a.created_at < $7)
           order by a.created_at, a.id
           limit $5`,
  },
  {
    type: 'work_run',
    table: 'cloud_agent_runs',
    sql: `select r.id, r.user_id, r.conversation_id, r.origin_surface, r.work_mode, r.state,
                 r.provider, r.model, r.created_at, r.completed_at, true as content_preserved
            from public.cloud_agent_runs r
           where r.organization_id = $1
             and ($2::text[] is null or r.user_id = any($2::text[]))
             and (r.created_at, r.id) > ($3::timestamptz, $4::uuid)
             and ($6::timestamptz is null or r.created_at >= $6)
             and ($7::timestamptz is null or r.created_at < $7)
           order by r.created_at, r.id
           limit $5`,
  },
];

const START_CURSOR = { createdAt: '-infinity', id: '00000000-0000-0000-0000-000000000000' };

export const EDISCOVERY_GENESIS_HASH = '0'.repeat(64);

export interface EdiscoveryFilter {
  /** null exports every store the hold covers. */
  resourceTypes: LegalHoldResourceType[] | null;
  /** null exports every custodian the hold covers. */
  custodianUserIds: string[] | null;
  /** Inclusive lower bound on the record's own created_at. */
  from: string | null;
  /** Exclusive upper bound, so two adjacent windows neither overlap nor gap. */
  to: string | null;
}

export const UNFILTERED_EXPORT: EdiscoveryFilter = {
  resourceTypes: null,
  custodianUserIds: null,
  from: null,
  to: null,
};

export interface EdiscoveryManifestEntry {
  resourceType: EdiscoveryRecordType;
  records: number;
  bytes: number;
  /** Records carrying metadata for content this product never stored. */
  referenceOnly: number;
  sha256: string;
}

export interface EdiscoveryManifest {
  holdId: string;
  holdName: string;
  organizationId: string;
  filter: EdiscoveryFilter;
  /** The stores actually exported, after the hold's own scope narrowed the filter. */
  resourceTypes: EdiscoveryRecordType[];
  custodianUserIds: string[] | null;
  entries: EdiscoveryManifestEntry[];
  records: number;
  bytes: number;
  referenceOnly: number;
  sha256: string;
  generatedAt: string;
}

const SOURCE_BY_TYPE: ReadonlyMap<LegalHoldResourceType, SourceDefinition> = new Map(
  SOURCES.map((source) => [source.type, source]),
);

// A store a hold can name and the export cannot read would leave the manifest
// claiming evidence nobody received.
export function unexportableResourceTypes(): LegalHoldResourceType[] {
  return LEGAL_HOLD_RESOURCE_TYPES.filter((type) => !SOURCE_BY_TYPE.has(type));
}

export function exportSourceTable(type: LegalHoldResourceType): string | null {
  return SOURCE_BY_TYPE.get(type)?.table ?? null;
}

function toCursorValue(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * A filter can only narrow what the hold preserves: the hold is the authority
 * the export runs on, so asking past it returns nothing rather than reaching.
 */
export function exportedResourceTypes(
  hold: LegalHold,
  filter: EdiscoveryFilter,
): LegalHoldResourceType[] {
  return LEGAL_HOLD_RESOURCE_TYPES.filter(
    (type) => holdCovers(hold, type) && (filter.resourceTypes?.includes(type) ?? true),
  );
}

/**
 * The people this export reads, or null for the whole workspace. A hold that
 * already names people bounds the filter; the filter can only intersect it.
 */
export function exportedCustodians(hold: LegalHold, filter: EdiscoveryFilter): string[] | null {
  const held = heldSubjects(hold);
  if (held.length === 0)
    return filter.custodianUserIds?.length ? [...filter.custodianUserIds] : null;
  if (!filter.custodianUserIds?.length) return held;
  const wanted = new Set(filter.custodianUserIds);
  return held.filter((userId) => wanted.has(userId));
}

export interface EdiscoveryExportChunk {
  records: EdiscoveryRecord[];
  resourceType: EdiscoveryRecordType;
  /** Of those records, how many carry no content this product holds. */
  referenceOnly: number;
}

export async function* iterateLegalHoldExport(
  db: DatabaseAdapter,
  hold: LegalHold,
  filter: EdiscoveryFilter = UNFILTERED_EXPORT,
): AsyncGenerator<EdiscoveryExportChunk> {
  yield {
    resourceType: 'hold',
    records: [{ type: 'hold', data: { ...hold } }],
    referenceOnly: 0,
  };

  const custodians = exportedCustodians(hold, filter);
  // An intersection that came out empty is not "no filter": it means the filter
  // asked for people this hold does not preserve, and exporting the whole
  // workspace instead would reach past the hold.
  if (custodians !== null && custodians.length === 0) return;

  const types = new Set(exportedResourceTypes(hold, filter));
  const unreadable = [...types].filter((type) => !SOURCE_BY_TYPE.has(type));
  if (unreadable.length > 0) {
    throw new Error(
      `This hold preserves ${unreadable.join(', ')} and the export has no source for it, ` +
        'so the export would be incomplete without saying so.',
    );
  }

  for (const source of SOURCES) {
    if (!types.has(source.type)) continue;
    let cursor = START_CURSOR;
    for (;;) {
      const rows = await db.query<Record<string, unknown>>(source.sql, [
        hold.organizationId,
        custodians,
        cursor.createdAt,
        cursor.id,
        EDISCOVERY_PAGE_SIZE,
        filter.from,
        filter.to,
      ]);
      if (rows.length === 0) break;
      yield {
        resourceType: source.type,
        records: rows.map((data) => ({ type: source.type, data })),
        referenceOnly: rows.filter((row) => row['content_preserved'] === false).length,
      };
      const last = rows[rows.length - 1] as Record<string, unknown>;
      cursor = { createdAt: toCursorValue(last['created_at']), id: String(last['id']) };
      if (rows.length < EDISCOVERY_PAGE_SIZE) break;
    }
  }
}

/**
 * The digest covers the bytes that left the process, not a re-serialization of
 * the rows: checksumming what the recipient never received proves nothing.
 */
export class EdiscoveryManifestBuilder {
  private readonly entries = new Map<
    EdiscoveryRecordType,
    { records: number; bytes: number; referenceOnly: number; hash: ReturnType<typeof createHash> }
  >();
  private readonly whole = createHash('sha256');
  private totalRecords = 0;
  private totalBytes = 0;
  private totalReferenceOnly = 0;

  // Seeded with every store the hold puts in scope, so a store that produced
  // nothing says zero rather than being absent from the manifest entirely.
  constructor(
    private readonly hold: LegalHold,
    private readonly filter: EdiscoveryFilter,
  ) {
    for (const resourceType of ['hold' as const, ...exportedResourceTypes(hold, filter)]) {
      this.entry(resourceType);
    }
  }

  private entry(resourceType: EdiscoveryRecordType) {
    let entry = this.entries.get(resourceType);
    if (!entry) {
      entry = { records: 0, bytes: 0, referenceOnly: 0, hash: createHash('sha256') };
      this.entries.set(resourceType, entry);
    }
    return entry;
  }

  add(
    resourceType: EdiscoveryRecordType,
    records: number,
    bytes: Uint8Array,
    referenceOnly = 0,
  ): void {
    const entry = this.entry(resourceType);
    entry.records += records;
    entry.bytes += bytes.byteLength;
    entry.referenceOnly += referenceOnly;
    entry.hash.update(bytes);
    this.whole.update(bytes);
    this.totalRecords += records;
    this.totalBytes += bytes.byteLength;
    this.totalReferenceOnly += referenceOnly;
  }

  build(generatedAt: string): EdiscoveryManifest {
    return {
      holdId: this.hold.id,
      holdName: this.hold.name,
      organizationId: this.hold.organizationId,
      filter: this.filter,
      resourceTypes: exportedResourceTypes(this.hold, this.filter),
      custodianUserIds: exportedCustodians(this.hold, this.filter),
      entries: [...this.entries.entries()].map(([resourceType, entry]) => ({
        resourceType,
        records: entry.records,
        bytes: entry.bytes,
        referenceOnly: entry.referenceOnly,
        sha256: entry.hash.copy().digest('hex'),
      })),
      records: this.totalRecords,
      bytes: this.totalBytes,
      referenceOnly: this.totalReferenceOnly,
      sha256: this.whole.copy().digest('hex'),
      generatedAt,
    };
  }
}

export interface EdiscoveryCustodyInput {
  organizationId: string;
  holdId: string;
  holdName: string;
  requestedByUserId: string;
  requestedVia: string;
  filter: EdiscoveryFilter;
  manifest: EdiscoveryManifest | null;
  outcome: 'completed' | 'failed';
  error: string | null;
  startedAt: string;
  completedAt: string;
}

/**
 * Every field an opposing party would question is inside the digest, in a fixed
 * order, so editing any of them in place breaks the link to every later row.
 */
export function ediscoveryCustodyHash(previousHash: string, input: EdiscoveryCustodyInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        previousHash,
        input.organizationId,
        input.holdId,
        input.holdName,
        input.requestedByUserId,
        input.requestedVia,
        input.filter,
        input.manifest,
        input.outcome,
        input.error ?? '',
        input.startedAt,
        input.completedAt,
      ]),
    )
    .digest('hex');
}

export interface EdiscoveryCustodyRecord extends EdiscoveryCustodyInput {
  id: string;
  records: number;
  bytes: number;
  contentDigest: string;
  previousHash: string;
  entryHash: string;
}

/**
 * Writes the custody record for one export. Requires the privileged connection:
 * the table is append-only for every role and the application role holds SELECT
 * alone, because a custody log the exporting workspace can edit is not custody.
 */
export async function recordEdiscoveryExport(
  db: DatabaseAdapter,
  input: EdiscoveryCustodyInput,
): Promise<EdiscoveryCustodyRecord> {
  const [previous] = await db.query<{ entry_hash: string }>(
    `select entry_hash from public.ediscovery_exports
      where organization_id = $1
      order by completed_at desc, id desc
      limit 1`,
    [input.organizationId],
  );
  const previousHash = previous?.entry_hash ?? EDISCOVERY_GENESIS_HASH;
  const entryHash = ediscoveryCustodyHash(previousHash, input);

  const [row] = await db.query<{ id: string }>(
    `insert into public.ediscovery_exports
       (organization_id, hold_id, hold_name, requested_by_user_id, requested_via, filter,
        manifest, record_count, byte_count, content_digest, outcome, error, started_at,
        completed_at, previous_hash, entry_hash)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     returning id`,
    [
      input.organizationId,
      input.holdId,
      input.holdName,
      input.requestedByUserId,
      input.requestedVia,
      JSON.stringify(input.filter),
      JSON.stringify(input.manifest ?? {}),
      input.manifest?.records ?? 0,
      input.manifest?.bytes ?? 0,
      input.manifest?.sha256 ?? EDISCOVERY_GENESIS_HASH,
      input.outcome,
      input.error,
      input.startedAt,
      input.completedAt,
      previousHash,
      entryHash,
    ],
  );

  return {
    ...input,
    id: row?.id ?? '',
    records: input.manifest?.records ?? 0,
    bytes: input.manifest?.bytes ?? 0,
    contentDigest: input.manifest?.sha256 ?? EDISCOVERY_GENESIS_HASH,
    previousHash,
    entryHash,
  };
}

export async function readLegalHold(
  db: DatabaseAdapter,
  organizationId: string,
  holdId: string,
): Promise<LegalHold | null> {
  const [row] = await db.query<HoldRow>(
    `select ${HOLD_COLUMNS}
       from public.legal_holds h
      where h.organization_id = $1 and h.id = $2
      limit 1`,
    [organizationId, holdId],
  );
  return row ? formatHold(row) : null;
}
