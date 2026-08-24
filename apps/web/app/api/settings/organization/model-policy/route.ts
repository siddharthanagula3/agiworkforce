import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listCanonicalModels, isModelLive, type Provider } from '@agiworkforce/types';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  isOrgAdminRole,
  requireOrgMember,
  resolveOrgMembership,
} from '@/lib/services/org-sharing-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import {
  diffModelPolicy,
  MODEL_POLICY_LIMITS,
  readModelPolicy,
  upsertModelPolicy,
  type OrganizationModelPolicy,
} from '@/lib/services/model-policy-service';

export const runtime = 'nodejs';

/**
 * The catalog is the only source of model ids.
 *
 * Enumerating them here rather than accepting free text means an administrator
 * cannot save a typo that silently governs nothing, and no model id is ever
 * written down in this file. Blocked ids from a retired model stay in the
 * stored policy — the table deliberately has no foreign key — but they cannot
 * be newly added once the catalog drops them.
 */
function catalogChoices(): {
  models: { id: string; name: string; provider: string; live: boolean }[];
  providers: string[];
} {
  const models = listCanonicalModels()
    .map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      provider: String(model.provider),
      live: isModelLive(model),
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));

  return { models, providers: [...new Set(models.map((m) => m.provider))].sort() };
}

const PolicyPutSchema = z
  .object({
    allowedProviders: z.array(z.string().min(1).max(64)).max(MODEL_POLICY_LIMITS.providers),
    blockedProviders: z.array(z.string().min(1).max(64)).max(MODEL_POLICY_LIMITS.providers),
    allowedModels: z.array(z.string().min(1).max(200)).max(MODEL_POLICY_LIMITS.models),
    blockedModels: z.array(z.string().min(1).max(200)).max(MODEL_POLICY_LIMITS.models),
  })
  .strict();

export interface ModelPolicyResponse {
  organizationId: string;
  configured: boolean;
  canManagePolicy: boolean;
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  policy: {
    allowedProviders: string[];
    blockedProviders: string[];
    allowedModels: string[];
    blockedModels: string[];
    updatedAt: string | null;
  };
  catalog: ReturnType<typeof catalogChoices>;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()))].filter(Boolean);
}

/**
 * A model in both lists is an administrator contradicting themselves. The
 * evaluator resolves it — deny wins — but saving it silently would leave a
 * console showing a model as approved that members cannot use.
 */
function assertNoContradiction(input: z.infer<typeof PolicyPutSchema>): void {
  const modelOverlap = input.allowedModels.filter((m) =>
    input.blockedModels.some((b) => b.toLowerCase() === m.toLowerCase()),
  );
  if (modelOverlap.length > 0) {
    throw createError.validation(
      `A model cannot be both approved and blocked: ${modelOverlap.join(', ')}.`,
    );
  }

  const providerOverlap = input.allowedProviders.filter((p) =>
    input.blockedProviders.some((b) => b.toLowerCase() === p.toLowerCase()),
  );
  if (providerOverlap.length > 0) {
    throw createError.validation(
      `A provider cannot be both approved and blocked: ${providerOverlap.join(', ')}.`,
    );
  }
}

function present(
  organizationId: string,
  role: 'owner' | 'admin' | 'member' | 'viewer',
  policy: OrganizationModelPolicy | null,
): ModelPolicyResponse {
  return {
    organizationId,
    configured: policy !== null,
    canManagePolicy: isOrgAdminRole(role),
    currentUserRole: role,
    policy: {
      allowedProviders: policy?.allowedProviders ?? [],
      blockedProviders: policy?.blockedProviders ?? [],
      allowedModels: policy?.allowedModels ?? [],
      blockedModels: policy?.blockedModels ?? [],
      updatedAt: policy?.updatedAt ?? null,
    },
    catalog: catalogChoices(),
  };
}

/**
 * Readable by any member, not only admins.
 *
 * A member's client needs the policy to explain why a model is unavailable.
 * Withholding it produces a picker that silently omits models with no reason
 * given, which reads as a broken product rather than as governance.
 */
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  const policy = await readModelPolicy(db, membership.organizationId);
  return NextResponse.json(present(membership.organizationId, membership.role, policy));
}

async function handlePut(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  if (!isOrgAdminRole(membership.role)) {
    throw createError.forbidden(
      'Only an organization owner or admin can change which models this workspace permits.',
    );
  }

  const parsed = PolicyPutSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid model policy', parsed.error.issues);
  }
  assertNoContradiction(parsed.data);

  const catalog = catalogChoices();
  const knownModels = new Set(catalog.models.map((m) => m.id.toLowerCase()));
  const knownProviders = new Set(catalog.providers.map((p) => p.toLowerCase()));

  const input = {
    allowedProviders: dedupe(parsed.data.allowedProviders) as Provider[],
    blockedProviders: dedupe(parsed.data.blockedProviders) as Provider[],
    allowedModels: dedupe(parsed.data.allowedModels),
    blockedModels: dedupe(parsed.data.blockedModels),
  };

  // An id the catalog does not know governs nothing, so accepting it would
  // leave an administrator believing they had restricted something.
  const unknownModels = [...input.allowedModels, ...input.blockedModels].filter(
    (id) => !knownModels.has(id),
  );
  if (unknownModels.length > 0) {
    throw createError.validation(
      `These models are not in the catalog, so a rule naming them would govern nothing: ${unknownModels.join(', ')}.`,
    );
  }
  const unknownProviders = [...input.allowedProviders, ...input.blockedProviders].filter(
    (id) => !knownProviders.has(id.toLowerCase()),
  );
  if (unknownProviders.length > 0) {
    throw createError.validation(
      `These providers are not in the catalog: ${unknownProviders.join(', ')}.`,
    );
  }

  const before = await readModelPolicy(db, membership.organizationId);
  // Writes use the privileged connection: app_rls has SELECT only (0139), so a
  // workspace cannot rewrite its own restrictions from a member session.
  const policy = await upsertModelPolicy(getNeonDb(), membership.organizationId, input, userId);
  const changed = diffModelPolicy(before, policy);

  await recordAuditEvent({
    userId,
    eventType: 'admin_policy_changed',
    organizationId: membership.organizationId,
    request,
    outcome: 'success',
    severity: 'warning',
    detail: {
      resourceType: 'organization_model_policy',
      resourceId: membership.organizationId,
      role: membership.role,
      status: before ? 'updated' : 'created',
      changedKeys: changed,
    },
  });

  return NextResponse.json(present(membership.organizationId, membership.role, policy));
}

export const GET = withErrorHandler(handleGet);
export const PUT = withErrorHandler(handlePut);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
