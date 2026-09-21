/**
 * @file resource-lifecycle.ts
 * @module @agiworkforce/types/resource-lifecycle
 *
 * # Deletion, archive, visibility and ACL, decided once for every resource
 *
 * Before this file each domain answered these four questions for itself. A
 * conversation was soft-deleted with `deleted_at`, an account was hard-purged
 * on a schedule, a published artifact carried its own `visibility` column, a
 * workspace policy carried a `subject_type`, and nothing anywhere said what a
 * reader of an archived resource may retrieve, how long a soft-deleted row
 * stays recoverable, or what happens to a child when its parent goes.
 *
 * The four questions are independent and this module keeps them apart:
 *
 *   lifecycle state   is the row alive, archived, soft-deleted or purged
 *   visibility        who may reach it at all
 *   permission        what a reader who reached it may do
 *   child disposition what happens to what hangs off it
 *
 * The rule that makes them composable: visibility never grants more than
 * `view`. Editing, sharing, transferring and deleting come from the role a
 * principal holds on the resource, never from the resource being public. A
 * public artifact is readable by the world and editable by nobody but its
 * owner, and that is one statement here rather than a convention repeated in
 * every route.
 */

/**
 * The values a resource's `visibility` column may hold. `organization` and
 * `public` are the two the database already stores (published_artifacts,
 * shared_sessions); `private` is the state of everything that was never
 * shared, which until now was the absence of a row rather than a value.
 */
export const RESOURCE_VISIBILITIES = ['private', 'organization', 'public'] as const;
export type ResourceVisibility = (typeof RESOURCE_VISIBILITIES)[number];

export const DEFAULT_RESOURCE_VISIBILITY: ResourceVisibility = 'private';

export const RESOURCE_LIFECYCLE_STATES = ['active', 'archived', 'soft_deleted', 'purged'] as const;
export type ResourceLifecycleState = (typeof RESOURCE_LIFECYCLE_STATES)[number];

export const RESOURCE_PERMISSIONS = [
  'view',
  'comment',
  'edit',
  'share',
  'transfer',
  'delete',
] as const;
export type ResourcePermission = (typeof RESOURCE_PERMISSIONS)[number];

export const RESOURCE_ROLES = ['owner', 'editor', 'commenter', 'viewer'] as const;
export type ResourceRole = (typeof RESOURCE_ROLES)[number];

/**
 * What happens to a child row when its parent is deleted. `cascade_delete` is
 * the FK's `on delete cascade`, `detach` keeps the child and clears the link
 * (project_knowledge_files.supersedes_id), `retain` keeps the child untouched
 * because a compliance obligation outlives the parent (audit, cost ledgers).
 */
export const RESOURCE_CHILD_DISPOSITIONS = ['cascade_delete', 'detach', 'retain'] as const;
export type ResourceChildDisposition = (typeof RESOURCE_CHILD_DISPOSITIONS)[number];

export interface ResourceLifecycleSemantics {
  /** Appears in the surface's default listing. */
  listed: boolean;
  /** Reachable by a search query that did not ask for this state. */
  searchable: boolean;
  /** Eligible to be pulled into a model's context by retrieval or memory. */
  aiRetrievable: boolean;
  /** The retention clock keeps running, so retention can still purge it. */
  retentionClockRunning: boolean;
  /** The owner can put it back in `active` without a support request. */
  restorable: boolean;
}

/**
 * Archive hides a resource without changing what it is: still owned, still
 * retrievable on request, still counted by retention. Soft delete is a
 * withdrawal of consent to use it, so it leaves search and AI retrieval
 * immediately and only the purge window keeps the bytes.
 */
export const RESOURCE_LIFECYCLE_SEMANTICS: Readonly<
  Record<ResourceLifecycleState, ResourceLifecycleSemantics>
> = {
  active: {
    listed: true,
    searchable: true,
    aiRetrievable: true,
    retentionClockRunning: true,
    restorable: false,
  },
  archived: {
    listed: false,
    searchable: false,
    aiRetrievable: false,
    retentionClockRunning: true,
    restorable: true,
  },
  soft_deleted: {
    listed: false,
    searchable: false,
    aiRetrievable: false,
    retentionClockRunning: true,
    restorable: true,
  },
  purged: {
    listed: false,
    searchable: false,
    aiRetrievable: false,
    retentionClockRunning: false,
    restorable: false,
  },
};

/**
 * The stores a legal hold can name, and the table each one is. A table that
 * reaches its owner through a parent names that parent, so a hold on a person
 * still preserves what they own indirectly.
 */
export interface HoldableResource {
  readonly resourceType: string;
  readonly table: string;
  readonly ownerColumn: string | null;
  readonly ownedVia: { readonly table: string; readonly column: string } | null;
  readonly organizationColumn: string | null;
  /** The column pointing at bytes this product stored, null when the row is
   * itself the content; a null value there is a reference, not preserved content. */
  readonly storedContentColumn: string | null;
}

export const HOLDABLE_RESOURCES: readonly HoldableResource[] = [
  {
    resourceType: 'conversation',
    table: 'web_conversations',
    ownerColumn: 'user_id',
    ownedVia: null,
    storedContentColumn: null,
    organizationColumn: 'organization_id',
  },
  {
    resourceType: 'message',
    table: 'web_messages',
    ownerColumn: null,
    ownedVia: { table: 'web_conversations', column: 'conversation_id' },
    storedContentColumn: null,
    organizationColumn: null,
  },
  {
    resourceType: 'project',
    table: 'user_projects',
    ownerColumn: 'user_id',
    ownedVia: null,
    storedContentColumn: null,
    organizationColumn: 'organization_id',
  },
  {
    resourceType: 'project_file',
    table: 'project_knowledge_files',
    ownerColumn: null,
    ownedVia: { table: 'user_projects', column: 'project_id' },
    storedContentColumn: 'storage_uri',
    organizationColumn: null,
  },
  {
    resourceType: 'file',
    table: 'media_assets',
    ownerColumn: 'user_id',
    ownedVia: null,
    storedContentColumn: 'storage_pathname',
    organizationColumn: 'organization_id',
  },
  {
    resourceType: 'artifact',
    table: 'web_artifacts',
    ownerColumn: 'user_id',
    ownedVia: null,
    storedContentColumn: null,
    organizationColumn: 'organization_id',
  },
  {
    resourceType: 'work_run',
    table: 'cloud_agent_runs',
    ownerColumn: 'user_id',
    ownedVia: null,
    storedContentColumn: null,
    organizationColumn: 'organization_id',
  },
];

export const HOLDABLE_RESOURCE_TYPES: readonly string[] = HOLDABLE_RESOURCES.map(
  (entry) => entry.resourceType,
);

export const HOLDABLE_TABLES: readonly string[] = HOLDABLE_RESOURCES.map((entry) => entry.table);

export function holdableResource(resourceType: string): HoldableResource | null {
  return HOLDABLE_RESOURCES.find((entry) => entry.resourceType === resourceType) ?? null;
}

export function holdableResourceForTable(table: string): HoldableResource | null {
  return HOLDABLE_RESOURCES.find((entry) => entry.table === table) ?? null;
}

/** Archive and soft delete are reversible, so a hold only refuses `purged`. */
export function holdBlocksTransition(next: ResourceLifecycleState): boolean {
  return next === 'purged';
}

const ROLE_PERMISSIONS: Readonly<Record<ResourceRole, readonly ResourcePermission[]>> = {
  owner: ['view', 'comment', 'edit', 'share', 'transfer', 'delete'],
  editor: ['view', 'comment', 'edit'],
  commenter: ['view', 'comment'],
  viewer: ['view'],
};

/** The only permission a visibility value can confer on a non-member. */
export const VISIBILITY_GRANTED_PERMISSION: ResourcePermission = 'view';

export interface ResourceAccessInput {
  visibility: ResourceVisibility;
  lifecycleState: ResourceLifecycleState;
  /** The account that owns the resource, never inferred from visibility. */
  ownerUserId: string | null;
  /** The organization the resource belongs to, null for personal scope. */
  organizationId: string | null;
  viewer: {
    userId: string | null;
    organizationId: string | null;
    /** An explicit grant row, e.g. organization_shared_artifacts. */
    grantedRole?: ResourceRole | null;
  };
}

export interface ResourceAccessDecision {
  role: ResourceRole | null;
  permissions: readonly ResourcePermission[];
  /** Reached only because the resource is public or organization-visible. */
  viaVisibility: boolean;
}

export function isResourceVisibility(value: unknown): value is ResourceVisibility {
  return (RESOURCE_VISIBILITIES as readonly unknown[]).includes(value);
}

export function isResourceRole(value: unknown): value is ResourceRole {
  return (RESOURCE_ROLES as readonly unknown[]).includes(value);
}

export function isResourceLifecycleState(value: unknown): value is ResourceLifecycleState {
  return (RESOURCE_LIFECYCLE_STATES as readonly unknown[]).includes(value);
}

/**
 * An unparseable visibility resolves to the most restrictive value, so a row
 * written by a newer surface is hidden rather than exposed.
 */
export function parseResourceVisibility(value: unknown): ResourceVisibility {
  return isResourceVisibility(value) ? value : DEFAULT_RESOURCE_VISIBILITY;
}

export function resourcePermissionsForRole(role: ResourceRole): readonly ResourcePermission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleCanPerform(role: ResourceRole, permission: ResourcePermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function lifecycleSemantics(state: ResourceLifecycleState): ResourceLifecycleSemantics {
  return RESOURCE_LIFECYCLE_SEMANTICS[state];
}

export function isSearchableLifecycleState(state: ResourceLifecycleState): boolean {
  return RESOURCE_LIFECYCLE_SEMANTICS[state].searchable;
}

export function isAiRetrievableLifecycleState(state: ResourceLifecycleState): boolean {
  return RESOURCE_LIFECYCLE_SEMANTICS[state].aiRetrievable;
}

/**
 * Whether `visibility` alone lets this viewer read the resource. It answers
 * only for `view`; every other permission is the role's answer.
 */
export function visibilityGrantsView(
  visibility: ResourceVisibility,
  viewer: { userId: string | null; organizationId: string | null },
  resourceOrganizationId: string | null,
): boolean {
  switch (visibility) {
    case 'public':
      return true;
    case 'organization':
      return (
        viewer.userId !== null &&
        resourceOrganizationId !== null &&
        viewer.organizationId === resourceOrganizationId
      );
    case 'private':
      return false;
  }
}

/**
 * The single evaluation every surface runs. Ownership wins, then an explicit
 * grant, then visibility, and visibility can only ever return `view`.
 */
export function resolveResourceAccess(input: ResourceAccessInput): ResourceAccessDecision {
  const denied: ResourceAccessDecision = { role: null, permissions: [], viaVisibility: false };

  if (input.lifecycleState === 'purged') return denied;

  const isOwner = input.ownerUserId !== null && input.ownerUserId === input.viewer.userId;
  if (isOwner) {
    return {
      role: 'owner',
      permissions: resourcePermissionsForRole('owner'),
      viaVisibility: false,
    };
  }

  if (input.lifecycleState === 'soft_deleted') return denied;

  const granted = input.viewer.grantedRole ?? null;
  if (granted !== null) {
    return {
      role: granted,
      permissions: resourcePermissionsForRole(granted),
      viaVisibility: false,
    };
  }

  if (visibilityGrantsView(input.visibility, input.viewer, input.organizationId)) {
    return { role: 'viewer', permissions: [VISIBILITY_GRANTED_PERMISSION], viaVisibility: true };
  }

  return denied;
}

export function canPerformOnResource(
  input: ResourceAccessInput,
  permission: ResourcePermission,
): boolean {
  return resolveResourceAccess(input).permissions.includes(permission);
}
