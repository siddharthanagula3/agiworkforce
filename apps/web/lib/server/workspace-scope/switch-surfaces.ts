import 'server-only';

/**
 * What changes, and what deliberately does not, when the active workspace
 * changes. Each surface says where its state lives, so "switching hid my
 * skills" and "switching kept my skills" are both answerable from one place
 * instead of from whichever query a reader happens to run.
 */
export type WorkspaceSwitchEffect =
  /** the rows carry both columns, so the switch changes what is shown */
  | 'partitioned'
  /** the state belongs to the account; the switch shows the same thing */
  | 'account-wide'
  /** the state exists only inside an organization; Personal shows nothing */
  | 'organization-only';

export interface WorkspaceSwitchSurface {
  readonly surface: string;
  readonly effect: WorkspaceSwitchEffect;
  /** the tables this surface reads, in migration spelling */
  readonly tables: readonly string[];
  /** required unless partitioned: why a switch does not change what is shown */
  readonly why?: string;
  /** the item moves to the other workspace, leaving none behind */
  readonly transferable: boolean;
  /** the item is duplicated into the other workspace, the original left alone */
  readonly copyable: boolean;
  /** the item leaves the product in a reader's export */
  readonly exportable: boolean;
}

export const WORKSPACE_SWITCH_SURFACES: readonly WorkspaceSwitchSurface[] = [
  {
    surface: 'chat_history',
    effect: 'partitioned',
    tables: ['web_conversations'],
    transferable: false,
    copyable: false,
    exportable: true,
  },
  {
    surface: 'projects',
    effect: 'partitioned',
    tables: ['user_projects', 'organization_project_access'],
    transferable: false,
    copyable: false,
    exportable: true,
  },
  {
    surface: 'artifacts',
    effect: 'partitioned',
    tables: ['web_artifacts'],
    transferable: false,
    copyable: true,
    exportable: true,
  },
  {
    surface: 'memory',
    effect: 'partitioned',
    tables: ['user_memories'],
    transferable: false,
    copyable: false,
    exportable: true,
  },
  {
    surface: 'personalization',
    effect: 'account-wide',
    tables: ['user_settings'],
    why: 'tone, response style and display settings are how one reader wants to be answered, which does not change with the workspace they are reading in',
    transferable: false,
    copyable: false,
    exportable: true,
  },
  {
    surface: 'connectors',
    effect: 'partitioned',
    tables: ['user_connectors', 'user_custom_connectors', 'connector_call_events'],
    transferable: false,
    copyable: false,
    exportable: false,
  },
  {
    surface: 'connected_accounts',
    effect: 'account-wide',
    tables: ['connector_oauth_grants', 'connector_oauth_authorizations'],
    why: 'the grant is between one reader and the provider that issued it, so it cannot be split by workspace without asking the provider for a second one',
    transferable: false,
    copyable: false,
    exportable: false,
  },
  {
    surface: 'skills',
    effect: 'account-wide',
    tables: ['user_skills'],
    why: 'a skill is authored by a reader and carries no workspace column, so the switch does not take it away',
    transferable: false,
    copyable: true,
    exportable: true,
  },
  {
    surface: 'plugins',
    effect: 'account-wide',
    tables: ['plugin_installations', 'plugin_marketplace_installations'],
    why: 'an installation is the reader accepting that code, which is not a per-workspace decision; an organization restricts plugins through its policies instead',
    transferable: false,
    copyable: false,
    exportable: false,
  },
  {
    surface: 'models',
    effect: 'organization-only',
    tables: ['organization_model_policies', 'routing_decision_traces'],
    why: 'the catalogue itself is the same everywhere; only an organization narrows it, and Personal is narrowed by the plan instead',
    transferable: false,
    copyable: false,
    exportable: false,
  },
  {
    surface: 'entitlements',
    effect: 'account-wide',
    tables: ['subscriptions'],
    why: 'the plan is bought by the account, and an organization seat is resolved from membership rather than from a second subscription row',
    transferable: false,
    copyable: false,
    exportable: false,
  },
  {
    surface: 'usage',
    effect: 'partitioned',
    tables: [
      'usage_events',
      'organization_usage_ledger',
      'managed_usage_requests',
      'provider_cost_events',
    ],
    transferable: false,
    copyable: false,
    exportable: true,
  },
  {
    surface: 'billing',
    effect: 'account-wide',
    tables: ['credit_transactions', 'token_credits'],
    why: 'credits are bought by the account that pays, and an organization is billed through its own ledger rather than by moving a balance between workspaces',
    transferable: false,
    copyable: false,
    exportable: true,
  },
  {
    surface: 'policies',
    effect: 'organization-only',
    tables: [
      'organization_admin_policies',
      'organization_connector_policies',
      'organization_policy_overrides',
    ],
    why: 'a policy is something an organization sets for its members; Personal has nobody to set one for',
    transferable: false,
    copyable: false,
    exportable: false,
  },
  {
    surface: 'search_index',
    effect: 'partitioned',
    tables: ['retrieval_documents', 'retrieval_chunks'],
    transferable: false,
    copyable: false,
    exportable: false,
  },
  {
    surface: 'search_history',
    effect: 'partitioned',
    tables: ['search_history'],
    transferable: false,
    copyable: false,
    exportable: true,
  },
  {
    surface: 'library',
    effect: 'partitioned',
    tables: ['media_assets', 'file_lineage'],
    transferable: false,
    copyable: true,
    exportable: true,
  },
  {
    surface: 'notifications',
    effect: 'account-wide',
    tables: ['notifications'],
    why: 'a notification is addressed to a reader wherever they are looking, so hiding one behind a switch would lose it',
    transferable: false,
    copyable: false,
    exportable: true,
  },
  {
    surface: 'schedules',
    effect: 'partitioned',
    tables: ['scheduled_tasks', 'event_triggers', 'event_trigger_events'],
    transferable: false,
    copyable: true,
    exportable: true,
  },
  {
    surface: 'admin_capability',
    effect: 'organization-only',
    tables: ['organization_members', 'organization_member_roles', 'organization_group_managers'],
    why: 'administration is over an organization, so Personal offers none of it whoever is signed in',
    transferable: false,
    copyable: false,
    exportable: false,
  },
  {
    surface: 'agent_runs',
    effect: 'partitioned',
    tables: ['cloud_agent_runs', 'background_jobs', 'automation_audit_events'],
    transferable: false,
    copyable: false,
    exportable: true,
  },
  {
    surface: 'code_sessions',
    effect: 'partitioned',
    tables: [
      'cloud_code_sessions',
      'cloud_code_agent_turns',
      'cloud_code_terminal_entries',
      'notebook_runs',
    ],
    transferable: false,
    copyable: false,
    exportable: true,
  },
  {
    surface: 'media_generation',
    effect: 'partitioned',
    tables: ['image_generation_jobs', 'image_generation_job_assets', 'video_generation_jobs'],
    transferable: false,
    copyable: false,
    exportable: true,
  },
  {
    surface: 'voice',
    effect: 'partitioned',
    tables: ['voice_sessions'],
    transferable: false,
    copyable: false,
    exportable: true,
  },
  {
    surface: 'devices',
    effect: 'partitioned',
    tables: ['device_registrations', 'device_refresh_tokens'],
    transferable: false,
    copyable: false,
    exportable: false,
  },
  {
    surface: 'api_keys',
    effect: 'partitioned',
    tables: ['api_keys'],
    transferable: false,
    copyable: false,
    exportable: false,
  },
  {
    surface: 'context',
    effect: 'partitioned',
    tables: ['context_manifests'],
    transferable: false,
    copyable: false,
    exportable: false,
  },
  {
    surface: 'product_analytics',
    effect: 'partitioned',
    tables: ['product_analytics_events'],
    transferable: false,
    copyable: false,
    exportable: true,
  },
  {
    surface: 'release_flags',
    effect: 'partitioned',
    tables: ['feature_flags'],
    transferable: false,
    copyable: false,
    exportable: false,
  },
];

export function workspaceSwitchSurface(name: string): WorkspaceSwitchSurface | null {
  return WORKSPACE_SWITCH_SURFACES.find((entry) => entry.surface === name) ?? null;
}

/** The tables a surface claims, deduplicated, for callers that walk them all. */
export function workspaceSwitchTables(): readonly string[] {
  return [...new Set(WORKSPACE_SWITCH_SURFACES.flatMap((entry) => entry.tables))].sort();
}
