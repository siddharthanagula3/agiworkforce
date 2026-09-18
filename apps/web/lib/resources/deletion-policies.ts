import type { ResourceChildDisposition } from '@agiworkforce/types';

/**
 * The recoverable-until-purge window. Thirty days is what the library already
 * enforces for deleted media; every other soft-deletable resource had no purge
 * at all, so its tombstone lived forever.
 */
export const RESOURCE_RECOVERY_WINDOW_DAYS = 30;

export const MAX_PURGE_ROWS_PER_TABLE_PER_RUN = 2000;

export interface ResourceChildRelation {
  readonly table: string;
  readonly column: string;
  readonly disposition: ResourceChildDisposition;
  readonly basis: string;
}

/**
 * Bytes this resource holds outside Postgres. A row that addresses object
 * storage cannot be hard-deleted by a generic sweep: deleting the row loses
 * the only address of the object, so the bytes outlive the account that owns
 * them. `sweep` names the job that deletes the object first, or null when
 * nothing does yet.
 */
export interface ExternalObjectReference {
  readonly column: string;
  readonly sweep: string | null;
}

export interface DerivedIndexRelation {
  /** The table holding the derived copy, e.g. retrieval_documents. */
  readonly table: string;
  /** The column that points back at the source row. */
  readonly column: string;
}

export interface ResourceDeletionPolicy {
  /** Canonical resource name, the same word every surface uses. */
  readonly resource: string;
  readonly table: string;
  readonly keyColumn: string;
  /** The column naming the owning account, or null when it is owned via a parent. */
  readonly ownerColumn: string | null;
  /** How the owner is reached when `ownerColumn` is null. */
  readonly ownedVia: { readonly table: string; readonly column: string } | null;
  readonly softDeleteColumn: string;
  readonly archiveColumn: string | null;
  readonly recoveryWindowDays: number;
  readonly children: readonly ResourceChildRelation[];
  /**
   * Derived copies a hard delete must also remove. Each is enforced by a
   * foreign key with `on delete cascade`, which the deletion-semantics guard
   * asserts against the migration rather than trusting this list.
   */
  readonly derivedIndexes: readonly DerivedIndexRelation[];
  readonly externalObjects: ExternalObjectReference | null;
  /** Records deliberately kept after the resource is purged. */
  readonly retainedAfterPurge: readonly string[];
  readonly basis: string;
}

const RETRIEVAL_DOCUMENTS = 'retrieval_documents';

export const RESOURCE_DELETION_POLICIES: readonly ResourceDeletionPolicy[] = [
  {
    resource: 'conversation',
    table: 'web_conversations',
    keyColumn: 'id',
    ownerColumn: 'user_id',
    ownedVia: null,
    softDeleteColumn: 'deleted_at',
    archiveColumn: 'archived',
    recoveryWindowDays: RESOURCE_RECOVERY_WINDOW_DAYS,
    children: [
      {
        table: 'web_messages',
        column: 'conversation_id',
        disposition: 'cascade_delete',
        basis: 'A message has no meaning outside the conversation that holds it.',
      },
      {
        table: 'web_artifacts',
        column: 'conversation_id',
        disposition: 'cascade_delete',
        basis: 'An artifact is derived from the turn that produced it.',
      },
      {
        table: 'video_generation_jobs',
        column: 'conversation_id',
        disposition: 'detach',
        basis:
          'A running job outlives the chat it was started from; the link is cleared so the job can still settle and be billed.',
      },
      {
        table: 'image_generation_jobs',
        column: 'conversation_id',
        disposition: 'detach',
        basis: 'Same as video: the job settles on its own and keeps its cost row.',
      },
    ],
    derivedIndexes: [{ table: RETRIEVAL_DOCUMENTS, column: 'conversation_id' }],
    externalObjects: null,
    retainedAfterPurge: ['security_audit_logs', 'provider_cost_events'],
    basis:
      'Deleting a chat is the most common undo in the product, so the tombstone stays restorable for the whole window before the bytes go.',
  },
  {
    resource: 'message',
    table: 'web_messages',
    keyColumn: 'id',
    ownerColumn: null,
    ownedVia: { table: 'web_conversations', column: 'conversation_id' },
    softDeleteColumn: 'deleted_at',
    archiveColumn: null,
    recoveryWindowDays: RESOURCE_RECOVERY_WINDOW_DAYS,
    children: [
      {
        table: 'web_artifacts',
        column: 'message_id',
        disposition: 'detach',
        basis:
          'The artifact keeps its own content and its conversation; only the display backref to the turn is cleared.',
      },
    ],
    derivedIndexes: [],
    externalObjects: null,
    retainedAfterPurge: ['provider_cost_events'],
    basis:
      'A deleted message leaves the conversation index stale rather than deleted, because the conversation document is the indexed unit.',
  },
  {
    resource: 'artifact',
    table: 'web_artifacts',
    keyColumn: 'id',
    ownerColumn: 'user_id',
    ownedVia: null,
    softDeleteColumn: 'deleted_at',
    archiveColumn: null,
    recoveryWindowDays: RESOURCE_RECOVERY_WINDOW_DAYS,
    children: [
      {
        table: 'web_artifact_versions',
        column: 'artifact_id',
        disposition: 'cascade_delete',
        basis: 'The version history is the artifact; keeping it would keep the content.',
      },
    ],
    derivedIndexes: [{ table: RETRIEVAL_DOCUMENTS, column: 'artifact_id' }],
    externalObjects: null,
    retainedAfterPurge: [],
    basis:
      'An artifact can be published, so the purge is what actually withdraws the shared copy rather than only hiding it.',
  },
  {
    resource: 'project',
    table: 'user_projects',
    keyColumn: 'id',
    ownerColumn: 'user_id',
    ownedVia: null,
    softDeleteColumn: 'deleted_at',
    archiveColumn: 'is_archived',
    recoveryWindowDays: RESOURCE_RECOVERY_WINDOW_DAYS,
    children: [
      {
        table: 'project_knowledge_files',
        column: 'project_id',
        disposition: 'cascade_delete',
        basis: 'Knowledge files exist only to give one project its context.',
      },
      {
        table: 'scheduled_tasks',
        column: 'project_id',
        disposition: 'detach',
        basis: 'A schedule keeps running against the account once its project scope is gone.',
      },
    ],
    derivedIndexes: [],
    externalObjects: null,
    retainedAfterPurge: ['security_audit_logs'],
    basis:
      'Deleting a project deletes its knowledge, which is the one cascade a user is most likely not to expect, so the confirm names it.',
  },
  {
    resource: 'project_knowledge_file',
    table: 'project_knowledge_files',
    keyColumn: 'id',
    ownerColumn: null,
    ownedVia: { table: 'user_projects', column: 'project_id' },
    softDeleteColumn: 'deleted_at',
    archiveColumn: null,
    recoveryWindowDays: RESOURCE_RECOVERY_WINDOW_DAYS,
    children: [
      {
        table: 'project_knowledge_files',
        column: 'supersedes_id',
        disposition: 'detach',
        basis:
          'A newer version points back at the row it replaced. Purging the old version must not take the current one with it.',
      },
    ],
    derivedIndexes: [{ table: RETRIEVAL_DOCUMENTS, column: 'project_knowledge_file_id' }],
    externalObjects: { column: 'storage_uri', sweep: null },
    retainedAfterPurge: [],
    basis:
      'Superseded is not deleted: only deleted_at starts the window, so a version history survives its own replacements.',
  },
  {
    resource: 'media_asset',
    table: 'media_assets',
    keyColumn: 'id',
    ownerColumn: 'user_id',
    ownedVia: null,
    softDeleteColumn: 'deleted_at',
    archiveColumn: null,
    recoveryWindowDays: RESOURCE_RECOVERY_WINDOW_DAYS,
    children: [
      {
        table: 'video_generation_jobs',
        column: 'asset_id',
        disposition: 'cascade_delete',
        basis: 'The job row addresses bytes that no longer exist.',
      },
      {
        table: 'image_generation_job_assets',
        column: 'asset_id',
        disposition: 'cascade_delete',
        basis: 'The join row addresses bytes that no longer exist.',
      },
    ],
    derivedIndexes: [{ table: RETRIEVAL_DOCUMENTS, column: 'media_asset_id' }],
    externalObjects: { column: 'storage_pathname', sweep: 'cron/purge-deleted-media' },
    retainedAfterPurge: ['provider_cost_events'],
    basis:
      'The library already enforced this window through its own purge cron; the policy states it once so every caller reads the same number.',
  },
];

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(value: string, label: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Unsafe ${label} in resource deletion policy: ${value}`);
  }
  return value;
}

export function resourceDeletionPolicy(table: string): ResourceDeletionPolicy | null {
  return RESOURCE_DELETION_POLICIES.find((policy) => policy.table === table) ?? null;
}

export function softDeletableTables(): readonly string[] {
  return RESOURCE_DELETION_POLICIES.map((policy) => policy.table);
}

export interface ResourcePurgeStatement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * The hard delete that ends the recovery window. Bounded per run so one sweep
 * cannot hold a lock over the whole table, and ordered oldest-first so a
 * bounded run always makes progress.
 */
export function resourcePurgeStatement(policy: ResourceDeletionPolicy): ResourcePurgeStatement {
  const table = assertIdentifier(policy.table, 'table');
  const key = assertIdentifier(policy.keyColumn, 'key column');
  const deletedAt = assertIdentifier(policy.softDeleteColumn, 'soft-delete column');

  return {
    sql: `with due as (
     select ${key} as purge_key
       from public.${table}
      where ${deletedAt} is not null
        and ${deletedAt} < now() - $1::interval
      order by ${deletedAt} asc
      limit $2
   )
   delete from public.${table} as target
    using due
    where target.${key} = due.purge_key
   returning target.${key} as purge_key`,
    params: [`${policy.recoveryWindowDays} days`, MAX_PURGE_ROWS_PER_TABLE_PER_RUN],
  };
}

/**
 * The sentence a confirm dialog shows before a delete that takes children with
 * it. `useConfirmAction` needs the consequence named, and the cascade is the
 * consequence a user cannot see from the row they are deleting.
 */
export function cascadeConsequence(policy: ResourceDeletionPolicy): string | null {
  const cascaded = policy.children.filter((child) => child.disposition === 'cascade_delete');
  if (cascaded.length === 0) return null;
  const names = cascaded.map((child) => child.table.replace(/_/g, ' ')).join(', ');
  return `Deleting this ${policy.resource.replace(/_/g, ' ')} also deletes its ${names}. It stays recoverable for ${policy.recoveryWindowDays} days, then it is purged.`;
}
