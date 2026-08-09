import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rate-limit';
import { logSecurityEvent } from '@/lib/security-audit';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import type { SSOConnectionRow } from '@/lib/server/neon-types';
import { SSO_CONNECTION_SELECT_COLUMNS, toConnectionView } from '@/lib/server/sso/connection-view';
import {
  domainVerificationInstructions,
  issueDomainVerificationToken,
  verifyDomainOwnership,
} from '@/lib/server/sso/domain-verification';
import {
  authorizeSSORequest,
  requireOrgRole,
  ssoErrorResponse,
} from '@/lib/server/sso/sso-route-guard';

/**
 * Prove the organization controls the email domain its SSO connection claims.
 *
 * POST /api/admin/sso/verify-domain  { connectionId }            - run the check
 * PUT  /api/admin/sso/verify-domain  { connectionId }            - reissue the challenge
 *
 * This deployment creates instance-level Clerk enterprise connections, which
 * route every sign-in whose email domain matches. Without this check, an org
 * owner could claim a domain they do not control and capture its users'
 * authentication. Verification is therefore a hard precondition of activation,
 * enforced here, in PATCH /api/admin/sso/[id], and by a database constraint.
 */

export const runtime = 'nodejs';

const ENDPOINT = '/api/admin/sso/verify-domain';

const BodySchema = z.object({ connectionId: z.string().uuid() }).strict();

async function loadOwnedConnection(
  request: NextRequest,
  body: unknown,
): Promise<
  | { error: Response }
  | {
      error?: never;
      principal: NonNullable<Awaited<ReturnType<typeof authorizeSSORequest>>['principal']>;
      row: SSOConnectionRow;
    }
> {
  const { principal, response } = await authorizeSSORequest(request, ENDPOINT);
  if (!principal) return { error: response };

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      error: NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      ),
    };
  }

  // Both reads below talk to the database, and both run before either handler's
  // try block. Left bare, a Neon outage or an unmigrated `sso_connections`
  // relation escapes as an unhandled rejection — the caller sees a bare
  // framework 500 and the operator gets no log line. Route them through the
  // same mapping every other SSO handler uses so infrastructure failure is
  // reported as infrastructure failure (503 when the database is unreachable),
  // never as a benign "not verified" or a disabled-SSO shrug.
  try {
    const rows = await principal.db.query<SSOConnectionRow>(
      `select ${SSO_CONNECTION_SELECT_COLUMNS} from sso_connections where id = $1 limit 1`,
      [parsed.data.connectionId],
    );

    const row = rows[0];
    if (!row) {
      return { error: NextResponse.json({ error: 'SSO connection not found' }, { status: 404 }) };
    }

    const forbidden = await requireOrgRole(
      principal,
      row.organization_id,
      ['owner'],
      ENDPOINT,
      'verify-sso-domain',
    );
    if (forbidden) return { error: forbidden };

    return { principal, row };
  } catch (error) {
    return {
      error: ssoErrorResponse(error, {
        userId: principal.userId,
        connectionId: parsed.data.connectionId,
        endpoint: ENDPOINT,
        action: 'load-sso-connection',
      }),
    };
  }
}

async function readJson(request: NextRequest): Promise<unknown | symbol> {
  try {
    return await request.json();
  } catch {
    return Symbol.for('invalid-json');
  }
}

const INVALID_JSON = Symbol.for('invalid-json');

/**
 * POST — check DNS for the challenge record and mark the domain verified.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'api-key-create');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const body = await readJson(request);
  if (body === INVALID_JSON) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const loaded = await loadOwnedConnection(request, body);
  if (loaded.error) return loaded.error;

  const { principal, row } = loaded;

  try {
    if (row.domain_verified_at) {
      return NextResponse.json({
        verified: true,
        connection: toConnectionView(row),
        message: `Domain "${row.domain}" is already verified.`,
      });
    }

    if (!row.domain_verification_token) {
      return NextResponse.json(
        {
          error:
            'This connection has no verification challenge. Reissue one with PUT /api/admin/sso/verify-domain.',
          code: 'NO_CHALLENGE',
        },
        { status: 409 },
      );
    }

    const outcome = await verifyDomainOwnership(row.domain, row.domain_verification_token);

    if (!outcome.verified) {
      await logSecurityEvent({
        userId: principal.userId,
        eventType: 'authorization_failed',
        severity: 'low',
        endpoint: ENDPOINT,
        details: {
          action: 'sso-domain-verification-failed',
          connectionId: row.id,
          organization_id: row.organization_id,
          domain: row.domain,
          reason: outcome.reason,
        },
      });

      const status = outcome.reason === 'lookup_failed' ? 503 : 409;
      const message =
        outcome.reason === 'lookup_failed'
          ? 'The DNS lookup failed. This is a resolver problem, not a missing record — retry shortly.'
          : outcome.reason === 'token_mismatch'
            ? 'A verification record exists but its value does not match this connection’s challenge.'
            : 'The verification TXT record was not found. DNS changes can take several minutes to propagate.';

      return NextResponse.json(
        {
          verified: false,
          reason: outcome.reason,
          error: message,
          domainVerification: domainVerificationInstructions(
            row.domain,
            row.domain_verification_token,
          ),
        },
        { status },
      );
    }

    // Clear the token on success: the challenge has served its purpose and a
    // published record should not stay valid for a future re-claim.
    //
    // Exclusivity is enforced HERE, not at draft creation. 0092 replaced the
    // global unique index on lower(domain) with a partial one over verified
    // rows, because a global reservation let any tenant permanently squat a
    // domain it did not own. The consequence is that the uniqueness collision
    // now surfaces at this moment instead, so it must be handled: two tenants
    // can hold drafts for one domain, and the loser of a verification race
    // deserves a 409, not an unhandled 500.
    let updated: SSOConnectionRow[];
    try {
      updated = await principal.db.query<SSOConnectionRow>(
        `update sso_connections
           set domain_verified_at = now(), domain_verification_token = null
         where id = $1
         returning ${SSO_CONNECTION_SELECT_COLUMNS}`,
        [row.id],
      );
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23505') {
        return NextResponse.json(
          {
            error: `Domain "${row.domain}" has already been verified by another organization. If you believe this is your domain, contact support.`,
          },
          { status: 409 },
        );
      }
      throw err;
    }

    const result = updated[0] ?? row;

    logger.info(
      { userId: principal.userId, connectionId: row.id, domain: row.domain },
      'SSO domain ownership verified',
    );

    await logSecurityEvent({
      userId: principal.userId,
      eventType: 'admin_action',
      severity: 'medium',
      endpoint: ENDPOINT,
      details: {
        action: 'sso-domain-verified',
        connectionId: row.id,
        organization_id: row.organization_id,
        domain: row.domain,
      },
    });

    return NextResponse.json({
      verified: true,
      connection: toConnectionView(result),
      nextStep: 'configure_and_activate',
    });
  } catch (error) {
    return ssoErrorResponse(error, {
      userId: principal.userId,
      connectionId: row.id,
      method: 'POST',
    });
  }
}

/**
 * PUT — issue a fresh challenge. Also the way to re-verify a domain whose
 * ownership needs re-proving, which deactivates the connection until it passes.
 */
export async function PUT(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'api-key-create');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const body = await readJson(request);
  if (body === INVALID_JSON) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const loaded = await loadOwnedConnection(request, body);
  if (loaded.error) return loaded.error;

  const { principal, row } = loaded;

  try {
    if (row.is_active) {
      return NextResponse.json(
        {
          error:
            'Deactivate this connection before reissuing a domain challenge, so sign-in is never routed to an IdP whose domain claim is being re-proved.',
          code: 'CONNECTION_ACTIVE',
        },
        { status: 409 },
      );
    }

    const token = issueDomainVerificationToken();

    const updated = await principal.db.query<SSOConnectionRow>(
      `update sso_connections
         set domain_verification_token = $2, domain_verified_at = null
       where id = $1
       returning ${SSO_CONNECTION_SELECT_COLUMNS}`,
      [row.id, token],
    );

    const result = updated[0];
    if (!result) {
      return ssoErrorResponse(new Error('challenge update returned no row'), {
        userId: principal.userId,
        connectionId: row.id,
      });
    }

    await logSecurityEvent({
      userId: principal.userId,
      eventType: 'admin_action',
      severity: 'low',
      endpoint: ENDPOINT,
      details: {
        action: 'sso-domain-challenge-issued',
        connectionId: row.id,
        organization_id: row.organization_id,
        domain: row.domain,
      },
    });

    return NextResponse.json({
      connection: toConnectionView(result),
      domainVerification: domainVerificationInstructions(row.domain, token),
    });
  } catch (error) {
    return ssoErrorResponse(error, {
      userId: principal.userId,
      connectionId: row.id,
      method: 'PUT',
    });
  }
}
