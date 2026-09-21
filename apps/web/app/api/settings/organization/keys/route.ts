import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readJsonBody } from '@/lib/read-json-body';
import { getNeonDb } from '@/lib/server/neon-db';
import { logAdminDataAccess } from '@/lib/server/admin-data-access';
import { readIdempotencyKey, withIdempotentWrite } from '@/lib/server/idempotency';
import { isOrganizationUnderActiveLegalHold } from '@/lib/server/organization-erasure';
import { requireStepUp } from '@/lib/server/step-up-auth';
import { CMEK_PROVIDER_IDS, type CmekKeyDescriptor } from '@/lib/crypto/cmek';
import {
  provisionOrganizationKey,
  readKeyRewrapRun,
  readOrganizationKeyRecord,
  readOrganizationKeyStatus,
  replaceOrganizationKey,
  revokeOrganizationKey,
  rotateOrganizationKey,
  validateOrganizationKeySetup,
  type KeyRewrapRun,
  type OrganizationKeyStatus,
} from '@/lib/server/organization-encryption-keys';
import {
  KEYS_ENDPOINT,
  nextKeyVersion,
  mayRevokeKey,
  requireKeyManagement,
  requireKeyOwner,
  requireProviderClient,
} from './keys-access';

export const runtime = 'nodejs';

const MAX_KEY_URI_LENGTH = 2048;

const DescriptorSchema = z
  .object({
    provider: z.enum(CMEK_PROVIDER_IDS),
    keyUri: z.string().trim().min(1).max(MAX_KEY_URI_LENGTH),
    region: z.string().trim().min(1).max(64),
  })
  .strict();

const ProvisionSchema = DescriptorSchema.strict();

const ChangeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rotate') }).strict(),
  z
    .object({
      action: z.literal('replace'),
      provider: z.enum(CMEK_PROVIDER_IDS),
      keyUri: z.string().trim().min(1).max(MAX_KEY_URI_LENGTH),
      region: z.string().trim().min(1).max(64),
    })
    .strict(),
]);

const RevokeSchema = z.object({ reason: z.string().trim().min(1).max(2000) }).strict();

export interface OrganizationKeysResponse {
  organizationId: string;
  status: OrganizationKeyStatus;
  activeVersion: string | null;
  retiredVersions: string[];
  rewrapRuns: KeyRewrapRun[];
  canRevoke: boolean;
}

function descriptorOf(input: z.infer<typeof DescriptorSchema>): CmekKeyDescriptor {
  return { provider: input.provider, keyUri: input.keyUri, region: input.region };
}

/** Every refusal the setup validator found, so a customer can fix the grant. */
function refuseFailedSetup(checks: readonly { id: string; detail: string | null }[]): never {
  throw createError
    .validation(
      'This key could not be used. ' +
        checks.map((check) => `${check.id}: ${check.detail ?? 'failed'}`).join('; '),
    )
    .asUserSafe();
}

async function assertKeyUsable(
  db: Parameters<typeof validateOrganizationKeySetup>[0],
  organizationId: string,
  descriptor: CmekKeyDescriptor,
): Promise<void> {
  const validation = await validateOrganizationKeySetup(db, organizationId, descriptor);
  if (validation.ok) return;
  refuseFailedSetup(validation.checks.filter((check) => check.state === 'fail'));
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId, access } = await requireKeyManagement(
    request,
    'admin.policy.view',
    'Your workspace role does not allow viewing this workspace encryption key.',
  );

  const [status, record] = await Promise.all([
    readOrganizationKeyStatus(db, organizationId),
    readOrganizationKeyRecord(db, organizationId),
  ]);
  const retiredVersions = record ? record.retired.map((key) => key.version) : [];
  const rewrapRuns = (
    await Promise.all(
      retiredVersions.map((version) => readKeyRewrapRun(db, organizationId, version)),
    )
  ).filter((run): run is KeyRewrapRun => run !== null);

  await logAdminDataAccess(request, {
    userId,
    organizationId,
    role: access.role,
    resourceType: 'encryption_key',
    count: retiredVersions.length,
  });

  const payload: OrganizationKeysResponse = {
    organizationId,
    status,
    activeVersion: record?.active.version ?? null,
    retiredVersions,
    rewrapRuns,
    canRevoke: await mayRevokeKey(access),
  };
  return NextResponse.json(payload);
}

async function handleProvision(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-keys-write');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await requireKeyManagement(
    request,
    'admin.policy.manage',
    'Your workspace role does not allow managing this workspace encryption key.',
  );

  const idempotencyKey = readIdempotencyKey(request);
  const parsed = ProvisionSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid encryption key', parsed.error.issues);
  }

  // Enrolling over an existing association would drop the version the previous
  // key sealed under without a rewrap, which no rotation is allowed to do.
  const existing = await readOrganizationKeyRecord(db, organizationId);
  if (existing) {
    throw createError
      .conflict(
        'This workspace already manages a key. Rotate it, or replace it with a different key, ' +
          'so the version it sealed under stays readable until a rewrap moves the data.',
      )
      .asUserSafe();
  }

  const descriptor = descriptorOf(parsed.data);
  await assertKeyUsable(db, organizationId, descriptor);

  const provision = async () => {
    const result = await provisionOrganizationKey({
      db: getNeonDb(),
      organizationId,
      actorUserId: userId,
      descriptor,
      provider: requireProviderClient(descriptor),
      keyVersion: nextKeyVersion(null),
    });
    return { replayed: false, status: 201, body: { keyVersion: result.keyVersion } };
  };

  if (idempotencyKey === null) {
    const created = await provision();
    return NextResponse.json(created.body, { status: created.status });
  }

  const result = await withIdempotentWrite<{ keyVersion: string }>(
    db,
    {
      organizationId,
      scope: 'organization-encryption-key:provision',
      actorId: userId,
      key: idempotencyKey,
      requestBody: descriptor,
    },
    provision,
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Idempotency-Replayed': result.replayed ? 'true' : 'false' },
  });
}

async function handleChange(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-keys-write');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await requireKeyManagement(
    request,
    'admin.policy.manage',
    'Your workspace role does not allow managing this workspace encryption key.',
  );

  const idempotencyKey = readIdempotencyKey(request);
  const parsed = ChangeSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid encryption key change', parsed.error.issues);
  }

  const record = await readOrganizationKeyRecord(db, organizationId);
  if (!record) {
    throw createError
      .notFound('This workspace manages no key of its own, so there is nothing to change.')
      .asUserSafe();
  }

  // Both ids are written out rather than chosen into one call: the registry
  // coverage test reads the literal, and a proof is bound to one action.
  const proof = {
    userId,
    resourceId: record.active.version,
    organizationId,
    request,
    endpoint: KEYS_ENDPOINT,
  };
  await (parsed.data.action === 'replace'
    ? requireStepUp({ ...proof, action: 'encryption_key.replace' })
    : requireStepUp({ ...proof, action: 'encryption_key.rotate' }));

  const descriptor =
    parsed.data.action === 'replace' ? descriptorOf(parsed.data) : record.descriptor;
  if (parsed.data.action === 'replace') {
    await assertKeyUsable(db, organizationId, descriptor);
  }
  const keyVersion = nextKeyVersion(record);

  const change = async () => {
    const shared = {
      db: getNeonDb(),
      organizationId,
      actorUserId: userId,
      descriptor,
      provider: requireProviderClient(descriptor),
      keyVersion,
      record,
    };
    if (parsed.data.action === 'replace') {
      const replaced = await replaceOrganizationKey(shared);
      return {
        replayed: false,
        status: 200,
        body: {
          keyVersion: replaced.keyVersion,
          retiredVersions: [replaced.previousVersion, ...record.retired.map((key) => key.version)],
        },
      };
    }
    const rotated = await rotateOrganizationKey(shared);
    return {
      replayed: false,
      status: 200,
      body: { keyVersion: rotated.keyVersion, retiredVersions: rotated.retiredVersions },
    };
  };

  if (idempotencyKey === null) {
    const changed = await change();
    return NextResponse.json(changed.body, { status: changed.status });
  }

  const result = await withIdempotentWrite<{ keyVersion: string; retiredVersions: string[] }>(
    db,
    {
      organizationId,
      scope: `organization-encryption-key:${parsed.data.action}`,
      actorId: userId,
      key: idempotencyKey,
      // The version the change moves off, so a retry that arrives after the
      // rotation landed replays it rather than minting a second version.
      requestBody: { action: parsed.data.action, descriptor, from: record.active.version },
    },
    change,
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Idempotency-Replayed': result.replayed ? 'true' : 'false' },
  });
}

async function handleRevoke(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-keys-revoke');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, organizationId } = await requireKeyOwner(request);

  const parsed = RevokeSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid revocation', parsed.error.issues);
  }

  // A hold refuses the transition that makes held data permanently
  // unrecoverable, and for everything sealed under this key that is what a
  // revocation is. The check fails closed on an unreadable hold set.
  const hold = await isOrganizationUnderActiveLegalHold(organizationId);
  if (hold.held) {
    throw createError
      .conflict(
        'This workspace is under a legal hold, and revoking the key would make the held data ' +
          'unreadable. Release the hold first.',
      )
      .asUserSafe();
  }

  await requireStepUp({
    userId,
    action: 'encryption_key.revoke',
    resourceId: organizationId,
    organizationId,
    request,
    endpoint: KEYS_ENDPOINT,
  });

  const revoked = await revokeOrganizationKey({
    db: getNeonDb(),
    organizationId,
    actorUserId: userId,
    reason: parsed.data.reason,
  });

  if (!revoked.revoked) {
    throw createError
      .notFound('This workspace has no active key of its own to revoke.')
      .asUserSafe();
  }

  return NextResponse.json({ revoked: true, endpoint: KEYS_ENDPOINT });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handleProvision);
export const PUT = withErrorHandler(handleChange);
export const DELETE = withErrorHandler(handleRevoke);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
