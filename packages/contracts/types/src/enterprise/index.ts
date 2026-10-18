/**
 * Enterprise control-plane contracts.
 *
 * These types are the shared source for Web admin, API gateway, Desktop policy
 * enforcement, Mobile display state, and future managed-compute billing gates.
 *
 * The product rule is intentionally strict: Local and BYOK can be public. AGI
 * managed compute stays gated until a per-customer ledger proves margin,
 * fraud, refund, and dispute controls.
 *
 * @module enterprise
 * @packageDocumentation
 */

import type { Provider } from '../provider';
import type { PrivacyMode, SourceSurface, SyncedAppSurface } from '../suite-contracts';
import { DEFAULT_WORKSPACE_CONTROLS, type WorkspaceControls } from './workspace-controls';

export * from './permissions';
export * from './workspace-controls';
export * from './authorization';
export * from './retention-domains';
export * from './contract-lifecycle';
export * from './commitments';
export * from './invoice-terms';
export * from './commercial-contract';

export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';

export type EnterpriseSurface = SourceSurface;

export type EnterprisePrivacyMode = PrivacyMode;

export type SecretHandlingMode = 'warn' | 'redact' | 'block';

export const SECRET_HANDLING_MODE_DEFAULT: Readonly<
  Record<'organization' | 'personal', SecretHandlingMode>
> = Object.freeze({
  organization: 'redact',
  personal: 'warn',
});

const SECRET_HANDLING_MODE_STRICTNESS: Readonly<Record<SecretHandlingMode, number>> = Object.freeze(
  {
    warn: 0,
    redact: 1,
    block: 2,
  },
);

export function strictestSecretHandlingMode(
  left: SecretHandlingMode,
  right: SecretHandlingMode,
): SecretHandlingMode {
  return SECRET_HANDLING_MODE_STRICTNESS[right] > SECRET_HANDLING_MODE_STRICTNESS[left]
    ? right
    : left;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPolicy {
  organizationId: string;
  defaultPrivacyMode: EnterprisePrivacyMode;
  allowedPrivacyModes: EnterprisePrivacyMode[];
  allowManagedCompute: boolean;
  requireLocalToByokPreview: boolean;
  chatSyncSurfaces: SyncedAppSurface[];
  allowCliCloudSync: boolean;
  allowVsCodeCloudSync: boolean;
  allowChromeCloudSync: boolean;
  auditExportEnabled: boolean;
  retentionDays: number;
  /**
   * Whether `retentionDays` deletes anything.
   *
   * False means the number is a recorded position and no sweep acts on it.
   * the state every workspace starts in, because turning retention on
   * permanently deletes conversations and that must be a deliberate choice.
   * Surfaces that show retention must read this before describing it as a
   * control.
   */
  retentionEnforced: boolean;
  /**
   * Whether members may mint anonymous public links.
   *
   * Two states, not three: a public link has no recipient identity at fetch
   * time, so an "approved domains only" middle state would be a control that
   * decides nothing. Defaults true so no existing workspace loses sharing when
   * this ships.
   */
  externalSharingEnabled: boolean;
  /**
   * Whether members of this workspace may use managed account memory at all.
   *
   * False means no member gets memory regardless of their own per-user
   * setting, matching how Claude Team/Enterprise and ChatGPT Enterprise gate
   * memory behind an admin. Defaults false so no existing workspace gains
   * memory when this ships; an owner or admin must turn it on.
   */
  allowMemory: boolean;
  secretHandling: SecretHandlingMode;
  requireMfa: boolean;
  monthlySpendCapCents: number | null;
  zeroDataRetentionOnly: boolean;
  allowProductAnalytics: boolean;
  ipAllowList: readonly string[];
  controls: WorkspaceControls;
  metadata?: Record<string, unknown>;
  revision?: number;
  updatedAt: string;
}

export interface ProviderPolicy {
  organizationId: string;
  allowedProviders: Provider[];
  blockedProviders: Provider[];
  allowedModels: string[];
  blockedModels: string[];
  requireStoreFalseForByok: boolean;
  allowProviderTrainingOptIn: boolean;
  managedProviderAllowlist: Provider[];
  updatedAt: string;
}

export interface ConnectorPolicy {
  id: string;
  organizationId: string;
  connectorId: string;
  mode: 'disabled' | 'admin_approved' | 'member_opt_in';
  allowedSurfaces: EnterpriseSurface[];
  requireAdminApproval: boolean;
  metadata?: Record<string, unknown>;
  updatedAt: string;
}

export type EnterpriseAuditAction =
  | 'organization.created'
  | 'organization.updated'
  | 'member.invited'
  | 'member.updated'
  | 'member.removed'
  | 'policy.updated'
  | 'provider_policy.updated'
  | 'connector_policy.updated'
  | 'retention_policy.updated'
  | 'sso.configured'
  | 'scim.configured'
  | 'support_case.created'
  | 'managed_compute.requested'
  | 'managed_compute.throttled'
  | 'managed_compute.disabled'
  | 'audit.exported';

export interface EnterpriseAuditEvent {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  surface: EnterpriseSurface | 'system';
  action: EnterpriseAuditAction | string;
  resourceType: string;
  resourceId: string | null;
  outcome: 'success' | 'failure' | 'denied';
  severity: 'info' | 'warning' | 'critical';
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export const DEFAULT_ENTERPRISE_ADMIN_POLICY: Omit<AdminPolicy, 'organizationId' | 'updatedAt'> = {
  defaultPrivacyMode: 'byok',
  allowedPrivacyModes: ['local', 'byok'],
  allowManagedCompute: false,
  requireLocalToByokPreview: true,
  chatSyncSurfaces: ['web', 'desktop', 'mobile'],
  allowCliCloudSync: false,
  allowVsCodeCloudSync: false,
  allowChromeCloudSync: false,
  auditExportEnabled: true,
  retentionDays: 365,
  // Off by default and never flipped by a migration: enabling retention starts
  // permanently deleting conversations, which only a workspace owner can decide.
  retentionEnforced: false,
  externalSharingEnabled: true,
  allowMemory: false,
  secretHandling: SECRET_HANDLING_MODE_DEFAULT.organization,
  requireMfa: false,
  monthlySpendCapCents: null,
  zeroDataRetentionOnly: false,
  allowProductAnalytics: true,
  ipAllowList: [],
  controls: DEFAULT_WORKSPACE_CONTROLS,
};

export const MANAGED_COMPUTE_MARGIN_POLICY = {
  warningAtRevenueShare: 0.35,
  hardStopAtRevenueShare: 0.5,
  publicLaunchGrossMarginFloor: 0.5,
} as const;

export function isOrganizationAdminRole(role: OrganizationRole): boolean {
  return role === 'owner' || role === 'admin';
}
