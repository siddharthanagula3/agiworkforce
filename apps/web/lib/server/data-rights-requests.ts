import 'server-only';

import { randomBytes } from 'node:crypto';

import { getNeonDb } from '@/lib/server/neon-db';

/**
 * Data-principal rights requests — the durable receipt for DPDP ss.11–14.
 *
 * The Act gives a Data Principal the right to access a summary of their data,
 * to have it corrected or completed, to have it erased, to withdraw consent,
 * to nominate someone to act for them, and to a grievance route that must be
 * exhausted before the Data Protection Board is approached. Some of those are
 * self-serve in the product (export, account deletion, per-purpose withdrawal);
 * the rest are not, and this module is what stands behind them.
 *
 * WHAT WRITING A ROW DOES, exactly: it records that a request was received, at
 * an instant, under a reference the requester is shown. It notifies nobody.
 *
 * On that last point, precisely, because the repository's own policy pages get
 * it wrong: an email provider IS wired here (`lib/support/handoff/resend-client.ts`,
 * called by support escalation and scheduled-task notifications), but nothing
 * connects it to this queue and there is no account-lifecycle mailing path at
 * all. So "no notification is sent" is true of THIS table for the ordinary
 * reason — nobody wired one — not because the product cannot send mail. Any
 * copy implying a human was paged would be false; the page that calls this says
 * "recorded" and names the mailbox to chase, and that is the whole promise.
 *
 * Storage is `public.data_rights_requests` (migration 0114).
 */

/** The rights a request can exercise. Mirrors the SQL check constraint. */
export const DATA_RIGHTS_REQUEST_TYPES = [
  'access',
  'correction',
  'erasure',
  'withdrawal',
  'nomination',
  'grievance',
] as const;

export type DataRightsRequestType = (typeof DATA_RIGHTS_REQUEST_TYPES)[number];

export function isDataRightsRequestType(value: unknown): value is DataRightsRequestType {
  return (
    typeof value === 'string' && (DATA_RIGHTS_REQUEST_TYPES as readonly string[]).includes(value)
  );
}

/** Human-facing labels, so the page and the queue name the same thing. */
export const DATA_RIGHTS_REQUEST_LABELS: Readonly<Record<DataRightsRequestType, string>> = {
  access: 'Access — send me a summary of the personal data you hold about me',
  correction: 'Correction — something you hold about me is wrong or incomplete',
  erasure: 'Erasure — delete personal data you hold about me',
  withdrawal: 'Withdraw consent — stop processing that depends on my consent',
  nomination: 'Nomination — record someone who may act for me if I cannot',
  grievance: 'Grievance — I am dissatisfied with how my data has been handled',
};

export const MAX_REQUEST_DETAILS_LENGTH = 4000;

export interface DataRightsRequest {
  reference: string;
  requestType: DataRightsRequestType;
  status: 'received' | 'in_progress' | 'resolved' | 'rejected';
  createdAt: string;
  resolvedAt: string | null;
}

interface RequestRow {
  reference: string;
  request_type: string;
  status: string;
  created_at: Date | string;
  resolved_at: Date | string | null;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toRequest(row: RequestRow): DataRightsRequest {
  return {
    reference: row.reference,
    requestType: row.request_type as DataRightsRequestType,
    status: row.status as DataRightsRequest['status'],
    createdAt: toIso(row.created_at),
    resolvedAt: row.resolved_at ? toIso(row.resolved_at) : null,
  };
}

/**
 * A reference the requester can quote back.
 *
 * Crockford-style alphabet with I, L, O and U removed, because this string gets
 * read down a phone line and typed into an email. 10 characters from a CSPRNG
 * is ~51 bits — not a secret, and not treated as one: knowing a reference
 * grants nothing, since every read path is authorised separately.
 */
const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REFERENCE_LENGTH = 10;

/**
 * Largest multiple of the alphabet size that fits in a byte. Bytes at or above
 * it are discarded rather than folded back with `%`.
 *
 * With today's 32-character alphabet this rejects nothing — 32 divides 256
 * exactly, so a plain modulo is already uniform. The rejection step is here so
 * that stays true if the alphabet is ever edited: at 33 characters, `byte % 33`
 * would make the first 25 symbols ~29% likelier than the rest, and nothing in
 * the type system or the tests would notice. Uniformity should be a property of
 * the code, not a coincidence of the current string's length.
 */
const REFERENCE_ACCEPT_LIMIT =
  Math.floor(256 / REFERENCE_ALPHABET.length) * REFERENCE_ALPHABET.length;

function generateReference(): string {
  let out = '';
  while (out.length < REFERENCE_LENGTH) {
    // Ask for what is still missing; on the rare rejection the loop refills.
    for (const byte of randomBytes(REFERENCE_LENGTH - out.length)) {
      if (byte >= REFERENCE_ACCEPT_LIMIT) continue;
      out += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
    }
  }
  return `DPDP-${out}`;
}

export interface CreateDataRightsRequestInput {
  /** Present when the request came from a signed-in session. */
  readonly userId: string | null;
  /** Where the response goes. Stored in plaintext by necessity — see 0114. */
  readonly contactEmail: string;
  readonly requestType: DataRightsRequestType;
  readonly details: string | null;
}

/**
 * Record a rights request and return its reference.
 *
 * Retries once on a reference collision, which is astronomically unlikely but
 * is a unique-constraint violation rather than a silent overwrite if it ever
 * happens. Any other database failure throws: a requester must never be shown a
 * reference for a request that was not stored.
 */
export async function createDataRightsRequest(
  input: CreateDataRightsRequestInput,
): Promise<DataRightsRequest> {
  const db = getNeonDb();
  const details = input.details ? input.details.slice(0, MAX_REQUEST_DETAILS_LENGTH) : null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reference = generateReference();
    try {
      const rows = await db.query<RequestRow>(
        `insert into public.data_rights_requests
           (reference, user_id, contact_email, request_type, details)
         values ($1, $2, $3, $4, $5)
         returning reference, request_type, status, created_at, resolved_at`,
        [reference, input.userId, input.contactEmail, input.requestType, details],
      );
      const written = rows[0];
      if (written) return toRequest(written);
      throw new Error('Data-rights request was not written');
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === '23505' && attempt === 0) continue; // reference collision
      throw error;
    }
  }

  throw new Error('Could not allocate a unique data-rights request reference');
}

/**
 * The signed-in user's own requests, newest first.
 *
 * Scoped by `user_id` on the owner connection: this table's RLS policy only
 * bites on the scoped handle, so the predicate here is the isolation, not a
 * convenience.
 */
export async function readUserDataRightsRequests(userId: string): Promise<DataRightsRequest[]> {
  const rows = await getNeonDb().query<RequestRow>(
    `select reference, request_type, status, created_at, resolved_at
       from public.data_rights_requests
      where user_id = $1
      order by created_at desc
      limit 100`,
    [userId],
  );
  return rows.map(toRequest);
}

export interface OpenDataRightsRequest extends DataRightsRequest {
  contactEmail: string;
  details: string | null;
  userId: string | null;
}

interface OpenRequestRow extends RequestRow {
  contact_email: string;
  details: string | null;
  user_id: string | null;
}

/**
 * The open queue, oldest first — what an operator has to work through.
 *
 * Deliberately unfiltered by user: this is the admin read, gated by
 * `requireAdmin` at the route. Oldest first because the thing that matters
 * about a rights request is how long it has been waiting.
 */
export async function readOpenDataRightsRequests(limit = 100): Promise<OpenDataRightsRequest[]> {
  const rows = await getNeonDb().query<OpenRequestRow>(
    `select reference, user_id, contact_email, request_type, details, status,
            created_at, resolved_at
       from public.data_rights_requests
      where status in ('received', 'in_progress')
      order by created_at asc
      limit $1`,
    [Math.min(Math.max(limit, 1), 500)],
  );
  return rows.map((row) => ({
    ...toRequest(row),
    userId: row.user_id,
    contactEmail: row.contact_email,
    details: row.details,
  }));
}
