import { isOrganizationAdminRole } from '@agiworkforce/types';
import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import type { OrganizationRow, OrganizationMemberRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';
import {
  getTeamAdminAccess,
  requireTeamAdminAccess,
  type TeamAdminAccess,
} from '@/app/api/settings/team/team-admin-access';
import { getStripeClient } from '@/lib/server/stripe-client';
import {
  resolvePurchasedSeatsForOwner,
  type OwnerPurchasedSeats,
} from '@/app/api/stripe-webhook/lib/seats';
import {
  listWorkspaceMemberships,
  persistProvenActiveWorkspaceSelection,
  resolveActiveOrganizationId,
} from '@/lib/services/active-workspace-service';
import { requireOrganizationOwner } from '@/lib/services/organization-membership-service';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  ORGANIZATION_DELETION_COOLING_PERIOD_DAYS,
  isMissingOrganizationDeletionColumns,
  organizationDeletionScheduledFor,
} from '@/lib/server/organization-deletion';
import {
  CURRENT_COLLECTION_STATE,
  readOrganizationCollectionState,
  type CollectionState,
} from '@/lib/services/enterprise-collection-state';
import { countActiveLegalHolds } from '@/lib/services/retention-service';

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
});

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .optional(),
  description: z.string().max(500).nullable().optional(),
  website: z.string().url().nullable().optional(),
  billingEmail: z.string().email().nullable().optional(),
  settings: z
    .object({
      allowMemberInvites: z.boolean().optional(),
      requireEmailVerification: z.boolean().optional(),
      defaultRole: z.enum(['member', 'admin', 'viewer']).optional(),
      allowedDomains: z.array(z.string()).optional(),
      enforceSSO: z.boolean().optional(),
      auditLogRetention: z.number().int().min(1).max(365).optional(),
      dataRetention: z.number().int().min(1).max(365).optional(),
    })
    .optional(),
});

const UNSUPPORTED_PATCH_FIELDS = [
  'description',
  'website',
  'billingEmail',
  'settings',
] as const satisfies readonly (keyof z.infer<typeof PatchSchema>)[];

type OrgWithCount = OrganizationRow & { member_count: string; owner_user_id?: string | null };

function buildOrgResponse(
  org: OrgWithCount,
  memberRow: OrganizationMemberRow | undefined,
  access: TeamAdminAccess,
) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: access.plan,
    memberCount: parseInt(org.member_count, 10),
    maxMembers: access.maxMembers,
    seatsConsumed: access.seatsConsumed,
    seatsAvailable: access.seatsAvailable,
    seatSource: access.seatSource,
    ownerUserId: org.owner_user_id ?? null,
    createdAt: org.created_at,
    updatedAt: org.updated_at,
    currentUserRole: memberRow?.role ?? 'member',
  };
}

interface OrganizationDeletionStatus {
  pending: boolean;
  requestedAt: string | null;
  scheduledFor: string | null;
  canCancel: boolean;
}

const NO_PENDING_DELETION: OrganizationDeletionStatus = {
  pending: false,
  requestedAt: null,
  scheduledFor: null,
  canCancel: false,
};

async function fetchCollectionState(
  db: ReturnType<typeof getNeonDb>,
  organizationId: string,
): Promise<CollectionState> {
  try {
    return await readOrganizationCollectionState(db, organizationId);
  } catch (error) {
    logger.error({ error, organizationId }, 'Failed to read organization collection state');
    return CURRENT_COLLECTION_STATE;
  }
}

async function fetchOrganizationDeletionStatus(
  db: ReturnType<typeof getNeonDb>,
  organizationId: string,
): Promise<OrganizationDeletionStatus> {
  try {
    const [row] = await db.query<{
      deletion_requested_at: string | null;
      deletion_scheduled_for: string | null;
    }>(
      `select deletion_requested_at, deletion_scheduled_for
         from public.organizations
        where id = $1`,
      [organizationId],
    );
    const scheduledFor = row?.deletion_scheduled_for ?? null;
    return {
      pending: scheduledFor !== null,
      requestedAt: scheduledFor !== null ? (row?.deletion_requested_at ?? null) : null,
      scheduledFor,
      canCancel: scheduledFor !== null && new Date(scheduledFor).getTime() > Date.now(),
    };
  } catch (error) {
    if (isMissingOrganizationDeletionColumns(error)) return NO_PENDING_DELETION;
    throw error;
  }
}

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const [activeOrganizationId, workspaces] = await Promise.all([
    resolveActiveOrganizationId(db, userId),
    listWorkspaceMemberships(db, userId),
  ]);

  const [membership] = activeOrganizationId
    ? await db.query<OrganizationMemberRow>(
        `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
           from public.organization_members
          where organization_id = $1 and user_id = $2
          limit 1`,
        [activeOrganizationId, userId],
      )
    : [];

  const access = await getTeamAdminAccess(db, userId, membership?.organization_id ?? null);

  if (!membership) {
    return NextResponse.json({
      organization: null,
      activeOrganizationId: null,
      workspaces,
      access,
      deletion: NO_PENDING_DELETION,
      collectionState: null,
    });
  }

  const [org] = await db.query<OrgWithCount>(
    `select o.id, o.name, o.slug, o.created_by, o.created_at, o.updated_at, o.owner_user_id,
            count(m.user_id)::text as member_count
     from public.organizations o
     left join public.organization_members m on m.organization_id = o.id
     where o.id = $1
     group by o.id`,
    [membership.organization_id],
  );

  if (!org) {
    return NextResponse.json({
      organization: null,
      activeOrganizationId: null,
      workspaces,
      access,
      deletion: NO_PENDING_DELETION,
      collectionState: null,
    });
  }

  const [deletion, collectionState] = await Promise.all([
    fetchOrganizationDeletionStatus(db, org.id),
    fetchCollectionState(db, org.id),
  ]);

  return NextResponse.json({
    organization: buildOrgResponse(org, membership, access),
    activeOrganizationId: org.id,
    workspaces,
    access,
    deletion,
    collectionState,
  });
}

async function handleCreate(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);
  const body = await request.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }

  const db = getNeonDb();
  const access = await requireTeamAdminAccess(db, userId);

  const [priorOwnership] = await db.query<OrganizationMemberRow>(
    `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
       from public.organization_members
      where user_id = $1 and role = 'owner'
      order by joined_at asc
      limit 1`,
    [userId],
  );
  if (priorOwnership) {
    throw createError.conflict('You already own a workspace. Switch to it from the account menu.');
  }

  let purchasedSeats: OwnerPurchasedSeats | null;
  try {
    purchasedSeats = await resolvePurchasedSeatsForOwner(db, getStripeClient, userId);
  } catch (error) {
    const reason =
      error instanceof Error && error.message.includes('STRIPE_SECRET_KEY')
        ? 'stripe_not_configured'
        : 'stripe_unreachable';
    logger.error(
      { error, userId, reason },
      'Failed to read purchased seats before creating organization',
    );
    throw createError.serviceUnavailable(
      'Your purchased seats could not be verified. No organization was created; please try again.',
    );
  }

  try {
    const organization = await db.transaction(async (tx) => {
      await tx.query(
        `select pg_advisory_xact_lock(hashtextextended('agi:organization-owner:' || $1, 0))`,
        [userId],
      );

      const [existingOwnership] = await tx.query<OrganizationMemberRow>(
        `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
         from public.organization_members
         where user_id = $1 and role = 'owner'
         order by joined_at asc
         limit 1`,
        [userId],
      );

      if (existingOwnership) {
        throw createError.conflict(
          'You already own a workspace. Switch to it from the account menu.',
        );
      }

      const [created] = await tx.query<OrganizationRow>(
        `insert into public.organizations
           (name, slug, created_by, licensed_seats, billing_plan_tier, seat_billing_updated_at)
         values ($1, $2, $3, $4, $5,
                 case when $5::text is null then null else now() end)
         returning id, name, slug, created_by, created_at, updated_at`,
        [
          parsed.data.name,
          parsed.data.slug,
          userId,
          purchasedSeats?.seats ?? 1,
          purchasedSeats?.planTier ?? null,
        ],
      );

      if (!created) {
        throw createError.conflict('The organization could not be created');
      }

      await tx.execute(
        `insert into public.organization_members
           (organization_id, user_id, role, provisioning_source, provisioned_at, joined_at)
         values ($1, $2, $3, 'manual', now(), now())`,
        [created.id, userId, 'owner'],
      );

      await persistProvenActiveWorkspaceSelection(tx, userId, created.id);

      return created;
    });

    logger.info({ userId, orgId: organization.id }, 'Organization created');

    return NextResponse.json(
      {
        organization: buildOrgResponse(
          { ...organization, member_count: '1', owner_user_id: userId },
          {
            organization_id: organization.id,
            user_id: userId,
            role: 'owner',
            provisioning_source: 'manual',
            provisioned_at: organization.created_at,
            joined_at: organization.created_at,
          },
          access,
        ),
        access,
      },
      { status: 201 },
    );
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (code === '23505' || message.toLowerCase().includes('unique')) {
      throw createError.conflict('That organization slug is already taken');
    }
    throw error;
  }
}

async function handlePatch(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);
  const body = await request.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }
  const updates = parsed.data;
  const unsupportedFields = UNSUPPORTED_PATCH_FIELDS.filter(
    (field) => updates[field] !== undefined,
  );
  if (unsupportedFields.length > 0) {
    throw createError.validation(
      'These organization settings are not available yet and were not saved',
      { unsupportedFields },
    );
  }
  if (updates.name === undefined && updates.slug === undefined) {
    throw createError.validation('Provide an organization name or slug to update');
  }

  const db = getNeonDb();

  const activeOrganizationId = await resolveActiveOrganizationId(db, userId);
  if (!activeOrganizationId) {
    throw createError.notFound('Select a workspace before updating its settings');
  }

  const [membership] = await db.query<OrganizationMemberRow>(
    `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
     from public.organization_members
     where organization_id = $1 and user_id = $2
     limit 1`,
    [activeOrganizationId, userId],
  );

  if (!membership) {
    throw createError.notFound('You are not a member of any organization');
  }

  const access = await requireTeamAdminAccess(db, userId, membership.organization_id);

  if (!isOrganizationAdminRole(membership.role)) {
    throw createError.forbidden('Only owners and admins can update organization settings');
  }

  const setClauses: string[] = ['updated_at = now()'];
  const params: unknown[] = [membership.organization_id];

  if (updates.name !== undefined) {
    params.push(updates.name);
    setClauses.push(`name = $${params.length}`);
  }
  if (updates.slug !== undefined) {
    params.push(updates.slug);
    setClauses.push(`slug = $${params.length}`);
  }

  if (setClauses.length > 1) {
    await db
      .execute(`update public.organizations set ${setClauses.join(', ')} where id = $1`, params)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('unique')) {
          throw createError.conflict('That organization slug is already taken');
        }
        throw err;
      });
  }

  logger.info({ userId, orgId: membership.organization_id }, 'Organization settings updated');

  const [updatedOrg] = await db.query<OrgWithCount>(
    `select o.id, o.name, o.slug, o.created_by, o.created_at, o.updated_at, o.owner_user_id,
            count(m.user_id)::text as member_count
     from public.organizations o
     left join public.organization_members m on m.organization_id = o.id
     where o.id = $1
     group by o.id`,
    [membership.organization_id],
  );

  return NextResponse.json({
    organization: updatedOrg ? buildOrgResponse(updatedOrg, membership, access) : null,
    access,
  });
}

const DeleteSchema = z.object({
  confirm: z.string().trim().min(1).max(120),
});

async function handleDelete(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-delete');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const activeOrganizationId = await resolveActiveOrganizationId(db, userId);
  if (!activeOrganizationId) {
    throw createError.notFound('Select a workspace before deleting it');
  }

  await requireOrganizationOwner(db, userId, activeOrganizationId, 'schedule its deletion');

  const body = await request.json().catch(() => ({}));
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }

  const [org] = await db.query<{ id: string; name: string; slug: string }>(
    `select id, name, slug from public.organizations where id = $1`,
    [activeOrganizationId],
  );
  if (!org) {
    throw createError.notFound('Workspace not found');
  }

  if (parsed.data.confirm !== org.name && parsed.data.confirm !== org.slug) {
    throw createError.validation(
      'Confirmation did not match the workspace name or slug. Nothing was scheduled for deletion.',
    );
  }

  const activeHolds = await countActiveLegalHolds(db, org.id);
  if (activeHolds > 0) {
    throw createError.conflict(
      `This workspace has ${activeHolds} active legal hold${activeHolds === 1 ? '' : 's'}. Release ${activeHolds === 1 ? 'it' : 'every hold'} before deletion can be scheduled.`,
    );
  }

  const existing = await fetchOrganizationDeletionStatus(db, org.id);
  if (existing.pending && existing.canCancel) {
    return NextResponse.json({
      message: `Workspace deletion is already scheduled for ${existing.scheduledFor}.`,
      scheduledFor: existing.scheduledFor,
      coolingPeriodDays: ORGANIZATION_DELETION_COOLING_PERIOD_DAYS,
    });
  }

  const scheduledFor = organizationDeletionScheduledFor();

  try {
    const updated = await db.execute(
      `update public.organizations
          set deletion_requested_at = now(),
              deletion_scheduled_for = $2,
              deletion_requested_by = $3
        where id = $1`,
      [org.id, scheduledFor.toISOString(), userId],
    );
    if (updated === 0) {
      throw createError.notFound('Workspace not found');
    }
  } catch (error) {
    if (isMissingOrganizationDeletionColumns(error)) {
      throw createError.serviceUnavailable(
        'Workspace deletion is not available yet. Please try again later.',
      );
    }
    throw error;
  }

  logger.warn({ userId, orgId: org.id }, 'Workspace deletion scheduled');

  await recordAuditEvent({
    userId,
    eventType: 'organization_deletion_requested',
    request,
    organizationId: org.id,
    severity: 'critical',
    detail: {
      resourceType: 'organization',
      resourceId: org.id,
      resourceName: org.name,
      status: 'scheduled',
    },
  });

  return NextResponse.json({
    message: `Workspace deletion scheduled. Everything in this workspace will be permanently deleted in ${ORGANIZATION_DELETION_COOLING_PERIOD_DAYS} days. Cancel from Settings > Organization any time before then to keep it.`,
    scheduledFor: scheduledFor.toISOString(),
    coolingPeriodDays: ORGANIZATION_DELETION_COOLING_PERIOD_DAYS,
  });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handleCreate);
export const PATCH = withErrorHandler(handlePatch);
export const DELETE = withErrorHandler(handleDelete);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
