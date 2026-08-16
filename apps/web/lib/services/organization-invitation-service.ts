import 'server-only';

import crypto from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import type {
  OrganizationInvitationRow,
  OrganizationInvitationStatus,
  OrganizationMemberRow,
} from '@/lib/server/neon-types';
import { withSeatAccountingErrors } from './organization-seat-service';
import { persistProvenActiveWorkspaceSelection } from './active-workspace-service';

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
  token: string;
}

export async function createInvitation(
  db: DatabaseAdapter,
  input: CreateInvitationInput,
): Promise<CreatedInvitation> {
  const email = normalizeInvitationEmail(input.email);
  const credential = createInvitationCredential();

  const invitation = await withSeatAccountingErrors(() =>
    db.transaction(async (tx) => {
      await tx.query(
        `select pg_advisory_xact_lock(hashtextextended('agi:organization-members:' || $1, 0))`,
        [input.organizationId],
      );

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
  userId: string;
  userEmail: string | null;
}

export interface AcceptedInvitation {
  invitation: OrganizationInvitationRow;
  role: OrganizationMemberRow['role'];
}

export async function acceptInvitation(
  db: DatabaseAdapter,
  input: AcceptInvitationInput,
): Promise<AcceptedInvitation> {
  const tokenHash = hashInvitationToken(input.token);

  return withSeatAccountingErrors(() =>
    db.transaction(async (tx) => {
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
        `select pg_advisory_xact_lock(hashtextextended('agi:organization-owner:' || $1, 0))`,
        [input.userId],
      );

      await tx.query(
        `select pg_advisory_xact_lock(hashtextextended('agi:organization-members:' || $1, 0))`,
        [invitation.organization_id],
      );

      const [existingMembership] = await tx.query<{
        organization_id: string;
        user_id: string;
        role: OrganizationMemberRow['role'];
      }>(
        `select organization_id, user_id, role
           from public.organization_members
          where organization_id = $1 and user_id = $2
          limit 1`,
        [invitation.organization_id, input.userId],
      );

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

      await persistProvenActiveWorkspaceSelection(tx, input.userId, invitation.organization_id);

      return { invitation: accepted, role: existingMembership?.role ?? invitation.role };
    }),
  );
}

export async function declineInvitation(
  db: DatabaseAdapter,
  input: Pick<AcceptInvitationInput, 'token' | 'userEmail'>,
): Promise<OrganizationInvitationRow> {
  const tokenHash = hashInvitationToken(input.token);

  return db.transaction(async (tx) => {
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
        'This invitation was issued to a different email address. Sign in with the invited address to decline it.',
      );
    }

    const [declined] = await tx.query<OrganizationInvitationRow>(
      `update public.organization_invitations
          set status = 'declined'
        where id = $1 and status = 'pending'
        returning ${INVITATION_COLUMNS}`,
      [invitation.id],
    );

    if (!declined) {
      throw createError.conflict('This invitation changed while it was being declined');
    }
    return declined;
  });
}

export const INVITATION_TERMINAL_STATUSES: readonly OrganizationInvitationStatus[] = [
  'accepted',
  'declined',
  'revoked',
  'expired',
];
