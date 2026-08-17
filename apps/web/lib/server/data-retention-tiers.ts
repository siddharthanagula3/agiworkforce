export type DataClass =
  | 'account_identity'
  | 'user_content'
  | 'derived_index'
  | 'operational_cache'
  | 'billing_record'
  | 'compliance_record'
  | 'telemetry'
  | 'backup';

export type RetentionTier =
  | 'until_erasure'
  | 'session_bounded'
  | 'statutory_retention'
  | 'fixed_window';

export type ErasureMechanism =
  | 'erasure_fan_out'
  | 'cascade'
  | 'ttl_expiry'
  | 'retained_by_obligation'
  | 'vendor_deletion_request';

export interface DataStoreRetention {
  store: string;
  dataClass: DataClass;
  tier: RetentionTier;
  maxRetention: string;
  erasure: ErasureMechanism;
  covers: string;
}

export const DATA_STORE_RETENTION: readonly DataStoreRetention[] = [
  {
    store: 'neon_postgres_user_tables',
    dataClass: 'user_content',
    tier: 'until_erasure',
    maxRetention: 'life of the account',
    erasure: 'erasure_fan_out',
    covers: 'Every table in USER_SCOPED_TABLES, deleted row by row by eraseUserAccountData.',
  },
  {
    store: 'neon_postgres_shared_rows',
    dataClass: 'compliance_record',
    tier: 'statutory_retention',
    maxRetention: 'life of the surviving record',
    erasure: 'erasure_fan_out',
    covers:
      'ANONYMIZED_USER_COLUMNS: rows that belong to another subject keep the row and lose the subject.',
  },
  {
    store: 'neon_postgres_cascaded_rows',
    dataClass: 'user_content',
    tier: 'until_erasure',
    maxRetention: 'life of the parent row',
    erasure: 'cascade',
    covers: 'UNDELETED_USER_TABLES entries whose reason is a foreign-key cascade.',
  },
  {
    store: 'neon_postgres_search_indexes',
    dataClass: 'derived_index',
    tier: 'until_erasure',
    maxRetention: 'life of the indexed row',
    erasure: 'cascade',
    covers:
      'Full-text and trigram indexes from 0101 are Postgres indexes on the same rows, so deleting the row deletes the index entry in the same transaction. There is no external search cluster and no external vector index.',
  },
  {
    store: 'object_storage_media',
    dataClass: 'user_content',
    tier: 'until_erasure',
    maxRetention: 'life of the account',
    erasure: 'erasure_fan_out',
    covers: 'Generated and uploaded media bytes, deleted before their rows by eraseUserMedia.',
  },
  {
    store: 'object_storage_project_knowledge',
    dataClass: 'user_content',
    tier: 'until_erasure',
    maxRetention: 'life of the account',
    erasure: 'erasure_fan_out',
    covers:
      'Project knowledge files; the owning project row is retained for retry if bytes survive.',
  },
  {
    store: 'object_storage_avatars',
    dataClass: 'account_identity',
    tier: 'until_erasure',
    maxRetention: 'life of the account',
    erasure: 'erasure_fan_out',
    covers: 'The avatar object referenced by profiles.avatar_url.',
  },
  {
    store: 'redis_sandbox_sessions',
    dataClass: 'operational_cache',
    tier: 'session_bounded',
    maxRetention: '24 hours',
    erasure: 'erasure_fan_out',
    covers:
      'e2b:session:v2/v3 and e2b:create-lock:v1 keys carry the user id and a live sandbox id; deleteE2BSessionsForUser purges them ahead of the TTL.',
  },
  {
    store: 'redis_rate_limit_counters',
    dataClass: 'operational_cache',
    tier: 'fixed_window',
    maxRetention: 'the rate-limit window, at most 24 hours',
    erasure: 'ttl_expiry',
    covers:
      'Upstash Ratelimit counters keyed by user id. They hold a count and a window, no content, and every key carries the window as its TTL.',
  },
  {
    store: 'neon_backups',
    dataClass: 'backup',
    tier: 'fixed_window',
    maxRetention: 'the configured Neon point-in-time-recovery window',
    erasure: 'ttl_expiry',
    covers:
      'Erasure cannot rewrite history inside a PITR window. The erasure_tombstones suppression list (0103) keeps an erased subject erased if a restore reintroduces the row.',
  },
  {
    store: 'sentry_error_events',
    dataClass: 'telemetry',
    tier: 'fixed_window',
    maxRetention: 'the Sentry project retention setting',
    erasure: 'vendor_deletion_request',
    covers:
      'Error events can carry a user id. Sentry retention and per-subject deletion are dashboard/API actions outside this repository.',
  },
  {
    store: 'stripe_billing_records',
    dataClass: 'billing_record',
    tier: 'statutory_retention',
    maxRetention: 'the statutory tax and accounting period',
    erasure: 'retained_by_obligation',
    covers:
      'Invoices, charges and disputes stay with the processor; they are financial records, not erasable user content.',
  },
];

export const ERASURE_FAN_OUT_STORES: readonly string[] = DATA_STORE_RETENTION.filter(
  (entry) => entry.erasure === 'erasure_fan_out',
).map((entry) => entry.store);
