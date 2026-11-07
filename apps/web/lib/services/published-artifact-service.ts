import 'server-only';

import { randomBytes } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_CURSOR_MAX_CHARS,
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_ID_MAX_CHARS,
  ManagedCloudPublishedArtifactLookupQuerySchema,
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS,
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS,
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_VISIBILITIES,
} from '@agiworkforce/cloud-contracts';
import {
  UNATTENDED_RUN_DENIED_STATUSES,
  ownerMayRunUnattendedSql,
} from '@/lib/auth/account-lifecycle';
import { SITE_URL } from '@/lib/seo/site';

/**
 * Published artifact persistence (CAP-015 slice 1).
 *
 * `packages/platform/artifacts` has carried a `CloudPublisher` seam since
 * AUDIT-FIX ART-27 with nothing behind it, the module's own docs said "No
 * surface ships a CloudPublisher yet", so the Publish action degraded to a
 * clipboard copy on every surface. This service is the storage half of the
 * first real adapter: it turns an artifact into a durable row in
 * `public.published_artifacts` (db/neon/0095_published_artifacts.sql) reachable
 * at an unguessable public URL, and it can take that URL away again.
 *
 * Trust boundary: every authenticated call takes an RLS-scoped adapter
 * (`getUserScopedDb`) AND binds `user_id` in the statement, so ownership is
 * enforced in the database as well as in the query. The one deliberately
 * anonymous read, {@link getPublishedArtifactByToken}, is the public page's
 * token lookup and mirrors how `app/share/[token]/page.tsx` reads
 * `shared_sessions`: knowledge of the 144-bit token is the read grant, and it
 * now applies only to rows whose `visibility` is still `public`.
 *
 * Migration 0184 gave the row a second audience. A `visibility` of
 * `organization` closes the anonymous path above and leaves the artifact
 * readable through `lib/services/org-shared-artifact-service.ts`, where an
 * RLS-scoped adapter and a grant row in `organization_shared_artifacts` decide
 * the answer.
 *
 * Known gaps (founder-pending, deliberately NOT invented here):
 *   - No TTL. Published pages live until the publisher revokes them; no expiry
 *     window has been approved and a guessed one would silently delete pages.
 *   - Views are not counted or audited on either audience.
 */

export const MAX_CONTENT_CHARS = 1_000_000;
const MAX_TITLE_CHARS = MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS;
const MAX_ARTIFACT_ID_CHARS = MANAGED_CLOUD_PUBLISHED_ARTIFACT_ID_MAX_CHARS;
const MAX_LANGUAGE_CHARS = 50;
const MAX_LIST_LIMIT = MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS;

/**
 * Per-user admission cap. Legacy list consumers read only the first page.
 */
export const MAX_PUBLISHED_PER_USER = MAX_LIST_LIMIT;

export const PUBLISHABLE_KINDS = [
  'html',
  'react',
  'svg',
  'mermaid',
  'markdown',
  'text',
  'code',
] as const;

export type PublishableKind = (typeof PUBLISHABLE_KINDS)[number];

/**
 * Who the publication is for (migration 0184). `public` is the 0095 rule,
 * knowledge of the token is the read grant. `organization` closes the anonymous
 * page and leaves the artifact readable only to members holding the grant row
 * in `organization_shared_artifacts`.
 */
export const PUBLISHED_ARTIFACT_VISIBILITIES = MANAGED_CLOUD_PUBLISHED_ARTIFACT_VISIBILITIES;

export type PublishedArtifactVisibility = (typeof PUBLISHED_ARTIFACT_VISIBILITIES)[number];

export function isPublishedArtifactVisibility(
  value: unknown,
): value is PublishedArtifactVisibility {
  return (
    typeof value === 'string' &&
    (PUBLISHED_ARTIFACT_VISIBILITIES as readonly string[]).includes(value)
  );
}

const SCRIPTED_KINDS: ReadonlySet<string> = new Set(['html', 'react', 'mermaid']);

export function isPublishableKind(value: unknown): value is PublishableKind {
  return typeof value === 'string' && (PUBLISHABLE_KINDS as readonly string[]).includes(value);
}

/**
 * True when the kind must be rendered inside the cross-origin sandbox frame
 * rather than inline on the app origin. The public page branches on this, and
 * it is exported so the branch is testable without rendering React.
 */
export function requiresSandboxedRender(kind: PublishableKind): boolean {
  return SCRIPTED_KINDS.has(kind);
}

export const PUBLISHED_TOKEN_REGEX = /^[A-Za-z0-9_-]{24}$/;

export const CONNECTOR_ARTIFACT_PUBLIC_SHARE_MESSAGE =
  'This artifact uses connected apps, which are not available on publicly shared artifacts. Share it with your workspace or with people you invite.';

export class PublishedArtifactConnectorShareError extends Error {
  constructor() {
    super(CONNECTOR_ARTIFACT_PUBLIC_SHARE_MESSAGE);
    this.name = 'PublishedArtifactConnectorShareError';
  }
}

export class PublishedArtifactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishedArtifactValidationError';
  }
}

/** The caller does not own the conversation the artifact came from: a 403, never a 500. */
export class PublishedArtifactOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishedArtifactOwnershipError';
  }
}

export class PublishedArtifactQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishedArtifactQuotaError';
  }
}

const PG_RLS_VIOLATION = '42501';

function isRowLevelSecurityDenial(error: unknown): boolean {
  let candidate: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!candidate || typeof candidate !== 'object') return false;
    const row = candidate as Record<string, unknown>;
    if (row['code'] === PG_RLS_VIOLATION) return true;
    candidate = row['cause'];
  }
  return false;
}

export interface PublishedArtifactRow {
  id: string;
  token: string;
  user_id: string;
  artifact_id: string;
  conversation_id: string | null;
  title: string;
  kind: string;
  language: string | null;
  content: string;
  visibility: string;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface PublishedArtifact {
  id: string;
  token: string;
  userId: string;
  artifactId: string;
  conversationId: string | null;
  title: string;
  kind: PublishableKind;
  language: string | null;
  content: string;
  visibility: PublishedArtifactVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface PublishedArtifactSummary {
  token: string;
  artifactId: string;
  conversationId: string | null;
  title: string;
  kind: PublishableKind;
  language: string | null;
  contentChars: number;
  version: number;
  visibility: PublishedArtifactVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface PublishArtifactRecordInput {
  userId: string;
  artifactId: string;
  conversationId?: string | null;
  title: string;
  kind: string;
  language?: string | null;
  content: string;
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function rowKind(kind: string): PublishableKind {
  return isPublishableKind(kind) ? kind : 'text';
}

function rowVisibility(value: string | null | undefined): PublishedArtifactVisibility {
  return isPublishedArtifactVisibility(value) ? value : 'public';
}

export function rowToPublishedArtifact(row: PublishedArtifactRow): PublishedArtifact {
  return {
    id: row.id,
    token: row.token,
    userId: row.user_id,
    artifactId: row.artifact_id,
    conversationId: row.conversation_id,
    title: row.title,
    kind: rowKind(row.kind),
    language: row.language,
    content: row.content,
    visibility: rowVisibility(row.visibility),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

interface PublishPreflightRow {
  owned_conversations: number | string | null;
}

function requirePublicationCount(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) {
    throw new Error('Published artifact count is invalid');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Published artifact count is invalid');
  }
  return parsed;
}

function toVersionNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

interface PublishedArtifactSummaryRow {
  token: string;
  artifact_id: string;
  conversation_id: string | null;
  title: string;
  kind: string;
  language: string | null;
  content_chars: number | string | null;
  version: number | string | null;
  visibility: string;
  created_at: string | Date;
  updated_at: string | Date;
}

function rowToSummary(row: PublishedArtifactSummaryRow): PublishedArtifactSummary {
  const characters = Number(row.content_chars ?? 0);
  return {
    token: row.token,
    artifactId: row.artifact_id,
    conversationId: row.conversation_id ?? null,
    title: row.title,
    kind: rowKind(row.kind),
    language: row.language,
    contentChars: Number.isFinite(characters) && characters > 0 ? Math.floor(characters) : 0,
    version: toVersionNumber(row.version),
    visibility: rowVisibility(row.visibility),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mintPublishToken(): string {
  return randomBytes(18).toString('base64url');
}

export function buildPublishedArtifactUrl(token: string): string {
  return `${SITE_URL}/shared-artifact/${token}`;
}

async function preparePublishArtifactRecord(
  db: DatabaseAdapter,
  input: PublishArtifactRecordInput,
): Promise<{
  userId: string;
  artifactId: string;
  conversationId: string | null;
  title: string;
  language: string | null;
  content: string;
}> {
  const userId = input.userId?.trim();
  if (!userId) throw new PublishedArtifactValidationError('userId is required');

  const artifactId = input.artifactId?.trim();
  if (!artifactId) throw new PublishedArtifactValidationError('artifactId is required');
  if (artifactId.length > MAX_ARTIFACT_ID_CHARS) {
    throw new PublishedArtifactValidationError(
      `artifactId exceeds ${MAX_ARTIFACT_ID_CHARS} characters`,
    );
  }

  if (!isPublishableKind(input.kind)) {
    throw new PublishedArtifactValidationError(
      `Artifacts of kind "${input.kind}" cannot be published: only ${PUBLISHABLE_KINDS.join(
        ', ',
      )} have a safe public renderer.`,
    );
  }

  const content = typeof input.content === 'string' ? input.content : '';
  if (!content.trim()) {
    throw new PublishedArtifactValidationError('content is required');
  }
  if (content.length > MAX_CONTENT_CHARS) {
    throw new PublishedArtifactValidationError(
      `content exceeds ${MAX_CONTENT_CHARS} characters and cannot be published`,
    );
  }

  const title = (input.title ?? '').slice(0, MAX_TITLE_CHARS);
  const language = input.language ? input.language.slice(0, MAX_LANGUAGE_CHARS) : null;
  const conversationId = input.conversationId ?? null;

  const preflights = await db.query<PublishPreflightRow>(
    `select
       (select count(*) from public.web_conversations
         where id = $2::uuid and user_id = $1 and deleted_at is null) as owned_conversations`,
    [userId, conversationId],
  );
  if (preflights.length !== 1 || !preflights[0]) {
    throw new Error('Published artifact ownership preflight is missing');
  }
  const ownedConversations = requirePublicationCount(preflights[0].owned_conversations);

  // The RLS WITH CHECK in 0095 already refuses a foreign conversation, but it
  // refuses it by raising 42501, a 500 to the caller. Decide it here so the
  // answer is a 403 the client can act on.
  if (conversationId && ownedConversations === 0) {
    throw new PublishedArtifactOwnershipError(
      'That artifact belongs to a conversation that was deleted or that you do not own, so it cannot be published.',
    );
  }

  return { userId, artifactId, conversationId, title, language, content };
}

async function admitPublishedArtifact(
  db: DatabaseAdapter,
  userId: string,
  artifactId: string,
): Promise<string | null> {
  const isolation = await db.query<{ isolation: string }>(
    `select current_setting('transaction_isolation') as isolation`,
  );
  if (isolation.length !== 1 || isolation[0]?.isolation !== 'read committed') {
    throw new Error('Published artifact admission requires read committed isolation');
  }
  const locks = await db.query<{ locked: boolean }>(
    `select pg_advisory_xact_lock(hashtextextended('agi:published-artifact-quota:' || $1, 0)),
            true as locked`,
    [userId],
  );
  if (locks.length !== 1 || locks[0]?.locked !== true) {
    throw new Error('Published artifact admission lock was not acquired');
  }
  // Separate statements refresh the READ COMMITTED snapshot after waiting for the owner lock.
  const existing = await db.query<{ id: string; user_id: string; artifact_id: string }>(
    `select id, user_id, artifact_id from public.published_artifacts
      where user_id = $1 and artifact_id = $2
      for update`,
    [userId, artifactId],
  );
  if (!Array.isArray(existing) || existing.length > 1) {
    throw new Error('Published artifact admission identity is invalid');
  }
  if (existing.length === 1) {
    const row = existing[0];
    if (
      !row ||
      typeof row.id !== 'string' ||
      !row.id.trim() ||
      row.user_id !== userId ||
      row.artifact_id !== artifactId
    ) {
      throw new Error('Published artifact admission identity is invalid');
    }
    return row.id;
  }
  const counts = await db.query<{ published_count: number | string }>(
    `select count(*) as published_count from public.published_artifacts where user_id = $1`,
    [userId],
  );
  if (counts.length !== 1 || !counts[0]) {
    throw new Error('Published artifact admission count is missing');
  }
  if (requirePublicationCount(counts[0].published_count) >= MAX_PUBLISHED_PER_USER) {
    throw new PublishedArtifactQuotaError(
      `You already have ${MAX_PUBLISHED_PER_USER} published artifacts. Unpublish one before publishing another.`,
    );
  }
  return null;
}

export async function publishArtifactRecord(
  db: DatabaseAdapter,
  input: PublishArtifactRecordInput,
): Promise<PublishedArtifact & { version: number }> {
  return db.transaction(async (tx) => {
    const { userId, artifactId, conversationId, title, language, content } =
      await preparePublishArtifactRecord(tx, input);
    const existingPublicationId = await admitPublishedArtifact(tx, userId, artifactId);

    let rows: PublishedArtifactRow[];
    try {
      rows = await tx.query<PublishedArtifactRow>(
        `insert into public.published_artifacts (
         token, user_id, artifact_id, conversation_id, title, kind, language, content, visibility
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8,
         case when exists (
           select 1 from public.live_artifacts live
            where live.user_id = $2 and live.artifact_id::text = lower($3)
         ) then 'invited' else 'public' end
       )
       on conflict (user_id, artifact_id) do update set
         conversation_id = coalesce(excluded.conversation_id, published_artifacts.conversation_id),
         title = case when published_artifacts.title = '' then excluded.title
                      else published_artifacts.title end,
         kind = excluded.kind,
         language = excluded.language,
         content = excluded.content,
         updated_at = now()
       returning id, token, user_id, artifact_id, conversation_id, title, kind,
                 language, content, visibility, created_at, updated_at`,
        [
          mintPublishToken(),
          userId,
          artifactId,
          conversationId,
          title,
          input.kind,
          language,
          content,
        ],
      );
    } catch (error) {
      if (isRowLevelSecurityDenial(error)) {
        throw new PublishedArtifactOwnershipError(
          'Row-level security refused the publish: the artifact is not yours to publish.',
        );
      }
      throw error;
    }

    const row = rows[0];
    if (!row) {
      throw new PublishedArtifactOwnershipError(
        'Artifact was not published (row-level security denied the write)',
      );
    }
    if (
      rows.length !== 1 ||
      typeof row.id !== 'string' ||
      !row.id.trim() ||
      (existingPublicationId !== null && row.id !== existingPublicationId) ||
      row.user_id !== userId ||
      row.artifact_id !== artifactId
    ) {
      throw new Error('Published artifact write identity is invalid');
    }
    const version = await recordPublishedVersion(tx, {
      publishedArtifactId: row.id,
      userId: row.user_id,
      title: row.title,
      kind: row.kind,
      language: row.language,
      content: row.content,
    });
    return { ...rowToPublishedArtifact(row), version };
  });
}

export async function restorePublishedArtifactRecord(
  db: DatabaseAdapter,
  input: PublishArtifactRecordInput & { publishedArtifactId: string; token: string },
): Promise<(PublishedArtifact & { version: number }) | null> {
  if (!input.publishedArtifactId || !PUBLISHED_TOKEN_REGEX.test(input.token)) return null;
  return db.transaction(async (tx) => {
    const { userId, artifactId, title, language, content } = await preparePublishArtifactRecord(
      tx,
      input,
    );

    let rows: PublishedArtifactRow[];
    try {
      rows = await tx.query<PublishedArtifactRow>(
        `update public.published_artifacts
            set title = case when title = '' then $5 else title end,
                kind = $6, language = $7, content = $8, updated_at = now()
          where user_id = $1 and id = $2 and artifact_id = $3 and token = $4
          returning id, token, user_id, artifact_id, conversation_id, title, kind,
                    language, content, visibility, created_at, updated_at`,
        [
          userId,
          input.publishedArtifactId,
          artifactId,
          input.token,
          title,
          input.kind,
          language,
          content,
        ],
      );
    } catch (error) {
      if (isRowLevelSecurityDenial(error)) {
        throw new PublishedArtifactOwnershipError(
          'Row-level security refused the publish: the artifact is not yours to publish.',
        );
      }
      throw error;
    }
    const row = rows[0];
    if (rows.length === 0) return null;
    if (
      rows.length !== 1 ||
      !row ||
      row.id !== input.publishedArtifactId ||
      row.token !== input.token ||
      row.user_id !== userId ||
      row.artifact_id !== artifactId
    ) {
      throw new Error('Published artifact restore identity is invalid');
    }
    const version = await recordPublishedVersion(tx, {
      publishedArtifactId: row.id,
      userId: row.user_id,
      title: row.title,
      kind: row.kind,
      language: row.language,
      content: row.content,
    });
    return { ...rowToPublishedArtifact(row), version };
  });
}

export async function unpublishArtifactRecord(
  db: DatabaseAdapter,
  input: { userId: string; token: string },
): Promise<boolean> {
  const userId = input.userId?.trim();
  const token = input.token?.trim();
  if (!userId || !token) return false;
  if (!PUBLISHED_TOKEN_REGEX.test(token)) return false;

  const rows = await db.query<{ token: string }>(
    `delete from public.published_artifacts
      where token = $1 and user_id = $2
      returning token`,
    [token, userId],
  );
  return rows.length > 0;
}

export async function unpublishArtifactsForConversations(
  db: DatabaseAdapter,
  input: { userId: string; conversationIds: readonly string[] },
): Promise<string[]> {
  const userId = input.userId?.trim();
  const conversationIds = [...new Set(input.conversationIds.filter(Boolean))];
  if (!userId || conversationIds.length === 0) return [];

  const rows = await db.query<{ token: string }>(
    `delete from public.published_artifacts
      where user_id = $1
        and conversation_id = any($2::uuid[])
      returning token`,
    [userId, conversationIds],
  );
  return rows.map((row) => row.token);
}

export async function publicationUsesConnectors(
  db: DatabaseAdapter,
  input: { userId: string; token: string },
): Promise<boolean> {
  const userId = input.userId?.trim();
  const token = input.token?.trim();
  if (!userId || !token || !PUBLISHED_TOKEN_REGEX.test(token)) return false;
  const [row] = await db.query<{ uses_connectors: boolean }>(
    `select exists (
       select 1
         from public.published_artifacts publication
         join public.live_artifacts live
           on live.user_id = publication.user_id
          and live.artifact_id::text = lower(publication.artifact_id)
        where publication.token = $1 and publication.user_id = $2
     ) as uses_connectors`,
    [token, userId],
  );
  return row?.uses_connectors === true;
}

export async function publishedArtifactAllowsConnectors(
  db: DatabaseAdapter,
  publishedArtifactId: string,
): Promise<boolean> {
  const [row] = await db.query<{ allowed: boolean | null }>(
    `select public.app_published_artifact_allows_connectors($1::uuid) as allowed`,
    [publishedArtifactId],
  );
  return row?.allowed === true;
}

export async function publishedArtifactUsesConnectors(
  db: DatabaseAdapter,
  publishedArtifactId: string,
): Promise<boolean> {
  const [row] = await db.query<{ uses: boolean | null }>(
    `select public.app_published_artifact_uses_connectors($1::uuid) as uses`,
    [publishedArtifactId],
  );
  return row?.uses === true;
}

/**
 * Rename one of the caller's own published artifacts. The name belongs to the
 * page rather than to any one version, which is why a republish keeps it.
 */
export async function renamePublishedArtifact(
  db: DatabaseAdapter,
  input: { userId: string; token: string; title: string },
): Promise<PublishedArtifact | null> {
  const userId = input.userId?.trim();
  const token = input.token?.trim();
  const title = input.title.trim().slice(0, MAX_TITLE_CHARS);
  if (!userId || !token || !title || !PUBLISHED_TOKEN_REGEX.test(token)) return null;

  const rows = await db.query<PublishedArtifactRow>(
    `update public.published_artifacts
        set title = $3, updated_at = now()
      where token = $1 and user_id = $2
      returning id, token, user_id, artifact_id, conversation_id, title, kind,
                language, content, visibility, created_at, updated_at`,
    [token, userId, title],
  );
  const row = rows[0];
  return row ? rowToPublishedArtifact(row) : null;
}

interface PublishedArtifactPageRow extends PublishedArtifactSummaryRow {
  id: string;
  cursor_created_at: string;
}

type PublishedArtifactCursor = { v: 1; owner: string; createdAt: string; id: string };

function validCursorTimestamp(value: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d{6}Z$/.exec(value);
  if (!parts) return false;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= days[month - 1]! &&
    Number(parts[4]) <= 23 &&
    Number(parts[5]) <= 59 &&
    Number(parts[6]) <= 59
  );
}

function readPublishedArtifactCursor(value: string, userId: string): PublishedArtifactCursor {
  const invalid = () => new PublishedArtifactValidationError('Invalid published artifact cursor');
  if (
    !value ||
    value.length > MANAGED_CLOUD_PUBLISHED_ARTIFACT_CURSOR_MAX_CHARS ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw invalid();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) throw invalid();
  let decoded: unknown;
  try {
    const json = bytes.toString('utf8');
    decoded = JSON.parse(json);
    if (JSON.stringify(decoded) !== json || !Buffer.from(json).equals(bytes)) throw invalid();
  } catch {
    throw invalid();
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) throw invalid();
  const cursor = decoded as Record<string, unknown>;
  if (
    Object.keys(cursor).length !== 4 ||
    cursor.v !== 1 ||
    cursor.owner !== userId ||
    typeof cursor.createdAt !== 'string' ||
    !validCursorTimestamp(cursor.createdAt) ||
    typeof cursor.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cursor.id)
  ) {
    throw invalid();
  }
  return { v: 1, owner: userId, createdAt: cursor.createdAt, id: cursor.id };
}

export async function listPublishedArtifactsPage(
  db: DatabaseAdapter,
  input: { userId: string; limit?: number; cursor?: string },
): Promise<{ artifacts: PublishedArtifactSummary[]; nextCursor: string | null }> {
  const userId = input.userId?.trim();
  if (!userId) throw new PublishedArtifactValidationError('Publication owner is required');
  const limit = input.limit ?? MAX_LIST_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    throw new PublishedArtifactValidationError('Invalid published artifact page size');
  }
  const cursor =
    input.cursor === undefined ? null : readPublishedArtifactCursor(input.cursor, userId);
  const rows = await db.query<PublishedArtifactPageRow>(
    `select id, token, artifact_id, conversation_id, title, kind, language,
            length(content) as content_chars, version, visibility, created_at, updated_at,
            to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_created_at
       from public.published_artifacts
      where user_id = $1${cursor ? ' and (created_at, id) < ($3::timestamptz, $4::uuid)' : ''}
      order by created_at desc, id desc
      limit $2`,
    cursor ? [userId, limit + 1, cursor.createdAt, cursor.id] : [userId, limit + 1],
  );
  const page = rows.slice(0, limit);
  const boundary = page.at(-1);
  const nextCursor =
    rows.length > limit && boundary
      ? Buffer.from(
          JSON.stringify({
            v: 1,
            owner: userId,
            createdAt: boundary.cursor_created_at,
            id: boundary.id,
          } satisfies PublishedArtifactCursor),
        ).toString('base64url')
      : null;
  if (nextCursor) readPublishedArtifactCursor(nextCursor, userId);
  return { artifacts: page.map(rowToSummary), nextCursor };
}

export async function getOwnedPublishedArtifactSummary(
  db: DatabaseAdapter,
  input: { userId: string; token: string },
): Promise<PublishedArtifactSummary | null> {
  const userId = input.userId?.trim();
  if (!userId || !PUBLISHED_TOKEN_REGEX.test(input.token)) return null;
  const [row] = await db.query<PublishedArtifactSummaryRow>(
    `select token, artifact_id, conversation_id, title, kind, language,
            length(content) as content_chars, version, visibility, created_at, updated_at
       from public.published_artifacts
      where token = $1 and user_id = $2
      limit 1`,
    [input.token, userId],
  );
  return row ? rowToSummary(row) : null;
}

export async function getOwnedPublishedArtifactSummaryByArtifactId(
  db: DatabaseAdapter,
  input: { userId: string; artifactId: string },
): Promise<PublishedArtifactSummary | null> {
  const userId = input.userId?.trim();
  const parsed = ManagedCloudPublishedArtifactLookupQuerySchema.safeParse(input);
  if (!userId || !parsed.success) {
    throw new PublishedArtifactValidationError('Invalid published artifact lookup');
  }
  const [row] = await db.query<PublishedArtifactSummaryRow>(
    `select token, artifact_id, conversation_id, title, kind, language,
            length(content) as content_chars, version, visibility, created_at, updated_at
       from public.published_artifacts
      where user_id = $1 and artifact_id = $2
      limit 1`,
    [userId, parsed.data.artifactId],
  );
  return row ? rowToSummary(row) : null;
}

export async function listPublishedArtifacts(
  db: DatabaseAdapter,
  input: { userId: string; limit?: number },
): Promise<PublishedArtifactSummary[]> {
  const userId = input.userId?.trim();
  if (!userId) return [];
  const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, Math.floor(input.limit ?? MAX_LIST_LIMIT)));

  const rows = await db.query<PublishedArtifactSummaryRow>(
    `select token, artifact_id, conversation_id, title, kind, language,
            length(content) as content_chars, version, visibility, created_at, updated_at
       from public.published_artifacts
      where user_id = $1
      order by created_at desc, id desc
      limit $2`,
    [userId, limit],
  );
  return rows.map(rowToSummary);
}

export async function getPublishedArtifactByToken(
  db: DatabaseAdapter,
  token: string,
): Promise<PublishedArtifact | null> {
  if (!token || !PUBLISHED_TOKEN_REGEX.test(token)) return null;
  const rows = await db.query<PublishedArtifactRow>(
    `select id, token, user_id, artifact_id, conversation_id, title, kind,
            language, content, visibility, created_at, updated_at
       from public.published_artifacts
      where token = $1
        and visibility = 'public'
        and ${ownerMayRunUnattendedSql('published_artifacts.user_id', 2)}
      limit 1`,
    [token, UNATTENDED_RUN_DENIED_STATUSES],
  );
  const row = rows[0];
  return row ? rowToPublishedArtifact(row) : null;
}

interface PublishedVersionRow {
  id: string;
  version: number | string;
  title: string;
  kind: string;
  language: string | null;
  content: string;
  created_at: string | Date;
}

function requireHistoryVersion(value: number | string | undefined): number {
  const version = Number(value);
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !Number.isSafeInteger(version) ||
    version < 1
  ) {
    throw new Error('Published artifact history has an invalid version');
  }
  return version;
}

/**
 * Append this publish to the artifact's history, unless it says exactly what
 * the newest version already says. Republishing an unchanged artifact is what
 * the Publish button does on every second click, and a history full of
 * identical versions is not a history.
 */
async function recordPublishedVersion(
  db: DatabaseAdapter,
  input: {
    publishedArtifactId: string;
    userId: string;
    title: string;
    kind: string;
    language: string | null;
    content: string;
  },
): Promise<number> {
  const [newest] = await db.query<PublishedVersionRow>(
    `select id, version, title, kind, language, content, created_at
       from public.published_artifact_versions
      where published_artifact_id = $1 and user_id = $2
      order by version desc
      limit 1`,
    [input.publishedArtifactId, input.userId],
  );

  const newestVersion = newest ? requireHistoryVersion(newest.version) : 0;
  let version: number;
  if (
    newest &&
    newest.content === input.content &&
    newest.title === input.title &&
    newest.kind === input.kind &&
    (newest.language ?? null) === input.language
  ) {
    version = newestVersion;
  } else {
    const nextVersion = requireHistoryVersion(newestVersion + 1);
    const [inserted] = await db.query<{ version: number | string }>(
      `insert into public.published_artifact_versions
         (published_artifact_id, user_id, version, title, kind, language, content, parent_version_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning version`,
      [
        input.publishedArtifactId,
        input.userId,
        nextVersion,
        input.title,
        input.kind,
        input.language,
        input.content,
        newest?.id ?? null,
      ],
    );
    version = requireHistoryVersion(inserted?.version);
    if (version !== nextVersion) {
      throw new Error('Published artifact history version did not match the write');
    }
  }

  const receipts = await db.query<{ id: string; user_id: string; version: number | string }>(
    `update public.published_artifacts
        set version = $2
      where id = $1 and user_id = $3
      returning id, user_id, version`,
    [input.publishedArtifactId, version, input.userId],
  );
  const receipt = receipts[0];
  if (
    receipts.length !== 1 ||
    !receipt ||
    receipt.id !== input.publishedArtifactId ||
    receipt.user_id !== input.userId ||
    requireHistoryVersion(receipt.version) !== version
  ) {
    throw new Error('Published artifact version pointer was not updated');
  }
  return version;
}

export interface PublishedArtifactVersionSummary {
  version: number;
  title: string;
  kind: string;
  createdAt: string;
  live: boolean;
}

interface OwnedPublicationRow {
  id: string;
  version: number | string | null;
}

async function readOwnedPublication(
  db: DatabaseAdapter,
  userId: string,
  token: string,
): Promise<OwnedPublicationRow | null> {
  if (!userId || !PUBLISHED_TOKEN_REGEX.test(token)) return null;
  const [row] = await db.query<OwnedPublicationRow>(
    `select id, version from public.published_artifacts where token = $1 and user_id = $2 limit 1`,
    [token, userId],
  );
  return row ?? null;
}

export async function listPublishedArtifactVersions(
  db: DatabaseAdapter,
  input: { userId: string; token: string },
): Promise<PublishedArtifactVersionSummary[] | null> {
  const publication = await readOwnedPublication(db, input.userId.trim(), input.token.trim());
  if (!publication) return null;
  const live = toVersionNumber(publication.version);
  const rows = await db.query<Omit<PublishedVersionRow, 'content' | 'language' | 'id'>>(
    `select version, title, kind, created_at
       from public.published_artifact_versions
      where published_artifact_id = $1 and user_id = $2
      order by version desc`,
    [publication.id, input.userId.trim()],
  );
  return rows.map((row) => ({
    version: toVersionNumber(row.version),
    title: row.title,
    kind: row.kind,
    createdAt: toIso(row.created_at),
    live: toVersionNumber(row.version) === live,
  }));
}

export interface PublishedArtifactVersionDetail {
  version: number;
  title: string;
  kind: string;
  language: string | null;
  content: string;
}

export async function readPublishedArtifactVersion(
  db: DatabaseAdapter,
  input: { userId: string; token: string; version: number },
): Promise<PublishedArtifactVersionDetail | null> {
  const userId = input.userId.trim();
  const publication = await readOwnedPublication(db, userId, input.token.trim());
  if (!publication) return null;
  const [row] = await db.query<PublishedVersionRow>(
    `select id, version, title, kind, language, content, created_at
       from public.published_artifact_versions
      where published_artifact_id = $1 and user_id = $2 and version = $3
      limit 1`,
    [publication.id, userId, input.version],
  );
  if (!row) return null;
  return {
    version: toVersionNumber(row.version),
    title: row.title,
    kind: row.kind,
    language: row.language,
    content: row.content,
  };
}

export interface PublishedArtifactRestoreSource {
  publication: PublishedArtifact;
  snapshot: PublishedArtifactVersionDetail;
}

export async function readPublishedArtifactRestoreSource(
  db: DatabaseAdapter,
  input: { userId: string; token: string; version: number },
): Promise<PublishedArtifactRestoreSource | null> {
  const userId = input.userId.trim();
  const token = input.token.trim();
  if (!userId || !PUBLISHED_TOKEN_REGEX.test(token)) return null;
  if (!Number.isSafeInteger(input.version) || input.version < 1) return null;

  const [row] = await db.query<
    PublishedArtifactRow & {
      snapshot_version: number | string;
      snapshot_title: string;
      snapshot_kind: string;
      snapshot_language: string | null;
      snapshot_content: string;
    }
  >(
    `select publication.id, publication.token, publication.user_id, publication.artifact_id,
            publication.conversation_id, publication.title, publication.kind,
            publication.language, publication.content, publication.visibility,
            publication.created_at, publication.updated_at,
            snapshot.version as snapshot_version, snapshot.title as snapshot_title,
            snapshot.kind as snapshot_kind, snapshot.language as snapshot_language,
            snapshot.content as snapshot_content
       from public.published_artifacts publication
       join public.published_artifact_versions snapshot
         on snapshot.published_artifact_id = publication.id and snapshot.user_id = $2
      where publication.token = $1 and publication.user_id = $2 and snapshot.version = $3
      limit 1`,
    [token, userId, input.version],
  );
  if (!row) return null;
  return {
    publication: rowToPublishedArtifact(row),
    snapshot: {
      version: toVersionNumber(row.snapshot_version),
      title: row.snapshot_title,
      kind: row.snapshot_kind,
      language: row.snapshot_language,
      content: row.snapshot_content,
    },
  };
}

export async function isInviteOnlyPublication(
  db: DatabaseAdapter,
  token: string,
): Promise<boolean> {
  if (!PUBLISHED_TOKEN_REGEX.test(token)) return false;
  const rows = await db.query<{ token: string }>(
    `select token from public.published_artifacts where token = $1 and visibility = 'invited' limit 1`,
    [token],
  );
  return rows.length > 0;
}
