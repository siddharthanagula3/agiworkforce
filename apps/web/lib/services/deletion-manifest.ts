import 'server-only';

import {
  ANONYMIZED_USER_COLUMNS,
  EMAIL_SCOPED_USER_TABLES,
  UNDELETED_USER_TABLES,
  USER_SCOPED_TABLES,
  type AccountErasureReport,
} from '@/lib/server/account-erasure';
import {
  ORGANIZATION_ANONYMIZED_COLUMNS,
  ORGANIZATION_SCOPED_TABLES,
  ORGANIZATION_UNDELETED_TABLES,
} from '@/lib/server/organization-erasure';
import {
  FINANCIAL_RETENTION_RULES,
  FINANCIAL_TABLES_WITHOUT_MAXIMUM_AGE,
} from '@/lib/billing/financial-record-retention';
import {
  SECURITY_AUDIT_LOG_RETENTION_DAYS,
  SECURITY_LOG_RETENTION_CRON_PATH,
} from '@/lib/server/security-log-retention';

export type DataClass =
  'customer_content' | 'derived_content' | 'operational_record' | 'audit_trail' | 'telemetry';

export type StoreKind = 'table' | 'object_store' | 'cache';

const CUSTOMER_CONTENT = [
  'chat_folders',
  'chat_messages',
  'cloud_agent_approval_checkpoints',
  'cloud_agent_events',
  'cloud_agent_execution_operations',
  'cloud_agent_run_budgets',
  'cloud_agent_runs',
  'cloud_code_agent_turns',
  'cloud_code_sessions',
  'cloud_code_terminal_entries',
  'content_reports',
  'conversation_branches',
  'conversation_tags',
  'conversations',
  'feedback',
  'image_generation_job_assets',
  'image_generation_jobs',
  'mcp_app_payloads',
  'media_assets',
  'message_bookmarks',
  'message_reactions',
  'notebook_runs',
  'notifications',
  'organization_shared_artifacts',
  'organization_shared_projects',
  'organization_shared_sessions',
  'project_knowledge_files',
  'published_artifact_versions',
  'published_artifacts',
  'research_reports',
  'scheduled_tasks',
  'search_history',
  'shared_conversations',
  'shared_sessions',
  'support_action_proposals',
  'support_cases',
  'support_handoff_sessions',
  'support_ticket_replies',
  'support_tickets',
  'study_sessions',
  'sync_data',
  'user_memories',
  'user_projects',
  'user_shortcuts',
  'user_skills',
  'video_generation_jobs',
  'voice_sessions',
  'web_artifacts',
  'web_conversations',
  'web_messages',
  'work_plan_revisions',
  'work_plan_steps',
  'work_plans',
];

const DERIVED_CONTENT = [
  'context_manifests',
  'file_lineage',
  'retrieval_chunks',
  'retrieval_documents',
  'web_artifact_index',
];

const OPERATIONAL_RECORD = [
  'account_compromise_responses',
  'account_lockout_attempts',
  'account_security_settings',
  'account_sessions',
  'admin_request_idempotency',
  'agent_approval_requests',
  'agent_tools',
  'api_keys',
  'background_jobs',
  'beta_applications',
  'beta_invites',
  'beta_redemptions',
  'cloud_managed_waitlist',
  'cloud_waitlist',
  'cogs_adjustments',
  'connector_oauth_authorizations',
  'connector_oauth_grants',
  'connector_tool_permissions',
  'consent_records',
  'credit_idempotency_keys',
  'credit_settlement_jobs',
  'credit_transactions',
  'data_rights_requests',
  'desktop_devices',
  'device_authorization_codes',
  'device_installations',
  'device_pairings',
  'device_refresh_tokens',
  'device_registrations',
  'directory_sync_connections',
  'email_preferences',
  'enterprise_offline_payment_records',
  'erasure_tombstones',
  'event_triggers',
  'feature_flags',
  'free_daily_usage_reservations',
  'github_installations',
  'identities',
  'legal_holds',
  'legal_hold_custodians',
  'managed_usage_request_extensions',
  'managed_usage_requests',
  'mcp_task_bindings',
  'messaging_connections',
  'mobile_devices',
  'mobile_iap_accounts',
  'mobile_iap_transactions',
  'organization_admin_api_keys',
  'organization_admin_delegations',
  'organization_admin_policies',
  'organization_audit_destinations',
  'organization_billing_contracts',
  'organization_billing_invoices',
  'organization_commercial_agreements',
  'organization_connector_policies',
  'organization_domain_retention_policies',
  'organization_encryption_keys',
  'organization_group_managers',
  'organization_group_roles',
  'organization_invitations',
  'organization_key_rewrap_runs',
  'organization_mcp_servers',
  'organization_member_roles',
  'organization_members',
  'organization_model_policies',
  'organization_policy_overrides',
  'organization_policy_revisions',
  'organization_project_access',
  'organization_roles',
  'organization_service_principals',
  'organization_shared_connectors',
  'organization_spend_alerts',
  'organization_spend_limits',
  'organization_subscription_state_transitions',
  'organization_usage_ledger',
  'organizations',
  'plugin_installations',
  'plugin_marketplace_installations',
  'plugin_marketplace_sources',
  'profiles',
  'provider_cost_events',
  'referrals',
  'revoked_jwts',
  'scim_group_members',
  'scim_groups',
  'scim_provisioned_users',
  'scim_tokens',
  'sso_connections',
  'subscriptions',
  'support_access_grants',
  'support_agent_presence',
  'support_ticket_escalations',
  'token_credits',
  'user_connectors',
  'user_custom_connectors',
  'user_settings',
  'user_two_factor',
  'waitlist',
  'web_push_subscriptions',
  'website_auto_economy_trial_usage',
  'workspaces',
];

const AUDIT_TRAIL = [
  'automation_audit_events',
  'copyright_notices',
  'directory_sync_events',
  'ediscovery_exports',
  'enterprise_audit_events',
  'organization_domain_retention_sweeps',
  'organization_retention_sweeps',
  'security_audit_logs',
  'plugin_registry_lifecycle_events',
  'release_events',
  'support_access_events',
];

const TELEMETRY = [
  'agent_tool_executions',
  'authentication_attempts',
  'connector_call_events',
  'event_trigger_events',
  'identity_risk_observations',
  'product_analytics_events',
  'routing_decision_traces',
  'usage_events',
];

const DATA_CLASS_BY_STORE: ReadonlyMap<string, DataClass> = new Map([
  ...CUSTOMER_CONTENT.map((store) => [store, 'customer_content'] as const),
  ...DERIVED_CONTENT.map((store) => [store, 'derived_content'] as const),
  ...OPERATIONAL_RECORD.map((store) => [store, 'operational_record'] as const),
  ...AUDIT_TRAIL.map((store) => [store, 'audit_trail'] as const),
  ...TELEMETRY.map((store) => [store, 'telemetry'] as const),
]);

export interface RetentionEntry {
  store: string;
  kind: StoreKind;
  dataClass: DataClass;
  erasedWithSubject: boolean;
  erasedWithTenant: boolean;
  cascadesFrom: string | null;
  maximumAgeDays: number | null;
  deletionPath: string | null;
  retainedReason: string | null;
}

/**
 * Stores that hold user data outside Postgres. No module enumerates them, so
 * unlike the table rows below they are stated here rather than derived.
 */
const NON_TABLE_STORES: readonly RetentionEntry[] = [
  {
    store: 'media object storage',
    kind: 'object_store',
    dataClass: 'customer_content',
    erasedWithSubject: true,
    erasedWithTenant: true,
    cascadesFrom: null,
    maximumAgeDays: null,
    deletionPath: 'lib/server/account-erasure.ts eraseUserMedia, bytes before rows',
    retainedReason: null,
  },
  {
    store: 'conversation backup objects',
    kind: 'object_store',
    dataClass: 'customer_content',
    erasedWithSubject: true,
    erasedWithTenant: false,
    cascadesFrom: null,
    maximumAgeDays: null,
    deletionPath: 'lib/server/account-erasure.ts eraseUserAccountData backup sweep',
    retainedReason: null,
  },
  {
    store: 'project knowledge objects',
    kind: 'object_store',
    dataClass: 'customer_content',
    erasedWithSubject: true,
    erasedWithTenant: false,
    cascadesFrom: null,
    maximumAgeDays: null,
    deletionPath: 'lib/server/account-erasure.ts eraseUserAccountData knowledge sweep',
    retainedReason: null,
  },
  {
    store: 'avatar objects',
    kind: 'object_store',
    dataClass: 'customer_content',
    erasedWithSubject: true,
    erasedWithTenant: false,
    cascadesFrom: null,
    maximumAgeDays: null,
    deletionPath: 'lib/server/account-erasure.ts eraseUserAccountData avatar sweep',
    retainedReason: null,
  },
  {
    store: 'response cache keys',
    kind: 'cache',
    dataClass: 'derived_content',
    erasedWithSubject: true,
    erasedWithTenant: false,
    cascadesFrom: null,
    maximumAgeDays: null,
    deletionPath: 'lib/server/account-erasure.ts eraseUserAccountData cache sweep',
    retainedReason: null,
  },
  {
    store: 'mcp_response_cache',
    kind: 'cache',
    dataClass: 'derived_content',
    erasedWithSubject: true,
    erasedWithTenant: false,
    cascadesFrom: null,
    maximumAgeDays: null,
    deletionPath:
      'lib/server/account-erasure.ts eraseConnectorResponseCache, and the expiry sweep in ' +
      'api/cron/purge-deleted-accounts',
    retainedReason: null,
  },
  {
    store: 'mcp_discovery_cache',
    kind: 'cache',
    dataClass: 'operational_record',
    erasedWithSubject: false,
    erasedWithTenant: false,
    cascadesFrom: null,
    maximumAgeDays: null,
    deletionPath: 'api/cron/purge-deleted-accounts expiry sweep',
    retainedReason: null,
  },
];

function maximumAgeDays(store: string): number | null {
  if (store === 'security_audit_logs') return SECURITY_AUDIT_LOG_RETENTION_DAYS;
  const purges = FINANCIAL_RETENTION_RULES.filter(
    (rule) => rule.action === 'purge' && rule.table === store,
  );
  if (purges.length === 0) return null;
  return Math.max(...purges.map((rule) => rule.afterDays));
}

/** A retained table whose reason is a cascade is not retained; its parent takes it. */
function cascadeParent(reason: string | undefined): string | null {
  return /^cascades from ([a-z_]+)/i.exec(reason ?? '')?.[1] ?? null;
}

function deletionPath(entry: {
  store: string;
  erasedWithSubject: boolean;
  erasedWithTenant: boolean;
  anonymised: boolean;
  cascadesFrom: string | null;
  maximumAgeDays: number | null;
}): string | null {
  const paths: string[] = [];
  if (entry.erasedWithSubject) paths.push('lib/server/account-erasure.ts');
  if (entry.erasedWithTenant) paths.push('lib/server/organization-erasure.ts');
  if (entry.cascadesFrom) paths.push(`cascade from ${entry.cascadesFrom}`);
  if (entry.anonymised) paths.push('subject detached at erasure');
  if (entry.store === 'security_audit_logs') paths.push(SECURITY_LOG_RETENTION_CRON_PATH);
  else if (entry.maximumAgeDays !== null) paths.push('lib/billing/financial-record-retention.ts');
  return paths.length > 0 ? paths.join('; ') : null;
}

function buildRetentionMatrix(): RetentionEntry[] {
  const erasedWithSubject = new Set(
    [...USER_SCOPED_TABLES, ...EMAIL_SCOPED_USER_TABLES].map((entry) => entry.table),
  );
  const erasedWithTenant = new Set(ORGANIZATION_SCOPED_TABLES.map((entry) => entry.table));
  const anonymised = new Set([
    ...ANONYMIZED_USER_COLUMNS.map((entry) => entry.table),
    ...ORGANIZATION_ANONYMIZED_COLUMNS.map((entry) => entry.table),
  ]);
  const retainedBySubject = new Map(Object.entries(UNDELETED_USER_TABLES));
  const retainedByTenant = new Map(Object.entries(ORGANIZATION_UNDELETED_TABLES));
  const retained = new Map<string, string>([...retainedByTenant, ...retainedBySubject]);
  const withoutMaximumAge = new Map(
    FINANCIAL_TABLES_WITHOUT_MAXIMUM_AGE.map((entry) => [entry.table, entry.reason]),
  );

  const stores = [
    ...new Set([...erasedWithSubject, ...erasedWithTenant, ...anonymised, ...retained.keys()]),
  ].sort();

  const tables = stores.map((store) => {
    const age = maximumAgeDays(store);
    const subject = erasedWithSubject.has(store);
    const tenant = erasedWithTenant.has(store);
    const cascadesFrom =
      cascadeParent(retainedBySubject.get(store)) ?? cascadeParent(retainedByTenant.get(store));
    const path = deletionPath({
      store,
      erasedWithSubject: subject,
      erasedWithTenant: tenant,
      anonymised: anonymised.has(store),
      cascadesFrom,
      maximumAgeDays: age,
    });
    return {
      store,
      kind: 'table' as const,
      dataClass: DATA_CLASS_BY_STORE.get(store) ?? ('operational_record' as DataClass),
      erasedWithSubject: subject,
      erasedWithTenant: tenant,
      cascadesFrom,
      maximumAgeDays: age,
      deletionPath: path,
      retainedReason:
        path === null ? (retained.get(store) ?? withoutMaximumAge.get(store) ?? null) : null,
    };
  });

  return [...tables, ...NON_TABLE_STORES].sort((a, b) => a.store.localeCompare(b.store));
}

export const RETENTION_MATRIX: readonly RetentionEntry[] = buildRetentionMatrix();

function retentionRow(entry: RetentionEntry): string {
  const reach = [
    entry.erasedWithSubject ? 'account' : null,
    entry.erasedWithTenant ? 'workspace' : null,
    entry.cascadesFrom ? `cascade from ${entry.cascadesFrom}` : null,
  ].filter((value): value is string => value !== null);
  const age = entry.maximumAgeDays === null ? 'no maximum' : `${entry.maximumAgeDays} days`;
  const path = entry.deletionPath ?? entry.retainedReason ?? 'none';
  return `| \`${entry.store}\` | ${entry.kind} | ${entry.dataClass} | ${reach.join(', ') || 'none'} | ${age} | ${path.replace(/\|/g, '/')} |`;
}

/**
 * The matrix as a document. It is rendered rather than written so the table
 * cannot describe a store list the code no longer has.
 */
export function renderRetentionMatrixMarkdown(): string {
  const header = [
    '| store | kind | data class | erased with | maximum age | deletion path or reason |',
    '| ----- | ---- | ---------- | ----------- | ----------- | ----------------------- |',
  ];
  return [...header, ...RETENTION_MATRIX.map(retentionRow)].join('\n');
}

/** A store the erasure inventories name but the matrix cannot classify. */
export function unclassifiedStores(): string[] {
  return RETENTION_MATRIX.filter(
    (entry) => entry.kind === 'table' && !DATA_CLASS_BY_STORE.has(entry.store),
  ).map((entry) => entry.store);
}

/**
 * A store holding what a user wrote, or what was derived from it, that no
 * erasure path and no maximum age reaches. Each one outlives the account.
 */
export function storesOutlivingTheirSubject(): RetentionEntry[] {
  return RETENTION_MATRIX.filter(
    (entry) =>
      (entry.dataClass === 'customer_content' || entry.dataClass === 'derived_content') &&
      entry.deletionPath === null &&
      entry.maximumAgeDays === null,
  );
}

export type DeletionStatus = 'pending' | 'blocked' | 'partial' | 'complete';

export interface DeletionProgress {
  scheduledFor: string | null;
  activeLegalHolds: number;
  storesAttempted: number;
  storesCleared: number;
  storesFailed: number;
  objectsFailed: number;
}

export interface DeletionOutcome {
  status: DeletionStatus;
  reason: string;
}

/**
 * The four states a deletion can be in. `complete` is the only one that says
 * nothing of the subject is left, so a failed store or an unfreed object keeps
 * the answer at `partial` however many rows went.
 */
export function resolveDeletionStatus(progress: DeletionProgress): DeletionOutcome {
  if (progress.activeLegalHolds > 0) {
    return {
      status: 'blocked',
      reason: `${progress.activeLegalHolds} active legal hold(s) preserve this subject's data; nothing was deleted.`,
    };
  }
  if (progress.storesAttempted === 0) {
    return progress.scheduledFor === null
      ? { status: 'pending', reason: 'Deletion has been requested and has not started.' }
      : {
          status: 'pending',
          reason: `Deletion is scheduled for ${progress.scheduledFor} and has not started.`,
        };
  }
  if (progress.storesFailed > 0 || progress.objectsFailed > 0) {
    return {
      status: 'partial',
      reason: `${progress.storesCleared} of ${progress.storesAttempted} stores cleared; ${progress.storesFailed} store(s) and ${progress.objectsFailed} stored object(s) remain and will be retried.`,
    };
  }
  if (progress.storesCleared < progress.storesAttempted) {
    return {
      status: 'partial',
      reason: `${progress.storesCleared} of ${progress.storesAttempted} stores cleared.`,
    };
  }
  return {
    status: 'complete',
    reason: `All ${progress.storesAttempted} stores cleared and every stored object freed.`,
  };
}

const LEGAL_HOLD_STORE = 'legal_holds';

/**
 * An erasure report read against the manifest. A store counts as attempted only
 * when the matrix gives it a deletion path and the report names it, so a store
 * added to the schema and never erased lowers the count rather than passing.
 */
export function accountErasureProgress(
  report: AccountErasureReport,
  scheduledFor: string | null = null,
): DeletionProgress {
  const hold = report.tables[LEGAL_HOLD_STORE];
  const activeLegalHolds = hold && !hold.deleted && hold.retainedForRetry === true ? 1 : 0;

  let storesAttempted = 0;
  let storesCleared = 0;
  let storesFailed = 0;
  for (const entry of RETENTION_MATRIX) {
    if (entry.deletionPath === null) continue;
    const table = report.tables[entry.store];
    const anonymized = report.anonymized[entry.store];
    if (!table && !anonymized) continue;
    if (table?.skipped === true || anonymized?.skipped === true) continue;
    storesAttempted += 1;
    if (table?.error !== undefined || anonymized?.error !== undefined) storesFailed += 1;
    else if (table?.deleted === true || anonymized?.updated === true) storesCleared += 1;
  }

  return {
    scheduledFor,
    activeLegalHolds,
    storesAttempted,
    storesCleared,
    storesFailed,
    objectsFailed:
      report.mediaObjectsFailed +
      report.backupObjectsFailed +
      report.knowledgeObjectsFailed +
      report.avatarObjectsFailed +
      report.cacheKeysFailed,
  };
}

/**
 * A deletion that has been accepted and not started. Legal holds are evaluated
 * by the purge, not by the request, so none are claimed here.
 */
export function scheduledDeletionProgress(scheduledFor: string | null): DeletionProgress {
  return {
    scheduledFor,
    activeLegalHolds: 0,
    storesAttempted: 0,
    storesCleared: 0,
    storesFailed: 0,
    objectsFailed: 0,
  };
}
