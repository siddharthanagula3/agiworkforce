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

export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';

export type EnterpriseSurface = 'web' | 'desktop' | 'mobile' | 'cli' | 'vscode' | 'chrome';

export type EnterprisePrivacyMode = 'local' | 'byok' | 'managed';

export type EnterprisePlanTier = 'free' | 'pro_individual' | 'team' | 'business' | 'enterprise';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  email?: string | null;
  displayName?: string | null;
  provisioningSource: 'manual' | 'scim' | 'sso_jit' | 'admin';
  joinedAt: string;
}

export interface AdminPolicy {
  organizationId: string;
  defaultPrivacyMode: EnterprisePrivacyMode;
  allowedPrivacyModes: EnterprisePrivacyMode[];
  allowManagedCompute: boolean;
  requireLocalToByokPreview: boolean;
  chatSyncSurfaces: Array<Extract<EnterpriseSurface, 'web' | 'desktop' | 'mobile'>>;
  allowCliCloudSync: boolean;
  allowVsCodeCloudSync: boolean;
  allowChromeCloudSync: boolean;
  auditExportEnabled: boolean;
  retentionDays: number;
  metadata?: Record<string, unknown>;
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

export interface RetentionPolicy {
  organizationId: string;
  conversationRetentionDays: number;
  artifactRetentionDays: number;
  auditRetentionDays: number;
  localExportEnabled: boolean;
  deletionReviewRequired: boolean;
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
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditExportRequest {
  organizationId: string;
  requestedByUserId: string;
  startAt: string;
  endAt: string;
  format: 'jsonl' | 'csv';
  status: 'queued' | 'processing' | 'ready' | 'failed' | 'expired';
  downloadUrl?: string;
  expiresAt?: string;
}

export interface IdentityProviderConfig {
  id: string;
  organizationId: string;
  providerType: 'saml' | 'oidc';
  domain: string;
  displayName?: string | null;
  metadataUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScimUser {
  id: string;
  externalId: string;
  userName: string;
  active: boolean;
  name?: {
    givenName?: string;
    familyName?: string;
    formatted?: string;
  };
  emails?: Array<{ value: string; primary?: boolean }>;
  groups?: Array<{ value: string; display?: string }>;
}

export interface ScimGroup {
  id: string;
  externalId: string;
  displayName: string;
  members?: Array<{ value: string; display?: string }>;
}

export interface SupportCase {
  id: string;
  organizationId: string | null;
  requesterUserId: string;
  subject: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'triaged' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';
  privacyLabel: 'local_only' | 'byok' | 'managed' | 'security_sensitive';
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackCase {
  id: string;
  organizationId: string | null;
  reporterUserId: string | null;
  sourceSurface: EnterpriseSurface;
  category: 'bug' | 'feature_request' | 'quality' | 'security' | 'billing' | 'support';
  title: string;
  body: string;
  status: 'new' | 'triaged' | 'linked_to_fix' | 'shipped' | 'wont_do';
  createdAt: string;
}

export interface ReleaseFixLink {
  id: string;
  feedbackCaseId: string;
  pullRequestUrl: string | null;
  commitSha: string | null;
  releaseVersion: string | null;
  status: 'proposed' | 'merged' | 'released' | 'rolled_back';
  createdAt: string;
}

export interface UsageLedgerEntry {
  id: string;
  organizationId: string | null;
  userId: string | null;
  privacyMode: EnterprisePrivacyMode;
  provider: Provider | string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  providerCostUsd: number;
  chargedAmountUsd: number;
  grossMarginUsd: number;
  grossMarginPct: number | null;
  createdAt: string;
}

export interface ManagedCreditAccount {
  id: string;
  organizationId: string;
  status: 'waitlisted' | 'private_beta' | 'active' | 'suspended' | 'closed';
  billingMode: 'invoice_ach' | 'invoice_wire' | 'stripe_card' | 'manual';
  balanceCents: number;
  reservedRefundCents: number;
  hardLimitCents: number;
  monthlyLimitCents: number;
  publicLaunchBlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderCostSnapshot {
  id: string;
  provider: Provider | string;
  model: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  sourceUrl: string;
  capturedAt: string;
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
};

export const MANAGED_COMPUTE_MARGIN_POLICY = {
  warningAtRevenueShare: 0.35,
  hardStopAtRevenueShare: 0.5,
  publicLaunchGrossMarginFloor: 0.5,
} as const;

export function isOrganizationAdminRole(role: OrganizationRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function getUsageCostShare(
  entry: Pick<UsageLedgerEntry, 'providerCostUsd' | 'chargedAmountUsd'>,
): number | null {
  if (entry.chargedAmountUsd <= 0) return null;
  return entry.providerCostUsd / entry.chargedAmountUsd;
}

export function requiresManagedComputeMarginReview(
  entry: Pick<UsageLedgerEntry, 'providerCostUsd' | 'chargedAmountUsd'>,
): boolean {
  const share = getUsageCostShare(entry);
  return share === null || share >= MANAGED_COMPUTE_MARGIN_POLICY.warningAtRevenueShare;
}
