import 'server-only';

import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEFAULT_TEXT_WINDOW,
  RETRIEVAL_EMBEDDING_DIMENSIONS,
  isSearchSourceKind,
  windowText,
  type SearchChunkMetadata,
  type SearchSourceKind,
} from '@agiworkforce/data-layer/search';
import { MAX_EMBEDDING_INPUTS } from '@agiworkforce/cloud-contracts';

import { logger } from '@/lib/logger';
import { anchorLocationAt, parseKnowledgeAnchors } from '@/lib/server/project-knowledge-anchors';
import {
  embedTextsMetered,
  RetrievalEmbeddingError,
  type RetrievalEmbeddingFailureCode,
} from '@/lib/services/retrieval-embedding-service';

export const RETRIEVAL_MAX_ATTEMPTS = 5;
export const RETRIEVAL_DISPATCH_BATCH = 50;
const MAX_SOURCE_CHARS = 200_000;
const MAX_CHUNKS_PER_DOCUMENT = 400;
const MAX_CONVERSATION_MESSAGES = 400;
const MAX_SESSION_TURNS = 50;
const CHUNK_INSERT_BATCH = 50;
const INDEX_LEASE_MINUTES = 10;
const DISPATCH_HOLD_MINUTES = 15;
const RETRY_BASE_MINUTES = 5;
const UNAVAILABLE_RETRY_HOURS = 6;
const SEGMENT_SEPARATOR = '\n\n';

export type RetrievalDocumentStatus = 'pending' | 'indexing' | 'indexed' | 'stale' | 'failed';

export interface RetrievalDocumentRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  source_kind: SearchSourceKind;
  source_id: string;
  status: RetrievalDocumentStatus;
  chunk_version: number;
  content_sha256: string | null;
  embedding_model: string | null;
  attempts: number;
}

interface SourceSegment {
  text: string;
  metadata: SearchChunkMetadata;
}

export interface RetrievalSourceText {
  title: string;
  segments: SourceSegment[];
  anchorsFor?: (offset: number) => SearchChunkMetadata;
}

export interface PreparedChunk {
  index: number;
  start: number;
  end: number;
  text: string;
  metadata: SearchChunkMetadata;
}

export const RETRIEVAL_FAILURE_MESSAGES: Readonly<Record<RetrievalEmbeddingFailureCode, string>> = {
  no_route: 'Semantic indexing is not configured on this deployment; keyword search still works.',
  not_entitled:
    'Semantic indexing needs managed compute on your plan or workspace; keyword search still works.',
  billing_refused:
    'Semantic indexing was paused by your usage limits; keyword search still works and indexing retries automatically.',
  provider_failed:
    'The embedding provider did not respond; keyword search still works and indexing retries automatically.',
};

const INDEX_WRITE_FAILED_MESSAGE = 'This source could not be indexed. Retry indexing to try again.';

function clip(text: string | null | undefined, max = MAX_SOURCE_CHARS): string {
  return (text ?? '').slice(0, max);
}

export async function loadRetrievalSourceText(
  db: DatabaseAdapter,
  document: Pick<RetrievalDocumentRow, 'source_kind' | 'source_id' | 'user_id'>,
): Promise<RetrievalSourceText | null> {
  switch (document.source_kind) {
    case 'project_knowledge': {
      const [file] = await db.query<{
        project_id: string;
        file_name: string;
        extracted_text: string | null;
        extracted_anchors: unknown;
      }>(
        `select project_id, file_name, extracted_text, extracted_anchors
           from project_knowledge_files
          where id = $1 and deleted_at is null and superseded_at is null`,
        [document.source_id],
      );
      if (!file) return null;
      const anchors = parseKnowledgeAnchors(file.extracted_anchors);
      return {
        title: file.file_name,
        segments: file.extracted_text
          ? [{ text: clip(file.extracted_text), metadata: { projectId: file.project_id } }]
          : [],
        anchorsFor: (offset) => {
          const anchor = anchorLocationAt(anchors, offset);
          return anchor ? { anchor } : {};
        },
      };
    }
    case 'library_file': {
      const [asset] = await db.query<{
        kind: string;
        mime_type: string;
        prompt: string | null;
        file_name: string | null;
      }>(
        `select kind, mime_type, prompt, metadata->>'filename' as file_name
           from media_assets
          where id = $1 and user_id = $2 and deleted_at is null`,
        [document.source_id, document.user_id],
      );
      if (!asset) return null;
      const title = asset.file_name?.trim() || asset.kind;
      const text = [title, asset.prompt ?? '']
        .filter((part) => part.trim())
        .join(SEGMENT_SEPARATOR);
      return { title, segments: [{ text: clip(text), metadata: { mimeType: asset.mime_type } }] };
    }
    case 'conversation': {
      const [conversation] = await db.query<{ title: string | null }>(
        `select title from web_conversations
          where id = $1 and user_id = $2 and deleted_at is null and is_temporary = false`,
        [document.source_id, document.user_id],
      );
      if (!conversation) return null;
      const messages = await db.query<{ id: string; role: string; content: string }>(
        `select id, role, content::text as content
           from web_messages
          where conversation_id = $1 and deleted_at is null and role in ('user', 'assistant')
          order by created_at asc
          limit ${MAX_CONVERSATION_MESSAGES}`,
        [document.source_id],
      );
      let budget = MAX_SOURCE_CHARS;
      const segments: SourceSegment[] = [];
      for (const message of messages) {
        if (budget <= 0) break;
        const text = clip(message.content, budget);
        if (!text.trim()) continue;
        budget -= text.length;
        segments.push({ text, metadata: { messageId: message.id, role: message.role } });
      }
      return { title: conversation.title ?? '', segments };
    }
    case 'artifact': {
      const [artifact] = await db.query<{
        title: string | null;
        artifact_type: string;
        language: string | null;
        content: string;
        conversation_id: string;
      }>(
        `select title, artifact_type, language, content, conversation_id
           from web_artifacts
          where id = $1 and deleted_at is null`,
        [document.source_id],
      );
      if (!artifact) return null;
      return {
        title: artifact.title ?? '',
        segments: [
          {
            text: clip(artifact.content),
            metadata: {
              artifactType: artifact.artifact_type,
              language: artifact.language,
              conversationId: artifact.conversation_id,
            },
          },
        ],
      };
    }
    case 'research_report': {
      const [report] = await db.query<{
        title: string;
        query: string;
        summary: string;
        content: string;
        conversation_id: string | null;
      }>(
        `select title, query, summary, content, conversation_id
           from research_reports
          where id = $1 and status = 'completed'`,
        [document.source_id],
      );
      if (!report) return null;
      const metadata = report.conversation_id ? { conversationId: report.conversation_id } : {};
      return {
        title: report.title,
        segments: [report.query, report.summary, report.content]
          .filter((part) => part.trim())
          .map((part) => ({ text: clip(part), metadata })),
      };
    }
    case 'developer_session': {
      const [session] = await db.query<{ title: string; repository_url: string | null }>(
        `select title, repository_url
           from cloud_code_sessions
          where id = $1 and user_id = $2 and archived_at is null`,
        [document.source_id, document.user_id],
      );
      if (!session) return null;
      const turns = await db.query<{ id: string; goal: string; final_message: string | null }>(
        `select id, goal, final_message
           from cloud_code_agent_turns
          where session_id = $1
          order by created_at desc
          limit ${MAX_SESSION_TURNS}`,
        [document.source_id],
      );
      const segments: SourceSegment[] = [];
      if (session.repository_url) {
        segments.push({ text: session.repository_url, metadata: {} });
      }
      for (const turn of turns.reverse()) {
        const text = [turn.goal, turn.final_message ?? '']
          .filter((part) => part.trim())
          .join(SEGMENT_SEPARATOR);
        if (text.trim()) segments.push({ text: clip(text), metadata: { turnId: turn.id } });
      }
      return { title: session.title, segments };
    }
  }
}

/**
 * Offsets are into the segment for project knowledge, which is the whole
 * extracted text, so a chunk can be traced to the page or heading it came from.
 * Other sources carry their locator (message, turn) in metadata instead.
 */
export function prepareChunks(source: RetrievalSourceText): PreparedChunk[] {
  const chunks: PreparedChunk[] = [];
  for (const segment of source.segments) {
    for (const window of windowText(segment.text, DEFAULT_TEXT_WINDOW)) {
      if (chunks.length >= MAX_CHUNKS_PER_DOCUMENT) return chunks;
      chunks.push({
        index: chunks.length,
        start: window.start,
        end: window.end,
        text: window.text,
        metadata: { ...segment.metadata, ...(source.anchorsFor?.(window.start) ?? {}) },
      });
    }
  }
  return chunks;
}

export function contentDigest(title: string, chunks: readonly PreparedChunk[]): string {
  const hash = createHash('sha256').update(title);
  for (const chunk of chunks) hash.update(' ').update(chunk.text);
  return hash.digest('hex');
}

export function toVectorLiteral(vector: readonly number[]): string {
  if (vector.length !== RETRIEVAL_EMBEDDING_DIMENSIONS || vector.some((v) => !Number.isFinite(v))) {
    throw new Error('Embedding width does not match the retrieval index.');
  }
  return `[${vector.join(',')}]`;
}

function nextRetryMinutes(attempts: number): number {
  return RETRY_BASE_MINUTES * 2 ** Math.max(0, attempts - 1);
}

export async function claimRetrievalDocument(
  db: DatabaseAdapter,
  documentId: string,
  workflowRunId: string,
): Promise<RetrievalDocumentRow | null> {
  const [row] = await db.query<RetrievalDocumentRow>(
    `update retrieval_documents
        set status = 'indexing',
            lease_expires_at = now() + interval '${INDEX_LEASE_MINUTES} minutes',
            workflow_run_id = $2,
            updated_at = now()
      where id = $1
        and (
          status in ('pending', 'stale', 'failed')
          or (status = 'indexing' and (lease_expires_at < now() or workflow_run_id = $2))
        )
      returning id, user_id, organization_id, source_kind, source_id, status,
                chunk_version, content_sha256, embedding_model, attempts`,
    [documentId, workflowRunId],
  );
  return row && isSearchSourceKind(row.source_kind) ? row : null;
}

async function embedChunks(
  db: DatabaseAdapter,
  document: RetrievalDocumentRow,
  chunks: readonly PreparedChunk[],
): Promise<{
  vectors: Array<number[] | null>;
  model: string | null;
  failure: RetrievalEmbeddingFailureCode | null;
}> {
  const vectors: Array<number[] | null> = chunks.map(() => null);
  let model: string | null = null;
  for (let offset = 0; offset < chunks.length; offset += MAX_EMBEDDING_INPUTS) {
    const batch = chunks.slice(offset, offset + MAX_EMBEDDING_INPUTS);
    try {
      const result = await embedTextsMetered({
        db,
        userId: document.user_id,
        organizationId: document.organization_id,
        texts: batch.map((chunk) => chunk.text),
        purpose: 'document',
        operationKey: `${document.id}:${document.chunk_version + 1}:${offset}`,
      });
      result.vectors.forEach((vector, index) => {
        vectors[offset + index] = vector;
      });
      model = result.model;
    } catch (error) {
      const failure = error instanceof RetrievalEmbeddingError ? error.code : 'provider_failed';
      logger.warn(
        { err: error, documentId: document.id, failure },
        '[retrieval] embedding failed; chunks are stored for keyword search only',
      );
      return { vectors: chunks.map(() => null), model: null, failure };
    }
  }
  return { vectors, model, failure: null };
}

async function writeChunks(
  db: DatabaseAdapter,
  document: RetrievalDocumentRow,
  source: RetrievalSourceText,
  chunks: readonly PreparedChunk[],
  vectors: ReadonlyArray<number[] | null>,
  chunkVersion: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(`delete from retrieval_chunks where document_id = $1 and user_id = $2`, [
      document.id,
      document.user_id,
    ]);
    for (let offset = 0; offset < chunks.length; offset += CHUNK_INSERT_BATCH) {
      const batch = chunks.slice(offset, offset + CHUNK_INSERT_BATCH);
      await tx.execute(
        `insert into retrieval_chunks
           (document_id, user_id, organization_id, source_kind, source_id, chunk_version,
            chunk_index, start_offset, end_offset, title, content, metadata, embedding)
         select $1, $2, $3::uuid, $4, $5::uuid, $6,
                c.chunk_index, c.start_offset, c.end_offset, $7, c.content, c.metadata::jsonb,
                c.embedding::vector
           from unnest($8::int[], $9::int[], $10::int[], $11::text[], $12::text[], $13::text[])
             as c(chunk_index, start_offset, end_offset, content, metadata, embedding)`,
        [
          document.id,
          document.user_id,
          document.organization_id,
          document.source_kind,
          document.source_id,
          chunkVersion,
          source.title.slice(0, 500),
          batch.map((chunk) => chunk.index),
          batch.map((chunk) => chunk.start),
          batch.map((chunk) => chunk.end),
          batch.map((chunk) => chunk.text),
          batch.map((chunk) => JSON.stringify(chunk.metadata)),
          batch.map((chunk) => {
            const vector = vectors[chunk.index];
            return vector ? toVectorLiteral(vector) : null;
          }),
        ],
      );
    }
  });
}

export type RetrievalIndexOutcome =
  | { kind: 'skipped' }
  | { kind: 'removed' }
  | { kind: 'unchanged' }
  | { kind: 'indexed'; chunkCount: number; semantic: boolean }
  | { kind: 'failed'; retryAfterMinutes: number | null };

async function settleDocument(
  db: DatabaseAdapter,
  document: Pick<RetrievalDocumentRow, 'id' | 'user_id'>,
  fields: {
    succeeded: boolean;
    chunkVersion?: number;
    chunkCount?: number;
    contentSha256?: string;
    embeddingModel?: string | null;
    title?: string;
    lastError: string | null;
    retryAfterMinutes: number;
    resetAttempts: boolean;
  },
): Promise<void> {
  await db.execute(
    `update retrieval_documents
        set status = case
                       when status = 'stale' then 'stale'
                       when $2::boolean then 'indexed'
                       else 'failed'
                     end,
            chunk_version = coalesce($3::int, chunk_version),
            chunk_count = coalesce($4::int, chunk_count),
            content_sha256 = coalesce($5::text, content_sha256),
            embedding_model = case when $6::boolean then $7::text else embedding_model end,
            title = coalesce($8::text, title),
            last_error = $9::text,
            attempts = case when $10::boolean then 0 else attempts + 1 end,
            next_attempt_at = now() + make_interval(mins => $11::int),
            lease_expires_at = null,
            indexed_at = case when $3::int is not null then now() else indexed_at end,
            updated_at = now()
      where id = $1 and user_id = $12`,
    [
      document.id,
      fields.succeeded,
      fields.chunkVersion ?? null,
      fields.chunkCount ?? null,
      fields.contentSha256 ?? null,
      fields.embeddingModel !== undefined,
      fields.embeddingModel ?? null,
      fields.title?.slice(0, 500) ?? null,
      fields.lastError,
      fields.resetAttempts,
      fields.retryAfterMinutes,
      document.user_id,
    ],
  );
}

/**
 * Brings one document's chunks in line with its source. Unchanged text with
 * embeddings already present costs nothing; a failed embedding still leaves the
 * new chunks searchable by full text and schedules a retry with backoff.
 */
export async function indexRetrievalDocument(
  db: DatabaseAdapter,
  documentId: string,
  workflowRunId: string,
): Promise<RetrievalIndexOutcome> {
  const document = await claimRetrievalDocument(db, documentId, workflowRunId);
  if (!document) return { kind: 'skipped' };

  const source = await loadRetrievalSourceText(db, document);
  if (!source) {
    await db.execute(`delete from retrieval_documents where id = $1 and user_id = $2`, [
      document.id,
      document.user_id,
    ]);
    return { kind: 'removed' };
  }

  const chunks = prepareChunks(source);
  const digest = contentDigest(source.title, chunks);
  if (
    digest === document.content_sha256 &&
    (document.embedding_model !== null || chunks.length === 0)
  ) {
    await settleDocument(db, document, {
      succeeded: true,
      lastError: null,
      retryAfterMinutes: 0,
      resetAttempts: true,
    });
    return { kind: 'unchanged' };
  }

  const embedded =
    chunks.length === 0
      ? { vectors: [], model: null, failure: null }
      : await embedChunks(db, document, chunks);
  const chunkVersion = document.chunk_version + 1;

  try {
    await writeChunks(db, document, source, chunks, embedded.vectors, chunkVersion);
  } catch (error) {
    logger.error({ err: error, documentId: document.id }, '[retrieval] chunk write failed');
    const attempts = document.attempts + 1;
    await settleDocument(db, document, {
      succeeded: false,
      lastError: INDEX_WRITE_FAILED_MESSAGE,
      retryAfterMinutes: nextRetryMinutes(attempts),
      resetAttempts: false,
    });
    return {
      kind: 'failed',
      retryAfterMinutes: attempts < RETRIEVAL_MAX_ATTEMPTS ? nextRetryMinutes(attempts) : null,
    };
  }

  if (embedded.failure) {
    const attempts = document.attempts + 1;
    const retryAfterMinutes =
      embedded.failure === 'no_route' || embedded.failure === 'not_entitled'
        ? UNAVAILABLE_RETRY_HOURS * 60
        : nextRetryMinutes(attempts);
    await settleDocument(db, document, {
      succeeded: false,
      chunkVersion,
      chunkCount: chunks.length,
      contentSha256: digest,
      embeddingModel: null,
      title: source.title,
      lastError: RETRIEVAL_FAILURE_MESSAGES[embedded.failure],
      retryAfterMinutes,
      resetAttempts: false,
    });
    return {
      kind: 'failed',
      retryAfterMinutes: attempts < RETRIEVAL_MAX_ATTEMPTS ? retryAfterMinutes : null,
    };
  }

  await settleDocument(db, document, {
    succeeded: true,
    chunkVersion,
    chunkCount: chunks.length,
    contentSha256: digest,
    embeddingModel: embedded.model,
    title: source.title,
    lastError: null,
    retryAfterMinutes: 0,
    resetAttempts: true,
  });
  return { kind: 'indexed', chunkCount: chunks.length, semantic: embedded.model !== null };
}

export interface DueRetrievalDocument {
  id: string;
  user_id: string;
  organization_id: string | null;
}

/**
 * Platform sweep: holds each due document for the dispatch window so the next
 * cron tick does not start a second run for it while this one is starting.
 */
export async function reserveDueRetrievalDocuments(
  db: DatabaseAdapter,
  limit: number = RETRIEVAL_DISPATCH_BATCH,
): Promise<DueRetrievalDocument[]> {
  return db.query<DueRetrievalDocument>(
    `update retrieval_documents d
        set next_attempt_at = now() + interval '${DISPATCH_HOLD_MINUTES} minutes',
            updated_at = now()
      where d.id in (
        select id
          from retrieval_documents
         where next_attempt_at <= now()
           and (
             status in ('pending', 'stale')
             or (status = 'failed' and attempts < $1)
             or (status = 'indexing' and lease_expires_at < now())
           )
         order by next_attempt_at asc
         limit $2
         for update skip locked
      )
      returning d.id, d.user_id, d.organization_id`,
    [RETRIEVAL_MAX_ATTEMPTS, limit],
  );
}

export interface RetrievalIndexState {
  status: RetrievalDocumentStatus;
  chunkCount: number;
  semantic: boolean;
  attempts: number;
  error: string | null;
  indexedAt: string | null;
}

export async function readProjectKnowledgeIndexStates(
  db: Pick<DatabaseAdapter, 'query'>,
  projectId: string,
  fileIds: readonly string[],
): Promise<Map<string, RetrievalIndexState>> {
  const states = new Map<string, RetrievalIndexState>();
  if (fileIds.length === 0) return states;
  const rows = await db.query<{
    project_knowledge_file_id: string;
    status: RetrievalDocumentStatus;
    chunk_count: number;
    embedding_model: string | null;
    attempts: number;
    last_error: string | null;
    indexed_at: string | null;
  }>(
    `select d.project_knowledge_file_id, d.status, d.chunk_count, d.embedding_model, d.attempts,
            d.last_error, d.indexed_at::text as indexed_at
       from retrieval_documents d
       join project_knowledge_files k on k.id = d.project_knowledge_file_id
        and k.deleted_at is null
      where k.project_id = $1
        and d.project_knowledge_file_id = any($2::uuid[])`,
    [projectId, fileIds],
  );
  for (const row of rows) {
    states.set(row.project_knowledge_file_id, {
      status: row.status,
      chunkCount: row.chunk_count,
      semantic: row.embedding_model !== null,
      attempts: row.attempts,
      error: row.last_error,
      indexedAt: row.indexed_at,
    });
  }
  return states;
}

/**
 * The owner asked for the file to be indexed again: the document is reset to
 * pending with a fresh attempt budget, or created if the file has none (a file
 * restored after deletion).
 */
export async function requestProjectKnowledgeReindex(
  db: DatabaseAdapter,
  input: { fileId: string; ownerUserId: string; organizationId: string | null; fileName: string },
): Promise<string | null> {
  const [updated] = await db.query<{ id: string }>(
    `update retrieval_documents
        set status = case when status = 'indexing' then status else 'pending' end,
            attempts = 0,
            last_error = null,
            next_attempt_at = now(),
            updated_at = now()
      where project_knowledge_file_id = $1 and user_id = $2
      returning id`,
    [input.fileId, input.ownerUserId],
  );
  if (updated) return updated.id;
  const [inserted] = await db.query<{ id: string }>(
    `insert into retrieval_documents
       (user_id, organization_id, source_kind, title, project_knowledge_file_id)
     values ($1, $2::uuid, 'project_knowledge', $3, $4)
     on conflict (source_kind, source_id) do update set next_attempt_at = now()
     returning id`,
    [input.ownerUserId, input.organizationId, input.fileName.slice(0, 500), input.fileId],
  );
  return inserted?.id ?? null;
}

export async function findProjectKnowledgeDocument(
  db: Pick<DatabaseAdapter, 'query'>,
  input: { fileId: string; ownerUserId: string },
): Promise<DueRetrievalDocument | null> {
  const [row] = await db.query<DueRetrievalDocument>(
    `select id, user_id, organization_id
       from retrieval_documents
      where project_knowledge_file_id = $1 and user_id = $2`,
    [input.fileId, input.ownerUserId],
  );
  return row ?? null;
}
