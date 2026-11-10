import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import {
  compareByDeadline,
  resolveDataRightsDeadline,
  type DataRightsDeadline,
} from '@/lib/compliance/data-rights-deadlines';
import { getNeonDb } from '@/lib/server/neon-db';

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

export const DATA_RIGHTS_REQUEST_LABELS: Readonly<Record<DataRightsRequestType, string>> = {
  access: 'Access, send me a summary of the personal data you hold about me',
  correction: 'Correction, something you hold about me is wrong or incomplete',
  erasure: 'Erasure, delete personal data you hold about me',
  withdrawal: 'Withdraw consent, stop processing that depends on my consent',
  nomination: 'Nomination, record someone who may act for me if I cannot',
  grievance: 'Grievance, I am dissatisfied with how my data has been handled',
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

const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REFERENCE_LENGTH = 10;

const REFERENCE_ACCEPT_LIMIT =
  Math.floor(256 / REFERENCE_ALPHABET.length) * REFERENCE_ALPHABET.length;

function generateReference(): string {
  let out = '';
  while (out.length < REFERENCE_LENGTH) {
    for (const byte of randomBytes(REFERENCE_LENGTH - out.length)) {
      if (byte >= REFERENCE_ACCEPT_LIMIT) continue;
      out += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
    }
  }
  return `DPDP-${out}`;
}

export interface CreateDataRightsRequestInput {
  readonly userId: string | null;
  readonly contactEmail: string;
  readonly requestType: DataRightsRequestType;
  readonly details: string | null;
  readonly submissionToken?: string | undefined;
}

export interface CreatedDataRightsRequest extends DataRightsRequest {
  replayed: boolean;
}

export class DataRightsSubmissionConflictError extends Error {
  constructor() {
    super('This submission token was already used for a different rights request');
    this.name = 'DataRightsSubmissionConflictError';
  }
}

export function referenceForSubmission(submissionToken: string): string {
  const digest = createHash('sha256').update(`data-rights-request:${submissionToken}`).digest();
  let out = '';
  for (let index = 0; index < REFERENCE_LENGTH; index += 1) {
    out += REFERENCE_ALPHABET[digest[index]! % REFERENCE_ALPHABET.length];
  }
  return `DPDP-${out}`;
}

interface StoredRequestRow extends RequestRow {
  user_id: string | null;
  contact_email: string;
}

export async function createDataRightsRequest(
  input: CreateDataRightsRequestInput,
): Promise<CreatedDataRightsRequest> {
  const db = getNeonDb();
  const details = input.details ? input.details.slice(0, MAX_REQUEST_DETAILS_LENGTH) : null;

  if (input.submissionToken) {
    const reference = referenceForSubmission(input.submissionToken);
    const inserted = await db.query<RequestRow>(
      `insert into public.data_rights_requests
         (reference, user_id, contact_email, request_type, details)
       values ($1, $2, $3, $4, $5)
       on conflict (reference) do nothing
       returning reference, request_type, status, created_at, resolved_at`,
      [reference, input.userId, input.contactEmail, input.requestType, details],
    );
    if (inserted[0]) return { ...toRequest(inserted[0]), replayed: false };

    const [existing] = await db.query<StoredRequestRow>(
      `select reference, user_id, contact_email, request_type, status, created_at, resolved_at
         from public.data_rights_requests
        where reference = $1`,
      [reference],
    );
    if (
      !existing ||
      existing.request_type !== input.requestType ||
      existing.contact_email !== input.contactEmail ||
      existing.user_id !== input.userId
    ) {
      throw new DataRightsSubmissionConflictError();
    }
    return { ...toRequest(existing), replayed: true };
  }

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
      if (written) return { ...toRequest(written), replayed: false };
      throw new Error('Data-rights request was not written');
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === '23505' && attempt === 0) continue;
      throw error;
    }
  }

  throw new Error('Could not allocate a unique data-rights request reference');
}

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
  deadline: DataRightsDeadline;
}

interface OpenRequestRow extends RequestRow {
  contact_email: string;
  details: string | null;
  user_id: string | null;
}

// The queue is ordered by the statutory clock rather than by receipt, because a
// request answered in the order it arrived is still late if a shorter clock was
// running on one behind it.
export async function readOpenDataRightsRequests(
  limit = 100,
  now: Date = new Date(),
  offset = 0,
): Promise<OpenDataRightsRequest[]> {
  const rows = await getNeonDb().query<OpenRequestRow>(
    `select reference, user_id, contact_email, request_type, details, status,
            created_at, resolved_at
       from public.data_rights_requests
      where status in ('received', 'in_progress')
      order by created_at asc, id asc
      limit $1 offset $2`,
    [Math.min(Math.max(limit, 1), 500), Math.max(Math.trunc(offset), 0)],
  );
  return rows
    .map((row) => {
      const request = toRequest(row);
      return {
        ...request,
        userId: row.user_id,
        contactEmail: row.contact_email,
        details: row.details,
        deadline: resolveDataRightsDeadline({ createdAt: request.createdAt, now }),
      };
    })
    .sort((left, right) =>
      compareByDeadline(
        { dueAt: left.deadline.dueAt, createdAt: left.createdAt },
        { dueAt: right.deadline.dueAt, createdAt: right.createdAt },
      ),
    );
}

export async function countOpenDataRightsRequests(): Promise<number> {
  const [row] = await getNeonDb().query<{ total: number | string }>(
    `select count(*) as total
       from public.data_rights_requests
      where status in ('received', 'in_progress')`,
  );
  return Number(row?.total ?? 0);
}
