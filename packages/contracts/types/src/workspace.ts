// The tenancy model every surface reads: Account is one person, Organization is
// the billed tenant, Workspace is the container content lives in.

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

/** Only an active membership carries access. Anything else is a record. */
export function membershipGrantsAccess(status: MembershipStatus): boolean {
  return status === 'active';
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

export const PERSONAL_WORKSPACE_SELECTOR = 'personal';
