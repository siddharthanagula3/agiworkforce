// The tenancy model every surface reads: Account is one person, Organization is
// the billed tenant, Workspace is the container content lives in.

import type { SourceSurface } from './suite-contracts';

export const WORKSPACE_KINDS = ['personal', 'organization'] as const;

export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export interface Workspace {
  id: string;
  kind: WorkspaceKind;
  /** Null for a personal workspace, which belongs to an account, not a tenant. */
  organizationId: string | null;
  /** The account a personal workspace belongs to; null for an organization one. */
  ownerAccountId: string | null;
  name: string;
  slug: string;
  /**
   * True for the one workspace an organization's existing `organization_id`
   * scoped rows belong to. Exactly one per organization.
   */
  isPrimary: boolean;
  /** Where this workspace's data is processed, when a contract pins it. */
  region: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSummary {
  id: string;
  kind: WorkspaceKind;
  organizationId: string | null;
  name: string;
  slug: string;
  isPrimary: boolean;
  role: string | null;
}

export const MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended', 'deprovisioned'] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

// Deprovisioned is terminal: re-admitting somebody is a new invitation, so an
// offboarded account is never reactivated by flipping one column.
export const MEMBERSHIP_STATUS_TRANSITIONS: Readonly<
  Record<MembershipStatus, readonly MembershipStatus[]>
> = Object.freeze({
  invited: ['active', 'deprovisioned'],
  active: ['suspended', 'deprovisioned'],
  suspended: ['active', 'deprovisioned'],
  deprovisioned: [],
});

export function isMembershipStatus(value: unknown): value is MembershipStatus {
  return typeof value === 'string' && (MEMBERSHIP_STATUSES as readonly string[]).includes(value);
}

export function canTransitionMembership(from: MembershipStatus, to: MembershipStatus): boolean {
  return MEMBERSHIP_STATUS_TRANSITIONS[from].includes(to);
}

/** Only an active membership carries access. Anything else is a record. */
export function membershipGrantsAccess(status: MembershipStatus): boolean {
  return status === 'active';
}

export const SEAT_TYPES = ['full', 'limited', 'guest'] as const;

export type SeatType = (typeof SEAT_TYPES)[number];

export interface OrganizationMembership {
  organizationId: string;
  accountId: string;
  roleKey: string;
  status: MembershipStatus;
  seatType: SeatType;
  // The one account that can transfer ownership and delete the organization.
  // Distinct from the assignable Owner role, of which there may be several.
  isPrimaryOwner: boolean;
  joinedAt: string;
  statusChangedAt: string;
}

export interface WorkspaceMembership {
  workspaceId: string;
  accountId: string;
  status: MembershipStatus;
  joinedAt: string;
}

export const ACCOUNT_IDENTITY_PROVIDERS = ['clerk', 'saml', 'oidc', 'device'] as const;

export type AccountIdentityProvider = (typeof ACCOUNT_IDENTITY_PROVIDERS)[number];

export interface AccountIdentity {
  id: string;
  accountId: string;
  provider: AccountIdentityProvider;
  subject: string;
  email: string | null;
  isPrimary: boolean;
  linkedAt: string;
}

export interface Account {
  id: string;
  email: string | null;
  displayName: string | null;
  /** BCP-47. Null means the surface falls back to the request's language. */
  locale: string | null;
  personalWorkspaceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountSecuritySettings {
  accountId: string;
  mfaEnrolled: boolean;
  /** Personal-scope allow list, independent of any organization's. */
  ipAllowList: readonly string[];
  updatedAt: string;
}

export interface Device {
  id: string;
  accountId: string;
  name: string;
  operatingSystem: string | null;
  architecture: string | null;
  createdAt: string;
  lastSeenAt: string | null;
}

// One copy of one app on one device. Not the device, not the session.
export interface Installation {
  id: string;
  deviceId: string;
  accountId: string;
  surface: SourceSurface;
  appVersion: string | null;
  installedAt: string;
  lastSeenAt: string | null;
}

/** One authenticated period of use of one installation. */
export interface DeviceSession {
  id: string;
  installationId: string;
  accountId: string;
  startedAt: string;
  lastActiveAt: string;
  revokedAt: string | null;
}

export const WORK_RUN_KINDS = ['cloud_agent', 'cloud_code', 'retrieval_index'] as const;

export type WorkRunKind = (typeof WORK_RUN_KINDS)[number];

export const WORK_RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;

export type WorkRunStatus = (typeof WORK_RUN_STATUSES)[number];

export function isTerminalWorkRunStatus(status: WorkRunStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

// What the three run types share, so listing, cancelling and cost attribution
// need no fourth implementation when a fourth run type arrives.
export interface WorkRun {
  id: string;
  kind: WorkRunKind;
  workspaceId: string | null;
  organizationId: string | null;
  accountId: string;
  status: WorkRunStatus;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const SUPPORT_RECORD_KINDS = ['support_case', 'incident', 'known_issue'] as const;

// A customer's request, a service degradation, and a confirmed defect. A case
// may reference an incident or a known issue; it is never either of them.
export type SupportRecordKind = (typeof SUPPORT_RECORD_KINDS)[number];

export const ACTIVE_WORKSPACE_HEADER = 'x-agi-workspace';

export const PERSONAL_WORKSPACE_SELECTOR = 'personal';

// A header selects a workspace, it never grants one, and an unresolvable
// selection is refused rather than downgraded: wrong scope leaks across tenants.
export type ActiveWorkspaceResolution =
  | { scope: 'personal'; workspaceId: string | null }
  | { scope: 'organization'; workspaceId: string; organizationId: string }
  | { scope: 'denied'; reason: 'not_a_member' | 'unknown_workspace' };

export function resolveActiveWorkspace(input: {
  requested: string | null | undefined;
  memberships: readonly WorkspaceSummary[];
  personalWorkspaceId: string | null;
  lastSelectedWorkspaceId?: string | null;
}): ActiveWorkspaceResolution {
  const requested = input.requested?.trim() || null;
  if (requested === PERSONAL_WORKSPACE_SELECTOR) {
    return { scope: 'personal', workspaceId: input.personalWorkspaceId };
  }

  const selector = requested ?? input.lastSelectedWorkspaceId ?? null;
  if (!selector || selector === PERSONAL_WORKSPACE_SELECTOR) {
    return { scope: 'personal', workspaceId: input.personalWorkspaceId };
  }
  if (selector === input.personalWorkspaceId) {
    return { scope: 'personal', workspaceId: input.personalWorkspaceId };
  }

  const membership = input.memberships.find((workspace) => workspace.id === selector);
  if (!membership) {
    return { scope: 'denied', reason: requested ? 'not_a_member' : 'unknown_workspace' };
  }
  if (membership.kind === 'personal' || !membership.organizationId) {
    return { scope: 'personal', workspaceId: membership.id };
  }
  return {
    scope: 'organization',
    workspaceId: membership.id,
    organizationId: membership.organizationId,
  };
}
