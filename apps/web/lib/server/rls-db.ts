import 'server-only';

import type { NextRequest } from 'next/server';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
import { createDatabaseClient, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { auth } from '@clerk/nextjs/server';
import { createError } from '@/lib/errors';
import { assertAccountActive, getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  resolveActiveOrganizationId,
  resolveOrganizationMembershipId,
} from '@/lib/services/active-workspace-service';

let rlsDb: DatabaseAdapter | null = null;

function getRlsCapableDb(): DatabaseAdapter {
  if (!rlsDb) {
    rlsDb = createDatabaseClient({
      provider: 'neon',
      applicationName: 'agi-web-rls',
      unsafeAllowUnverifiedJwtSubject: true,
    });
  }
  return rlsDb;
}

export interface UserScopedDb {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
}

export const ACTIVE_ORG_HEADER = MANAGED_CLOUD_ORGANIZATION_HEADER;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readExplicitActiveOrgId(request: NextRequest): string | null | undefined {
  const raw = request.headers.get(ACTIVE_ORG_HEADER)?.trim();
  if (!raw) return undefined;
  return UUID_RE.test(raw) ? raw : null;
}

async function resolveRequestOrganizationId(
  request: NextRequest,
  userId: string,
): Promise<string | null> {
  const explicit = readExplicitActiveOrgId(request);
  if (explicit !== undefined) {
    return explicit ? resolveOrganizationMembershipId(getNeonDb(), userId, explicit) : null;
  }
  return resolveActiveOrganizationId(getNeonDb(), userId);
}

export async function getUserScopedDb(request: NextRequest): Promise<UserScopedDb> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token.startsWith('sk_live_') || token.startsWith('sk_test_')) {
      throw createError.unauthorized();
    }
    const { userId } = await getClerkAuthUser(request);
    const organizationId = await resolveRequestOrganizationId(request, userId);
    return {
      db: getRlsCapableDb().withUser(token).withOrg(organizationId),
      userId,
      organizationId,
    };
  }

  const { userId, getToken } = await auth();
  if (userId) {
    const token = await getToken();
    if (token) {
      await assertAccountActive(userId);
      const organizationId = await resolveRequestOrganizationId(request, userId);
      return {
        db: getRlsCapableDb().withUser(token).withOrg(organizationId),
        userId,
        organizationId,
      };
    }
  }

  throw createError.unauthorized();
}
