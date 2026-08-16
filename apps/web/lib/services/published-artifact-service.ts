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
 *   - No TTL. Published pages live until the publisher revokes them.
 *   - No per-user quota. `MAX_CONTENT_CHARS` bounds a single row, not a user.
 *   - View auth is public-by-token, matching the conversation-share precedent.
 */

export const MAX_CONTENT_CHARS = 1_000_000;
const MAX_TITLE_CHARS = 300;
const MAX_ARTIFACT_ID_CHARS = 200;
const MAX_LANGUAGE_CHARS = 50;
const MAX_LIST_LIMIT = 200;

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

  const rows = await db.query<PublishedArtifactRow>(
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
      input.conversationId ?? null,
      title,
      input.kind,
      language,
      content,
    ],
  );

  const row = rows[0];
  if (!row) {
    throw new PublishedArtifactValidationError(
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
