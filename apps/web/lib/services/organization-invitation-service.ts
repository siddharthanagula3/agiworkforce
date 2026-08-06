/**
 * @file organization-invitation-service.ts
 *
 * Member lifecycle for organizations: invite → accept | decline | revoke |
 * expire, plus resend.
 *
 * # Honest scope: no email is sent
 *
 * This repo has NO transactional email provider (verified: no resend /
 * sendgrid / postmark / nodemailer dependency in apps/web/package.json;
 * apps/web/app/api/user/delete-account/route.ts documents the same absence).
 * An invitation therefore persists a row and returns a one-time link the
 * inviter copies and delivers themselves. No response string in this module or
 * its routes claims an email was queued or sent. Delivery is a tracked gap.
 *
 * # Token handling
 *
 * A 32-byte random token is generated, returned exactly once, and stored only
 * as its sha256 hex. Lookup compares the hash in SQL. This mirrors
 * lib/server/device-refresh-token.ts / 0080_device_refresh_token_rotation.sql.
 * The raw token is never logged and never placed in a redirect URL.
 *
 * # Seat accounting
 *
 * A PENDING invitation holds a seat (0085 triggers). Every terminal transition
 * releases it. Acceptance MUST flip the invitation out of 'pending' BEFORE
 * inserting the membership row: the `organizations_seats_within_license` CHECK
 * is immediate and cannot be deferred, so the reverse order transiently reaches
 * seats_consumed + 1 and would trip the ceiling on a fully-licensed org.
 *
 * # Client injection contract
 *
 * USER-CONTEXT: every function takes `db: DatabaseAdapter`. No private
 * connection is constructed here. See lib/services/README.md.
 */
import 'server-only';

import crypto from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import type {
  OrganizationInvitationRow,
  OrganizationInvitationStatus,
} from '@/lib/server/neon-types';
import { withSeatAccountingErrors } from './organization-seat-service';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_INVITATION_RESENDS = 10;

export type InvitableRole = 'admin' | 'member' | 'viewer';

export interface InvitationCredential {
  token: string;
  tokenHash: string;
  expiresAt: string;
}

export function hashInvitationToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createInvitationCredential(now = Date.now()): InvitationCredential {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashInvitationToken(token),
    expiresAt: new Date(now + INVITATION_TTL_MS).toISOString(),
  };
}

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

const INVITATION_COLUMNS = `id, organization_id, email, role, status,
   token_hash, invited_by_user_id, accepted_by_user_id, expires_at,
   resent_at, resend_count, created_at, updated_at`;

/**
 * Public projection. `token_hash` never leaves the server, and the raw token is
 * returned only by the create/resend paths that just minted it.
 */
export function formatInvitation(row: OrganizationInvitationRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role,
    status: row.status,
    invitedByUserId: row.invited_by_user_id,
    acceptedByUserId: row.accepted_by_user_id,
    expiresAt: row.expires_at,
    resentAt: row.resent_at,
    resendCount: row.resend_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Flip every pending invitation whose `expires_at` has passed to 'expired',
 * which fires the seat-release trigger.
 *
 * Called lazily inside the same transaction that is about to consume a seat, so
 * a dead invitation can never block a live one, AND durably from
 * /api/cron/expire-organization-invitations.
 */
export async function expirePendingInvitations(
  db: DatabaseAdapter,
  organizationId?: string,
): Promise<number> {
  if (organizationId) {
    return db.execute(
      `update public.organization_invitations
          set status = 'expired'
        where organization_id = $1
          and status = 'pending'
          and expires_at <= now()`,
      [organizationId],
    );
  }
  return db.execute(
    `update public.organization_invitations
        set status = 'expired'
      where status = 'pending'
        and expires_at <= now()`,
    [],
  );
}

export async function listInvitations(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<OrganizationInvitationRow[]> {
  return db.query<OrganizationInvitationRow>(
    `select ${INVITATION_COLUMNS}
       from public.organization_invitations
      where organization_id = $1
      order by created_at desc
      limit 200`,
    [organizationId],
  );
}

export interface CreateInvitationInput {
  organizationId: string;
  email: string;
  role: InvitableRole;
  invitedByUserId: string;
}

export interface CreatedInvitation {
  invitation: OrganizationInvitationRow;
  /** Returned exactly once. Never persisted, never logged. */
  token: string;
}

/**
 * Persist a pending invitation, consuming one licensed seat.
 *
 * Every rejection below happens BEFORE the seat-consuming INSERT so a no-op
 * cannot burn a seat:
 *   - the address already belongs to a member of this organization
 *   - a pending invitation for the address already exists (resend it instead)
 *
 * The seat ceiling itself is enforced by the database, not by a count here.
 */
export async function createInvitation(
  db: DatabaseAdapter,
  input: CreateInvitationInput,
): Promise<CreatedInvitation> {
  const email = normalizeInvitationEmail(input.email);
  const credential = createInvitationCredential();

  const invitation = await withSeatAccountingErrors(() =>
    db.transaction(async (tx) => {
      // Serialize with the add-member path, which takes the same advisory lock.
      await tx.query(
        `select pg_advisory_xact_lock(hashtextextended('agi:organization-members:' || $1, 0))`,
        [input.organizationId],
      );

      // Release seats held by invitations that have already lapsed, so a stale
      // invitation never blocks a live one.
      await expirePendingInvitations(tx, input.organizationId);

      const [alreadyMember] = await tx.query<{ user_id: string }>(
        `select m.user_id
           from public.organization_members m
           join public.profiles p on p.id = m.user_id
          where m.organization_id = $1
            and lower(p.email) = $2
          limit 1`,
        [input.organizationId, email],
      );
      if (alreadyMember) {
        throw createError.conflict('That person is already a member of this organization');
      }

      const [pending] = await tx.query<{ id: string }>(
        `select id
           from public.organization_invitations
          where organization_id = $1 and email = $2 and status = 'pending'
          limit 1`,
        [input.organizationId, email],
      );
      if (pending) {
        throw createError.conflict(
          'An invitation for that address is already pending. Resend it instead of creating a second one.',
        );
      }

      const [created] = await tx.query<OrganizationInvitationRow>(
        `insert into public.organization_invitations
           (organization_id, email, role, status, token_hash, invited_by_user_id, expires_at)
         values ($1, $2, $3, 'pending', $4, $5, $6)
         returning ${INVITATION_COLUMNS}`,
        [
          input.organizationId,
          email,
          input.role,
          credential.tokenHash,
          input.invitedByUserId,
          credential.expiresAt,
        ],
      );

      if (!created) {
        throw createError.conflict('The invitation could not be created');
      }
      return created;
    }),
  );

  return { invitation, token: credential.token };
}

/**
 * Mint a fresh token and extend the expiry of an existing pending invitation.
 *
 * An UPDATE, never a second row — the partial unique index on
 * (organization_id, email) where status = 'pending' makes that structural, and
 * it keeps the seat count stable across a resend.
 */
export async function resendInvitation(
  db: DatabaseAdapter,
  organizationId: string,
  invitationId: string,
): Promise<CreatedInvitation> {
  const credential = createInvitationCredential();

  const invitation = await db.transaction(async (tx) => {
    await expirePendingInvitations(tx, organizationId);

    const [current] = await tx.query<OrganizationInvitationRow>(
      `select ${INVITATION_COLUMNS}
         from public.organization_invitations
        where id = $1 and organization_id = $2
        limit 1`,
      [invitationId, organizationId],
    );

    if (!current) {
      throw createError.notFound('Invitation not found in this organization');
    }
    if (current.status !== 'pending') {
      throw createError.conflict(
        `This invitation is ${current.status} and can no longer be resent. Create a new invitation instead.`,
      );
    }
    if (current.resend_count >= MAX_INVITATION_RESENDS) {
      throw createError.conflict(
        'This invitation has been resent the maximum number of times. Revoke it and create a new one.',
      );
    }

    const [updated] = await tx.query<OrganizationInvitationRow>(
      `update public.organization_invitations
          set token_hash = $1,
              expires_at = $2,
              resent_at = now(),
              resend_count = resend_count + 1
        where id = $3 and organization_id = $4 and status = 'pending'
        returning ${INVITATION_COLUMNS}`,
      [credential.tokenHash, credential.expiresAt, invitationId, organizationId],
    );

    if (!updated) {
      throw createError.conflict('The invitation changed while it was being resent');
    }
    return updated;
  });

  return { invitation, token: credential.token };
}

/**
 * Revoke a pending invitation. Releases its seat through the trigger.
 */
export async function revokeInvitation(
  db: DatabaseAdapter,
  organizationId: string,
  invitationId: string,
): Promise<OrganizationInvitationRow> {
  const [updated] = await db.query<OrganizationInvitationRow>(
    `update public.organization_invitations
        set status = 'revoked'
      where id = $1 and organization_id = $2 and status = 'pending'
      returning ${INVITATION_COLUMNS}`,
    [invitationId, organizationId],
  );

  if (updated) return updated;

  const [existing] = await db.query<Pick<OrganizationInvitationRow, 'status'>>(
    `select status from public.organization_invitations
      where id = $1 and organization_id = $2 limit 1`,
    [invitationId, organizationId],
  );

  if (!existing) {
    throw createError.notFound('Invitation not found in this organization');
  }
  throw createError.conflict(`This invitation is already ${existing.status}`);
}

export interface AcceptInvitationInput {
  token: string;
  /** The AUTHENTICATED subject. Never taken from the invitation row. */
  userId: string;
  /** The authenticated subject's email, resolved server-side from profiles. */
  userEmail: string | null;
}

export interface AcceptedInvitation {
  invitation: OrganizationInvitationRow;
  role: InvitableRole;
}

/**
 * Accept an invitation by presenting its one-time token.
 *
 * Authorization is the token PLUS an email match: a leaked link must not grant
 * organization access to whoever opens it, so the authenticated subject's
 * stored email has to equal the invited address (case-insensitive). Membership
 * is always bound to the authenticated user id, never to the invited string.
 */
export async function acceptInvitation(
  db: DatabaseAdapter,
  input: AcceptInvitationInput,
): Promise<AcceptedInvitation> {
  const tokenHash = hashInvitationToken(input.token);

  return withSeatAccountingErrors(() =>
    db.transaction(async (tx) => {
      // Bound to the token hash and nothing else — this is the one legitimately
      // privileged lookup, because the invitee has no membership row yet and so
      // no RLS predicate can authorize them.
      const [invitation] = await tx.query<OrganizationInvitationRow>(
        `select ${INVITATION_COLUMNS}
           from public.organization_invitations
          where token_hash = $1
            and status = 'pending'
            and expires_at > now()
          limit 1`,
        [tokenHash],
      );

      if (!invitation) {
        throw createError.notFound('This invitation link is invalid, expired, or already used');
      }

      const subjectEmail = input.userEmail ? normalizeInvitationEmail(input.userEmail) : null;
      if (!subjectEmail || subjectEmail !== invitation.email) {
        throw createError.forbidden(
          'This invitation was issued to a different email address. Sign in with the invited address to accept it.',
        );
      }

      await tx.query(
        `select pg_advisory_xact_lock(hashtextextended('agi:organization-members:' || $1, 0))`,
        [invitation.organization_id],
      );

      const [existingMembership] = await tx.query<{ user_id: string }>(
        `select user_id from public.organization_members
          where organization_id = $1 and user_id = $2 limit 1`,
        [invitation.organization_id, input.userId],
      );

      // ORDER IS LOAD-BEARING: release the invitation's seat first. The
      // `organizations_seats_within_license` CHECK is immediate, so inserting
      // the member first would transiently reach seats_consumed + 1 and abort
      // on a fully-licensed organization.
      const [accepted] = await tx.query<OrganizationInvitationRow>(
        `update public.organization_invitations
            set status = 'accepted', accepted_by_user_id = $1
          where id = $2 and status = 'pending'
          returning ${INVITATION_COLUMNS}`,
        [input.userId, invitation.id],
      );

      if (!accepted) {
        throw createError.conflict('This invitation changed while it was being accepted');
      }

      if (!existingMembership) {
        await tx.execute(
          `insert into public.organization_members
             (organization_id, user_id, role, provisioning_source, provisioned_at, joined_at)
           values ($1, $2, $3, 'invitation', now(), now())`,
          [invitation.organization_id, input.userId, invitation.role],
        );
      }

      return { invitation: accepted, role: invitation.role };
    }),
  );
}

/**
 * Decline an invitation by presenting its token. Releases the held seat.
 */
export async function declineInvitation(
  db: DatabaseAdapter,
  token: string,
): Promise<OrganizationInvitationRow> {
  const tokenHash = hashInvitationToken(token);

  const [declined] = await db.query<OrganizationInvitationRow>(
    `update public.organization_invitations
        set status = 'declined'
      where token_hash = $1 and status = 'pending'
      returning ${INVITATION_COLUMNS}`,
    [tokenHash],
  );

  if (!declined) {
    throw createError.notFound('This invitation link is invalid, expired, or already used');
  }
  return declined;
}

export const INVITATION_TERMINAL_STATUSES: readonly OrganizationInvitationStatus[] = [
  'accepted',
  'declined',
  'revoked',
  'expired',
];
