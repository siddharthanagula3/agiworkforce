import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEFAULT_ENTERPRISE_ADMIN_POLICY,
  DEFAULT_WORKSPACE_CONTROLS,
  SECRET_HANDLING_MODE_DEFAULT,
  WORKSPACE_FEATURES,
  isWorkspaceReasoningEffort,
  DEFAULT_WORKSPACE_CODE_CONTROLS,
  WORKSPACE_CODE_TOGGLE_KEYS,
  type AdminPolicy,
  type PrivacyMode,
  type SecretHandlingMode,
  type SourceSurface,
  type SyncedAppSurface,
  type WorkspaceCodeControls,
  type WorkspaceCodeControlsLayer,
  type WorkspaceControls,
  type WorkspaceControlsLayer,
  type WorkspaceFeature,
} from '@agiworkforce/types';
import { invalidateIpAllowListCache } from '@/lib/services/organization-ip-allow-list-cache';

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
  allow_memory: boolean;
  metadata: Record<string, unknown> | null;
  updated_at: string;
  revision?: number | string | null;
  override_count?: number | string | null;
}

const POLICY_COLUMNS = `organization_id, default_privacy_mode, allowed_privacy_modes,
  allow_managed_compute, require_local_to_byok_preview, chat_sync_surfaces,
  allow_cli_cloud_sync, allow_vscode_cloud_sync, allow_chrome_cloud_sync,
  audit_export_enabled, retention_days, retention_enforced,
  external_sharing_enabled, allow_memory, metadata, updated_at`;

const LAYERING_COLUMNS = `(select coalesce(max(r.revision), 0)
     from public.organization_policy_revisions r
    where r.organization_id = p.organization_id) as revision,
  (select count(*)
     from public.organization_policy_overrides o
    where o.organization_id = p.organization_id) as override_count`;

const SOURCE_SURFACES: readonly SourceSurface[] = [
  'web',
  'desktop',
  'mobile',
  'cli',
  'vscode',
  'chrome',
];

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

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

function readRequireMfa(metadata: Record<string, unknown> | null): boolean {
  return metadata?.['requireMfa'] === true;
}

function readMonthlySpendCapCents(metadata: Record<string, unknown> | null): number | null {
  const value = metadata?.['monthlySpendCapCents'];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function readZeroDataRetentionOnly(metadata: Record<string, unknown> | null): boolean {
  return metadata?.['zeroDataRetentionOnly'] === true;
}

function readIpAllowList(metadata: Record<string, unknown> | null): readonly string[] {
  const value = metadata?.['ipAllowList'];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function readCountries(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim().toUpperCase())
        .filter((entry) => COUNTRY_CODE_PATTERN.test(entry)),
    ),
  ].sort();
}

function readSurfaces(value: unknown): readonly SourceSurface[] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  return SOURCE_SURFACES.filter((surface) => value.includes(surface));
}

const HOST_PATTERN =
  /^(\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const MAX_CODE_HOSTS = 200;
const MAX_CODE_RETENTION_DAYS = 3650;

/**
 * Code controls live at `metadata.codeControls`, beside `metadata.controls`
 * rather than inside it, so that a policy PATCH that rewrites the workspace
 * controls object cannot drop them by omission.
 */
export const WORKSPACE_CODE_CONTROLS_METADATA_KEY = 'codeControls';

export function parseCodeHostList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => HOST_PATTERN.test(entry)),
    ),
  ]
    .sort()
    .slice(0, MAX_CODE_HOSTS);
}

function parseRetentionDays(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return undefined;
  return Math.min(value, MAX_CODE_RETENTION_DAYS);
}

export function parseWorkspaceCodeControlsLayer(value: unknown): WorkspaceCodeControlsLayer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const layer: WorkspaceCodeControlsLayer = {};

  for (const key of WORKSPACE_CODE_TOGGLE_KEYS) {
    if (typeof record[key] === 'boolean') layer[key] = record[key] as boolean;
  }

  const mcpServers = parseCodeHostList(record['allowedMcpServers']);
  if (mcpServers !== undefined) layer.allowedMcpServers = mcpServers;

  const egressHosts = parseCodeHostList(record['allowedEgressHosts']);
  if (egressHosts !== undefined) layer.allowedEgressHosts = egressHosts;

  const retention = parseRetentionDays(record['sessionRetentionDays']);
  if (retention !== undefined) layer.sessionRetentionDays = retention;

  return layer;
}

export function readWorkspaceCodeControls(
  metadata: Record<string, unknown> | null | undefined,
): WorkspaceCodeControls {
  return {
    ...DEFAULT_WORKSPACE_CODE_CONTROLS,
    ...parseWorkspaceCodeControlsLayer(metadata?.[WORKSPACE_CODE_CONTROLS_METADATA_KEY]),
  };
}

export function withWorkspaceCodeControls(
  metadata: Record<string, unknown> | null | undefined,
  controls: WorkspaceCodeControls,
): Record<string, unknown> {
  return { ...(metadata ?? {}), [WORKSPACE_CODE_CONTROLS_METADATA_KEY]: controls };
}

export function parseWorkspaceControlsLayer(value: unknown): WorkspaceControlsLayer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const layer: WorkspaceControlsLayer = {};

  const features = record['featureAccess'];
  if (features && typeof features === 'object' && !Array.isArray(features)) {
    const access: Partial<Record<WorkspaceFeature, boolean>> = {};
    for (const feature of WORKSPACE_FEATURES) {
      const enabled = (features as Record<string, unknown>)[feature];
      if (typeof enabled === 'boolean') access[feature] = enabled;
    }
    layer.featureAccess = access;
  }

  const defaultModelId = record['defaultModelId'];
  if (defaultModelId === null || (typeof defaultModelId === 'string' && defaultModelId.trim())) {
    layer.defaultModelId = typeof defaultModelId === 'string' ? defaultModelId.trim() : null;
  }

  const effort = record['maxReasoningEffort'];
  if (effort === null || isWorkspaceReasoningEffort(effort)) {
    layer.maxReasoningEffort = effort;
  }

  const countries = readCountries(record['allowedCountries']);
  if (countries !== undefined) layer.allowedCountries = countries;

  const surfaces = readSurfaces(record['allowedSurfaces']);
  if (surfaces !== undefined) layer.allowedSurfaces = surfaces;

  const code = record['code'];
  if (code && typeof code === 'object' && !Array.isArray(code)) {
    layer.code = parseWorkspaceCodeControlsLayer(code);
  }

  return layer;
}

export function readWorkspaceControls(metadata: Record<string, unknown> | null): WorkspaceControls {
  const layer = parseWorkspaceControlsLayer(metadata?.['controls']);
  return {
    featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, ...layer.featureAccess },
    defaultModelId: layer.defaultModelId ?? null,
    maxReasoningEffort: layer.maxReasoningEffort ?? null,
    allowedCountries: layer.allowedCountries ?? [],
    allowedSurfaces: layer.allowedSurfaces ?? null,
  };
}

function toCount(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : (value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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
    allowMemory: row.allow_memory,
    secretHandling: readSecretHandling(row.metadata),
    requireMfa: readRequireMfa(row.metadata),
    monthlySpendCapCents: readMonthlySpendCapCents(row.metadata),
    zeroDataRetentionOnly: readZeroDataRetentionOnly(row.metadata),
    ipAllowList: readIpAllowList(row.metadata),
    controls: readWorkspaceControls(row.metadata),
    metadata: row.metadata ?? {},
    revision: toCount(row.revision),
    updatedAt: toIso(row.updated_at),
  };
}

export function organizationPolicyHasOverrides(row: Pick<AdminPolicyRow, 'override_count'>) {
  return toCount(row.override_count) > 0;
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

export interface LayeredOrganizationPolicy {
  policy: AdminPolicy;
  hasOverrides: boolean;
}

export async function readLayeredOrganizationPolicy(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<LayeredOrganizationPolicy | null> {
  const [row] = await db.query<AdminPolicyRow>(
    `select ${POLICY_COLUMNS}, ${LAYERING_COLUMNS}
       from public.organization_admin_policies p
      where p.organization_id = $1
      limit 1`,
    [organizationId],
  );
  return row
    ? { policy: formatAdminPolicy(row), hasOverrides: organizationPolicyHasOverrides(row) }
    : null;
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

export async function readOrganizationPolicyRevision(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<{ revision: number; changedAt: string | null }> {
  const [row] = await db.query<{ revision: number | string | null; changed_at: unknown }>(
    `select revision, changed_at
       from public.organization_policy_revisions
      where organization_id = $1
      order by revision desc
      limit 1`,
    [organizationId],
  );
  return {
    revision: toCount(row?.revision),
    changedAt: row?.changed_at ? toIso(row.changed_at) : null,
  };
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
       external_sharing_enabled, allow_memory, metadata
     ) values ($1, $2, $3::text[], $4, $5, $6::text[], $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
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
       allow_memory                  = excluded.allow_memory,
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
      input.allowMemory,
      JSON.stringify({
        ...(input.metadata ?? {}),
        secretHandling: input.secretHandling,
        requireMfa: input.requireMfa,
        monthlySpendCapCents: input.monthlySpendCapCents,
        zeroDataRetentionOnly: input.zeroDataRetentionOnly,
        ipAllowList: input.ipAllowList,
        controls: input.controls,
      }),
    ],
  );

  if (!row) {
    throw new Error(`organization_admin_policies upsert returned no row for ${organizationId}`);
  }
  // Eviction belongs to the write, not to one route: the code-controls route
  // writes the same row and would otherwise leave a stale allow list cached.
  invalidateIpAllowListCache(organizationId);
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
    'allowMemory',
    'secretHandling',
    'requireMfa',
    'monthlySpendCapCents',
    'zeroDataRetentionOnly',
    'ipAllowList',
    'controls',
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

export type PolicyChangeDirection = 'narrows' | 'widens' | 'changes';

export interface PolicyChangeImpact {
  key: string;
  from: unknown;
  to: unknown;
  direction: PolicyChangeDirection;
}

export interface PolicyBlastRadius {
  narrowing: PolicyChangeImpact[];
  widening: PolicyChangeImpact[];
  neutral: PolicyChangeImpact[];
  revokesAccess: boolean;
}

const PERMISSIVE_WHEN_TRUE: readonly string[] = [
  'allowManagedCompute',
  'chatSyncSurfaces',
  'allowCliCloudSync',
  'allowVsCodeCloudSync',
  'allowChromeCloudSync',
  'auditExportEnabled',
  'externalSharingEnabled',
  'allowMemory',
  'allowedPrivacyModes',
];

const RESTRICTIVE_WHEN_TRUE: readonly string[] = [
  'requireLocalToByokPreview',
  'retentionEnforced',
  'requireMfa',
  'zeroDataRetentionOnly',
];

const REASONING_EFFORT_ORDER: readonly string[] = ['low', 'medium', 'high'];

function listDirection(
  from: unknown,
  to: unknown,
  allowListSemantics: boolean,
): PolicyChangeDirection {
  if (!Array.isArray(from) || !Array.isArray(to)) return 'changes';
  const before = new Set(from as unknown[]);
  const after = new Set(to as unknown[]);
  if (allowListSemantics) {
    if (before.size === 0 && after.size > 0) return 'narrows';
    if (before.size > 0 && after.size === 0) return 'widens';
  }
  const removed = [...before].some((entry) => !after.has(entry));
  const added = [...after].some((entry) => !before.has(entry));
  if (removed && !added) return allowListSemantics ? 'narrows' : 'narrows';
  if (added && !removed) return 'widens';
  return 'changes';
}

function numericDirection(
  from: unknown,
  to: unknown,
  lowerIsStricter: boolean,
): PolicyChangeDirection {
  const before = from === null || from === undefined ? null : Number(from);
  const after = to === null || to === undefined ? null : Number(to);
  if (before === null && after !== null) return lowerIsStricter ? 'narrows' : 'widens';
  if (before !== null && after === null) return lowerIsStricter ? 'widens' : 'narrows';
  if (before === null || after === null) return 'changes';
  if (after === before) return 'changes';
  const stricter = lowerIsStricter ? after < before : after > before;
  return stricter ? 'narrows' : 'widens';
}

function featureAccessImpacts(from: unknown, to: unknown): PolicyChangeImpact[] {
  const before = (from ?? {}) as Record<string, unknown>;
  const after = (to ?? {}) as Record<string, unknown>;
  const impacts: PolicyChangeImpact[] = [];
  for (const feature of WORKSPACE_FEATURES) {
    const was = before[feature];
    const now = after[feature];
    if (was === now) continue;
    impacts.push({
      key: `controls.featureAccess.${feature}`,
      from: was ?? null,
      to: now ?? null,
      direction: now === false ? 'narrows' : now === true ? 'widens' : 'changes',
    });
  }
  return impacts;
}

function controlsImpacts(from: unknown, to: unknown): PolicyChangeImpact[] {
  const before = (from ?? {}) as Record<string, unknown>;
  const after = (to ?? {}) as Record<string, unknown>;
  const impacts = featureAccessImpacts(before['featureAccess'], after['featureAccess']);

  if (JSON.stringify(before['defaultModelId']) !== JSON.stringify(after['defaultModelId'])) {
    impacts.push({
      key: 'controls.defaultModelId',
      from: before['defaultModelId'] ?? null,
      to: after['defaultModelId'] ?? null,
      direction: 'changes',
    });
  }

  if (
    JSON.stringify(before['maxReasoningEffort']) !== JSON.stringify(after['maxReasoningEffort'])
  ) {
    const wasIndex = REASONING_EFFORT_ORDER.indexOf(String(before['maxReasoningEffort']));
    const nowIndex = REASONING_EFFORT_ORDER.indexOf(String(after['maxReasoningEffort']));
    impacts.push({
      key: 'controls.maxReasoningEffort',
      from: before['maxReasoningEffort'] ?? null,
      to: after['maxReasoningEffort'] ?? null,
      direction:
        nowIndex === -1 ? 'widens' : wasIndex === -1 || nowIndex < wasIndex ? 'narrows' : 'widens',
    });
  }

  for (const key of ['allowedCountries', 'allowedSurfaces'] as const) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    const beforeList = before[key] ?? [];
    const afterList = after[key] ?? [];
    impacts.push({
      key: `controls.${key}`,
      from: before[key] ?? null,
      to: after[key] ?? null,
      direction:
        after[key] === null
          ? 'widens'
          : before[key] === null
            ? 'narrows'
            : listDirection(beforeList, afterList, true),
    });
  }

  return impacts;
}

function impactFor(key: string, from: unknown, to: unknown): PolicyChangeImpact {
  if (PERMISSIVE_WHEN_TRUE.includes(key)) {
    if (Array.isArray(from) || Array.isArray(to)) {
      return { key, from, to, direction: listDirection(from, to, false) };
    }
    return {
      key,
      from,
      to,
      direction: to === false ? 'narrows' : to === true ? 'widens' : 'changes',
    };
  }
  if (RESTRICTIVE_WHEN_TRUE.includes(key)) {
    return {
      key,
      from,
      to,
      direction: to === true ? 'narrows' : to === false ? 'widens' : 'changes',
    };
  }
  if (key === 'retentionDays' || key === 'monthlySpendCapCents') {
    return { key, from, to, direction: numericDirection(from, to, true) };
  }
  if (key === 'ipAllowList') {
    return { key, from, to, direction: listDirection(from, to, true) };
  }
  return { key, from, to, direction: 'changes' };
}

/**
 * What a proposed policy takes away before it is saved, so an administrator is
 * shown the consequence rather than discovering it from a support ticket.
 */
export function simulateAdminPolicyChange(
  before: AdminPolicy | null,
  after: AdminPolicy,
): PolicyBlastRadius {
  const diff = diffAdminPolicy(before, after);
  const impacts: PolicyChangeImpact[] = [];

  for (const [key, change] of Object.entries(diff)) {
    if (key === 'controls') {
      impacts.push(...controlsImpacts(change.from, change.to));
      continue;
    }
    impacts.push(impactFor(key, change.from, change.to));
  }

  const narrowing = impacts.filter((impact) => impact.direction === 'narrows');
  return {
    narrowing,
    widening: impacts.filter((impact) => impact.direction === 'widens'),
    neutral: impacts.filter((impact) => impact.direction === 'changes'),
    revokesAccess: narrowing.length > 0,
  };
}
