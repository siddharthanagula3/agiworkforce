import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { assertAccountActive } from '@/lib/api-auth';
import { isAppError } from '@/lib/errors';
import { remoteControlStandingRefusal } from '@/lib/feature-flags/remote-control-gate';
import { logger } from '@/lib/logger';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { getNeonDb } from '@/lib/server/neon-db';

import { pairedDevicesSignedIn } from './device-registry';

const WORKSPACE_SELECTOR_MAX_LENGTH = 100;
const MAX_PAIRINGS_PER_CHECK = 100;
const SERVER_ERROR_STATUS = 500;

/**
 * The workspace a pairing was created under, as the creating request selected
 * it. The relay hands it back on every recheck so the policy asked later is the
 * policy of the same workspace, not whichever one the account has active then.
 */
export function readPairingWorkspaceSelector(request: Pick<Request, 'headers'>): {
  workspaceSelector?: string;
} {
  const selector = request.headers.get(MANAGED_CLOUD_ORGANIZATION_HEADER)?.trim();
  return selector && selector.length <= WORKSPACE_SELECTOR_MAX_LENGTH
    ? { workspaceSelector: selector }
    : {};
}

export const pairingStandingRequestSchema = z
  .object({
    pairings: z
      .array(
        z
          .object({
            code: z.string().regex(/^[A-Z0-9]{12}$/),
            userId: z.string().min(1).max(255),
            deviceIds: z.array(z.uuid()).max(2),
            workspace: z.string().min(1).max(WORKSPACE_SELECTOR_MAX_LENGTH).nullable(),
          })
          .strict(),
      )
      .max(MAX_PAIRINGS_PER_CHECK),
  })
  .strict();

export type PairingStandingQuery = z.infer<typeof pairingStandingRequestSchema>['pairings'][number];

export type PairingStanding = 'active' | 'ended' | 'unknown';

export interface PairingStandingResult {
  code: string;
  standing: PairingStanding;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** The relay is the only caller: it holds the secret the pairing routes send it. */
export function isRelayCaller(request: Pick<Request, 'headers'>): boolean {
  const secret = process.env['SIGNALING_INTERNAL_SECRET'];
  const header = request.headers.get('authorization');
  if (!secret || !header?.startsWith('Bearer ')) return false;
  return timingSafeEqual(digest(header.slice('Bearer '.length)), digest(secret));
}

async function accountStanding(
  db: DatabaseAdapter,
  userId: string,
  request: NextRequest,
): Promise<PairingStanding> {
  try {
    await assertAccountActive(userId, request);
  } catch (error) {
    return isAppError(error) && error.statusCode < SERVER_ERROR_STATUS ? 'ended' : 'unknown';
  }
  const refusal = await remoteControlStandingRefusal(db, userId, request, 'unknown');
  if (!refusal) return 'active';
  return refusal.final ? 'ended' : 'unknown';
}

/**
 * Whether each live pairing may continue. The account, the workspace policy,
 * the plan and the switch are asked once per account and workspace in a batch;
 * the devices are asked per pairing. Anything that cannot be read is `unknown`,
 * which the relay holds rather than ends.
 */
export async function evaluatePairingStanding(
  pairings: readonly PairingStandingQuery[],
  requestUrl: string,
): Promise<PairingStandingResult[]> {
  const service = getNeonDb();
  const byAccount = new Map<string, Promise<PairingStanding>>();
  return Promise.all(
    pairings.map(async (pairing): Promise<PairingStandingResult> => {
      const scoped = createClaimedUserScopedDb(service, {
        userId: pairing.userId,
        organizationId: null,
      });
      const accountKey = `${pairing.userId}\u0000${pairing.workspace ?? ''}`;
      let account = byAccount.get(accountKey);
      if (!account) {
        const request = new NextRequest(requestUrl, {
          headers: pairing.workspace
            ? { [MANAGED_CLOUD_ORGANIZATION_HEADER]: pairing.workspace }
            : {},
        });
        account = accountStanding(scoped, pairing.userId, request).catch((error: unknown) => {
          logger.error({ error }, '[pairing-standing] account standing unreadable');
          return 'unknown' as const;
        });
        byAccount.set(accountKey, account);
      }
      const standing = await account;
      if (standing !== 'active') return { code: pairing.code, standing };
      try {
        const signedIn = await pairedDevicesSignedIn(scoped, pairing.userId, pairing.deviceIds);
        return { code: pairing.code, standing: signedIn ? 'active' : 'ended' };
      } catch (error) {
        logger.error({ error }, '[pairing-standing] paired devices unreadable');
        return { code: pairing.code, standing: 'unknown' };
      }
    }),
  );
}
