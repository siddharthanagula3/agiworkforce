import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEFAULT_ENTERPRISE_ADMIN_POLICY,
  SECRET_HANDLING_MODE_DEFAULT,
  type AdminPolicy,
  type PrivacyMode,
  type SecretHandlingMode,
  type SyncedAppSurface,
} from '@agiworkforce/types';

export type AdminPolicyInput = Omit<AdminPolicy, 'organizationId' | 'updatedAt'>;

/**
 * `configured: false` means the organization has no policy row. It is NOT the
 * same as "the defaults are in force": an unconfigured organization is not
 * governed at all, and the gate answers `unscoped` rather than evaluating
 * `policy` below. The defaults are returned only so an admin can see what a
 * first save would write, which is why the admin UI must render this
 * distinction instead of presenting the defaults as settings.
 */
export interface EffectiveOrganizationPolicy {
  organizationId: string;
  configured: boolean;
  policy: AdminPolicy;
}

interface AdminPolicyRow {
  organization_id: string;
  default_privacy_mode: PrivacyMode;
  allowed_privacy_modes: PrivacyMode[];
  allow_managed_compute: boolean;
  require_local_to_byok_preview: boolean;
  chat_sync_surfaces: SyncedAppSurface[];
  allow_cli_cloud_sync: boolean;
  allow_vscode_cloud_sync: boolean;
  allow_chrome_cloud_sync: boolean;
  audit_export_enabled: boolean;
  retention_days: number;
  retention_enforced: boolean;
  external_sharing_enabled: boolean;
  metadata: Record<string, unknown> | null;
  updated_at: string;
}

const POLICY_COLUMNS = `organization_id, default_privacy_mode, allowed_privacy_modes,
  allow_managed_compute, require_local_to_byok_preview, chat_sync_surfaces,
  allow_cli_cloud_sync, allow_vscode_cloud_sync, allow_chrome_cloud_sync,
  audit_export_enabled, retention_days, retention_enforced,
  external_sharing_enabled, metadata, updated_at`;

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date(0).toISOString();
}

function readSecretHandling(metadata: Record<string, unknown> | null): SecretHandlingMode {
  const value = metadata?.['secretHandling'];
  return value === 'warn' || value === 'redact' || value === 'block'
    ? value
    : SECRET_HANDLING_MODE_DEFAULT.organization;
}

export function formatAdminPolicy(row: AdminPolicyRow): AdminPolicy {
  return {
    organizationId: row.organization_id,
    defaultPrivacyMode: row.default_privacy_mode,
    allowedPrivacyModes: [...row.allowed_privacy_modes],
    allowManagedCompute: row.allow_managed_compute,
    requireLocalToByokPreview: row.require_local_to_byok_preview,
    chatSyncSurfaces: [...row.chat_sync_surfaces],
    allowCliCloudSync: row.allow_cli_cloud_sync,
    allowVsCodeCloudSync: row.allow_vscode_cloud_sync,
    allowChromeCloudSync: row.allow_chrome_cloud_sync,
    auditExportEnabled: row.audit_export_enabled,
    retentionDays: row.retention_days,
    retentionEnforced: row.retention_enforced,
    externalSharingEnabled: row.external_sharing_enabled,
    secretHandling: readSecretHandling(row.metadata),
    metadata: row.metadata ?? {},
    updatedAt: toIso(row.updated_at),
  };
}

export function defaultAdminPolicyFor(organizationId: string): AdminPolicy {
  return {
    ...DEFAULT_ENTERPRISE_ADMIN_POLICY,
    allowedPrivacyModes: [...DEFAULT_ENTERPRISE_ADMIN_POLICY.allowedPrivacyModes],
    chatSyncSurfaces: [...DEFAULT_ENTERPRISE_ADMIN_POLICY.chatSyncSurfaces],
    organizationId,
    metadata: {},
    updatedAt: new Date(0).toISOString(),
  };
}

export async function readOrganizationPolicy(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<AdminPolicy | null> {
  const [row] = await db.query<AdminPolicyRow>(
    `select ${POLICY_COLUMNS}
       from public.organization_admin_policies
      where organization_id = $1
      limit 1`,
    [organizationId],
  );
  return row ? formatAdminPolicy(row) : null;
}

export async function getEffectiveOrganizationPolicy(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<EffectiveOrganizationPolicy> {
  const policy = await readOrganizationPolicy(db, organizationId);
  return policy
    ? { organizationId, configured: true, policy }
    : { organizationId, configured: false, policy: defaultAdminPolicyFor(organizationId) };
}

/**
 * Writes the whole policy, never a partial patch.
 *
 * The table's column defaults (`allow_managed_compute false`, `allowed_privacy_modes
 * {local,byok}`) exist to describe the shape of a restrictive workspace, not to
 * be inherited silently. A partial upsert would let an admin who changed one
 * unrelated field materialize a row that also switches off managed compute for
 * everyone. The route therefore merges onto the current effective policy and
 * hands a complete object here.
 */
export async function upsertOrganizationPolicy(
  db: DatabaseAdapter,
  organizationId: string,
  input: AdminPolicyInput,
): Promise<AdminPolicy> {
  const [row] = await db.query<AdminPolicyRow>(
    `insert into public.organization_admin_policies (
       organization_id, default_privacy_mode, allowed_privacy_modes,
       allow_managed_compute, require_local_to_byok_preview, chat_sync_surfaces,
       allow_cli_cloud_sync, allow_vscode_cloud_sync, allow_chrome_cloud_sync,
       audit_export_enabled, retention_days, retention_enforced,
       external_sharing_enabled, metadata
     ) values ($1, $2, $3::text[], $4, $5, $6::text[], $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
     on conflict (organization_id) do update set
       default_privacy_mode          = excluded.default_privacy_mode,
       allowed_privacy_modes         = excluded.allowed_privacy_modes,
       allow_managed_compute         = excluded.allow_managed_compute,
       require_local_to_byok_preview = excluded.require_local_to_byok_preview,
       chat_sync_surfaces            = excluded.chat_sync_surfaces,
       allow_cli_cloud_sync          = excluded.allow_cli_cloud_sync,
       allow_vscode_cloud_sync       = excluded.allow_vscode_cloud_sync,
       allow_chrome_cloud_sync       = excluded.allow_chrome_cloud_sync,
       audit_export_enabled          = excluded.audit_export_enabled,
       retention_days                = excluded.retention_days,
       retention_enforced            = excluded.retention_enforced,
       external_sharing_enabled      = excluded.external_sharing_enabled,
       metadata                      = excluded.metadata
     returning ${POLICY_COLUMNS}`,
    [
      organizationId,
      input.defaultPrivacyMode,
      input.allowedPrivacyModes,
      input.allowManagedCompute,
      input.requireLocalToByokPreview,
      input.chatSyncSurfaces,
      input.allowCliCloudSync,
      input.allowVsCodeCloudSync,
      input.allowChromeCloudSync,
      input.auditExportEnabled,
      input.retentionDays,
      input.retentionEnforced,
      input.externalSharingEnabled,
      JSON.stringify({ ...(input.metadata ?? {}), secretHandling: input.secretHandling }),
    ],
  );

  if (!row) {
    throw new Error(`organization_admin_policies upsert returned no row for ${organizationId}`);
  }
  return formatAdminPolicy(row);
}

export function diffAdminPolicy(
  before: AdminPolicy | null,
  after: AdminPolicy,
): Record<string, { from: unknown; to: unknown }> {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  const keys: (keyof AdminPolicyInput)[] = [
    'defaultPrivacyMode',
    'allowedPrivacyModes',
    'allowManagedCompute',
    'requireLocalToByokPreview',
    'chatSyncSurfaces',
    'allowCliCloudSync',
    'allowVsCodeCloudSync',
    'allowChromeCloudSync',
    'auditExportEnabled',
    'retentionDays',
    'retentionEnforced',
    'externalSharingEnabled',
    'secretHandling',
  ];

  for (const key of keys) {
    const from = before ? before[key] : undefined;
    const to = after[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changed[key] = { from: from ?? null, to };
    }
  }
  return changed;
}
