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
import { resolvePurchasedSeatsForOwner } from '@/lib/server/purchased-seats';
import type { OrganizationRow, OrganizationMemberRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';
import {
  getTeamAdminAccess,
  requireTeamAdminAccess,
  type TeamAdminAccess,
} from '@/app/api/settings/team/team-admin-access';

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
    // Backed by `organizations.licensed_seats` when an organization is in
    // scope (0085); null only when no organization was named.
    maxMembers: access.maxMembers,
    seatsConsumed: access.seatsConsumed,
    seatsAvailable: access.seatsAvailable,
    seatSource: access.seatSource,
    // Derived by trigger from organization_members, so it can never disagree
    // with the membership table.
    ownerUserId: org.owner_user_id ?? null,
    createdAt: org.created_at,
    updatedAt: org.updated_at,
    currentUserRole: memberRow?.role ?? 'member',
  };
}

/**
 * GET /api/settings/organization
 * Return the organization the current user belongs to (first match).
 */
async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  // Find the organization the user is a member of.
  const [membership] = await db.query<OrganizationMemberRow>(
    `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
     from public.organization_members
     where user_id = $1
     order by joined_at asc
     limit 1`,
    [userId],
  );

  // Seat state is only meaningful for an organization in scope, so the
  // capability is resolved AFTER membership rather than before it.
  const access = await getTeamAdminAccess(db, userId, membership?.organization_id ?? null);

  if (!membership) {
    return NextResponse.json({ organization: null, access });
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
    return NextResponse.json({ organization: null, access });
  }

  return NextResponse.json({
    organization: buildOrgResponse(org, membership, access),
    access,
  });
}

/**
 * POST /api/settings/organization
 * Provision the current Team/Enterprise user into their one supported
 * organization and atomically make them its owner.
 */
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

  // Seats are bought before the organization exists, so the webhook's
  // owner-matched seat write found no row and reported `no_organization`.
  // Recover the paid-for count here, or every Team customer lands on migration
  // 0085's `licensed_seats default 1` and is told to buy seats they already
  // own. Resolved OUTSIDE the transaction: it makes a Stripe call, and holding
  // an advisory lock across a network round trip serializes org creation behind
  // Stripe's latency. Null on any failure — see resolvePurchasedSeatsForOwner.
  const purchasedSeats = await resolvePurchasedSeatsForOwner(db, userId);

  try {
    const organization = await db.transaction(async (tx) => {
      // Serialize provisioning by user so concurrent create requests cannot
      // both pass the single-organization membership check.
      await tx.query(
        `select pg_advisory_xact_lock(hashtextextended('agi:organization-owner:' || $1, 0))`,
        [userId],
      );

      const [existingMembership] = await tx.query<OrganizationMemberRow>(
        `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
         from public.organization_members
         where user_id = $1
         order by joined_at asc
         limit 1`,
        [userId],
      );

      if (existingMembership) {
        throw createError.conflict('You already belong to an organization');
      }

      const [created] = purchasedSeats
        ? await tx.query<OrganizationRow>(
            `insert into public.organizations
               (name, slug, created_by, licensed_seats, billing_plan_tier,
                stripe_subscription_id, stripe_customer_id, seat_billing_updated_at)
             values ($1, $2, $3, $4, $5, $6, $7, now())
             returning id, name, slug, created_by, created_at, updated_at`,
            [
              parsed.data.name,
              parsed.data.slug,
              userId,
              purchasedSeats.seats,
              purchasedSeats.planTier,
              purchasedSeats.stripeSubscriptionId,
              purchasedSeats.stripeCustomerId,
            ],
          )
        : await tx.query<OrganizationRow>(
            `insert into public.organizations (name, slug, created_by)
             values ($1, $2, $3)
             returning id, name, slug, created_by, created_at, updated_at`,
            [parsed.data.name, parsed.data.slug, userId],
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

      return created;
    });

    logger.info({ userId, orgId: organization.id }, 'Organization created');

    return NextResponse.json(
      {
        organization: buildOrgResponse(
          // The owner membership row inserted above is what the 0085 trigger
          // derives `organizations.owner_user_id` from, so reporting the
          // creator here matches what a re-read returns.
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

/**
 * PATCH /api/settings/organization
 * Update organization settings. Only owners and admins may update.
 */
async function handlePatch(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  await requireTeamAdminAccess(db, userId);

  // Verify the user has an admin/owner role.
  const [membership] = await db.query<OrganizationMemberRow>(
    `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
     from public.organization_members
     where user_id = $1
     order by joined_at asc
     limit 1`,
    [userId],
  );

  if (!membership) {
    throw createError.notFound('You are not a member of any organization');
  }

  // Re-resolve with the organization in scope so the response carries this
  // org's real licensed seat state rather than the no-org placeholder.
  const access = await requireTeamAdminAccess(db, userId, membership.organization_id);

  if (!['owner', 'admin'].includes(membership.role)) {
    throw createError.forbidden('Only owners and admins can update organization settings');
  }

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

  // Return the updated organization.
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

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handleCreate);
export const PATCH = withErrorHandler(handlePatch);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
