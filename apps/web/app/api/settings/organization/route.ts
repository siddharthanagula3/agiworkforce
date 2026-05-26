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

type OrgWithCount = OrganizationRow & { member_count: string };

function buildOrgResponse(org: OrgWithCount, memberRow: OrganizationMemberRow | undefined) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: null,
    description: null,
    website: null,
    billingEmail: null,
    plan: 'free' as const,
    memberCount: parseInt(org.member_count, 10),
    maxMembers: 5,
    createdAt: org.created_at,
    updatedAt: org.updated_at,
    settings: {
      allowMemberInvites: true,
      requireEmailVerification: false,
      defaultRole: 'member' as const,
      allowedDomains: [] as string[],
      enforceSSO: false,
      auditLogRetention: 90,
      dataRetention: 365,
    },
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

  if (!membership) {
    return NextResponse.json({ organization: null });
  }

  const [org] = await db.query<OrgWithCount>(
    `select o.id, o.name, o.slug, o.created_by, o.created_at, o.updated_at,
            count(m.user_id)::text as member_count
     from public.organizations o
     left join public.organization_members m on m.organization_id = o.id
     where o.id = $1
     group by o.id`,
    [membership.organization_id],
  );

  if (!org) {
    return NextResponse.json({ organization: null });
  }

  return NextResponse.json({ organization: buildOrgResponse(org, membership) });
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

  if (!['owner', 'admin'].includes(membership.role)) {
    throw createError.forbidden('Only owners and admins can update organization settings');
  }

  const body = await request.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }

  const updates = parsed.data;
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
    `select o.id, o.name, o.slug, o.created_by, o.created_at, o.updated_at,
            count(m.user_id)::text as member_count
     from public.organizations o
     left join public.organization_members m on m.organization_id = o.id
     where o.id = $1
     group by o.id`,
    [membership.organization_id],
  );

  return NextResponse.json({
    organization: updatedOrg ? buildOrgResponse(updatedOrg, membership) : null,
  });
}

export const GET = withErrorHandler(handleGet);
export const PATCH = withErrorHandler(handlePatch);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
