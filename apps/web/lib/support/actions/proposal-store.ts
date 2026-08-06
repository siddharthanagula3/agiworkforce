/**
 * @file Persistence for support action proposals (migration 0089).
 *
 * The security-relevant part of this file is `claimProposal`. It is a SINGLE
 * conditional UPDATE:
 *
 *   ... where id = $1 and user_id = $2 and token_hash = $3
 *       and consumed_at is null and expires_at > now()
 *
 * so caller binding, token validity, single use and expiry are all decided by
 * the database in one atomic step. Two concurrent confirms cannot both win, and
 * there is no read-then-write window in which a token can be replayed.
 *
 * The stored row is also the ONLY source of `action_id` and `params` at
 * execution time. The confirm request body carries no action and no params, so
 * a proposal cannot be retargeted at a different effect.
 */

import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import type { SupportActionId, SupportActionSurface } from './types';

export interface SupportProposalRow {
  id: string;
  action_id: string;
  params: unknown;
  params_hash: string;
  expires_at: string;
}

export interface InsertProposalInput {
  userId: string;
  actionId: SupportActionId;
  params: Record<string, unknown>;
  paramsHash: string;
  tokenHash: string;
  surface: SupportActionSurface;
  conversationRef: string | null;
  expiresAt: Date;
}

export async function insertProposal(input: InsertProposalInput): Promise<{ id: string }> {
  const db = getNeonDb();
  const [row] = await db.query<{ id: string }>(
    `insert into public.support_action_proposals
       (user_id, action_id, params, params_hash, token_hash, surface, conversation_ref, expires_at)
     values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
     returning id`,
    [
      input.userId,
      input.actionId,
      JSON.stringify(input.params ?? {}),
      input.paramsHash,
      input.tokenHash,
      input.surface,
      input.conversationRef,
      input.expiresAt.toISOString(),
    ],
  );
  if (!row) throw new Error('Failed to record support action proposal');
  return { id: row.id };
}

/**
 * Claim-before-execute. Returns null when the proposal does not exist, belongs
 * to someone else, was already consumed, or has expired — deliberately WITHOUT
 * distinguishing between those, so a caller cannot probe for the existence of
 * another user's proposal id.
 */
export async function claimProposal(args: {
  proposalId: string;
  userId: string;
  tokenHash: string;
}): Promise<SupportProposalRow | null> {
  const db = getNeonDb();
  const rows = await db.query<SupportProposalRow>(
    `update public.support_action_proposals
        set consumed_at = now(), outcome = 'executing'
      where id = $1
        and user_id = $2
        and token_hash = $3
        and consumed_at is null
        and expires_at > now()
      returning id, action_id, params, params_hash, expires_at`,
    [args.proposalId, args.userId, args.tokenHash],
  );
  return rows[0] ?? null;
}

/**
 * Record the terminal outcome. A DENIED claim is never rolled back to
 * `proposed`: a spent token stays spent even when execution refused.
 */
export async function finalizeProposal(args: {
  proposalId: string;
  userId: string;
  outcome: 'success' | 'failure' | 'denied';
}): Promise<void> {
  const db = getNeonDb();
  await db.execute(
    `update public.support_action_proposals
        set outcome = $3
      where id = $1 and user_id = $2`,
    [args.proposalId, args.userId, args.outcome],
  );
}

/**
 * Per-action daily ceiling, counted over this user's OWN rows. Sharper than the
 * shared IP/user rate-limit keys and needs no additional entries in the shared
 * `rateLimitConfigs` table.
 */
export async function countRecentProposals(args: {
  userId: string;
  actionId: SupportActionId;
}): Promise<number> {
  const db = getNeonDb();
  const [row] = await db.query<{ count: string }>(
    `select count(*) as count
       from public.support_action_proposals
      where user_id = $1
        and action_id = $2
        and created_at > now() - interval '24 hours'`,
    [args.userId, args.actionId],
  );
  const parsed = Number.parseInt(row?.count ?? '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
