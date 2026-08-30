import 'server-only';

import { randomBytes } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

/**
 * Published artifact persistence (CAP-015 slice 1).
 *
 * `packages/platform/artifacts` has carried a `CloudPublisher` seam since
 * AUDIT-FIX ART-27 with nothing behind it — the module's own docs said "No
 * surface ships a CloudPublisher yet", so the Publish action degraded to a
 * clipboard copy on every surface. This service is the storage half of the
 * first real adapter: it turns an artifact into a durable row in
 * `public.published_artifacts` (db/neon/0095_published_artifacts.sql) reachable
 * at an unguessable public URL, and it can take that URL away again.
 *
 * Trust boundary: every authenticated call takes an RLS-scoped adapter
 * (`getUserScopedDb`) AND binds `user_id` in the statement, so ownership is
 * enforced in the database as well as in the query. The one deliberately
 * anonymous read — {@link getPublishedArtifactByToken} — is the public page's
 * token lookup and mirrors how `app/share/[token]/page.tsx` reads
 * `shared_sessions`: knowledge of the 144-bit token is the read grant.
 *
 * Known gaps (founder-pending, deliberately NOT invented here):
 *   - No TTL. Published pages live until the publisher revokes them; no expiry
 *     window has been approved and a guessed one would silently delete pages.
 *   - View auth is public-by-token, matching the conversation-share precedent,
 *     and views are not counted or audited.
 */

export const MAX_CONTENT_CHARS = 1_000_000;
const MAX_TITLE_CHARS = 300;
const MAX_ARTIFACT_ID_CHARS = 200;
const MAX_LANGUAGE_CHARS = 50;
const MAX_LIST_LIMIT = 200;

/**
 * Per-user cap on live published pages. Deliberately equal to the management
 * list cap: a page past that limit could never appear in its own publisher's
 * "Published artifacts" list, so it could never be found and revoked there.
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

interface PublishedArtifactRow {
  id: string;
  token: string;
  user_id: string;
  artifact_id: string;
  conversation_id: string | null;
  title: string;
  kind: string;
  language: string | null;
  content: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface PublishedArtifactSummary {
  token: string;
  artifactId: string;
  title: string;
  kind: PublishableKind;
  language: string | null;
  contentChars: number;
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

function rowToPublishedArtifact(row: PublishedArtifactRow): PublishedArtifact {
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
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

interface PublishPreflightRow {
  other_published: number | string | null;
  owned_conversations: number | string | null;
}

function countOf(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

interface PublishedArtifactSummaryRow {
  token: string;
  artifact_id: string;
  title: string;
  kind: string;
  language: string | null;
  content_chars: number | string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function rowToSummary(row: PublishedArtifactSummaryRow): PublishedArtifactSummary {
  const characters = Number(row.content_chars ?? 0);
  return {
    token: row.token,
    artifactId: row.artifact_id,
    title: row.title,
    kind: rowKind(row.kind),
    language: row.language,
    contentChars: Number.isFinite(characters) && characters > 0 ? Math.floor(characters) : 0,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mintPublishToken(): string {
  return randomBytes(18).toString('base64url');
}

export function buildPublishedArtifactUrl(token: string): string {
  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';
  return `${appUrl.replace(/\/+$/, '')}/shared-artifact/${token}`;
}

export async function publishArtifactRecord(
  db: DatabaseAdapter,
  input: PublishArtifactRecordInput,
): Promise<PublishedArtifact> {
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

  const [preflight] = await db.query<PublishPreflightRow>(
    `select
       (select count(*) from public.published_artifacts
         where user_id = $1 and artifact_id <> $2) as other_published,
       (select count(*) from public.web_conversations
         where id = $3::uuid and user_id = $1) as owned_conversations`,
    [userId, artifactId, conversationId],
  );

  // The RLS WITH CHECK in 0095 already refuses a foreign conversation, but it
  // refuses it by raising 42501 — a 500 to the caller. Decide it here so the
  // answer is a 403 the client can act on.
  if (conversationId && countOf(preflight?.owned_conversations) === 0) {
    throw new PublishedArtifactOwnershipError(
      'That artifact belongs to a conversation you do not own, so it cannot be published.',
    );
  }

  if (countOf(preflight?.other_published) >= MAX_PUBLISHED_PER_USER) {
    throw new PublishedArtifactQuotaError(
      `You already have ${MAX_PUBLISHED_PER_USER} published artifacts. Unpublish one before publishing another.`,
    );
  }

  let rows: PublishedArtifactRow[];
  try {
    rows = await db.query<PublishedArtifactRow>(
      `insert into public.published_artifacts (
       token, user_id, artifact_id, conversation_id, title, kind, language, content
     ) values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (user_id, artifact_id) do update set
       conversation_id = excluded.conversation_id,
       title = excluded.title,
       kind = excluded.kind,
       language = excluded.language,
       content = excluded.content,
       updated_at = now()
     returning id, token, user_id, artifact_id, conversation_id, title, kind,
               language, content, created_at, updated_at`,
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
    // The preflight and the write are not one transaction: the conversation can
    // change hands or be deleted in between, and RLS is the one that finally says no.
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
  return rowToPublishedArtifact(row);
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

export async function listPublishedArtifacts(
  db: DatabaseAdapter,
  input: { userId: string; limit?: number },
): Promise<PublishedArtifactSummary[]> {
  const userId = input.userId?.trim();
  if (!userId) return [];
  const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, Math.floor(input.limit ?? MAX_LIST_LIMIT)));

  const rows = await db.query<PublishedArtifactSummaryRow>(
    `select token, artifact_id, title, kind, language,
            length(content) as content_chars, created_at, updated_at
       from public.published_artifacts
      where user_id = $1
      order by created_at desc
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
            language, content, created_at, updated_at
       from public.published_artifacts
      where token = $1
      limit 1`,
    [token],
  );
  const row = rows[0];
  return row ? rowToPublishedArtifact(row) : null;
}
