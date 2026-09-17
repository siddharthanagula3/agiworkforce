import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RETRIEVAL_EMBEDDING_DIMENSIONS,
  SEARCH_SOURCE_KINDS,
} from '@agiworkforce/data-layer/search';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0202_retrieval_index.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0202_retrieval_index.down.sql'),
  'utf8',
);

describe('retrieval index migration', () => {
  it('enables pgvector and stores embeddings at the width the application writes', () => {
    expect(migration).toContain('create extension if not exists vector;');
    expect(migration).toContain(`embedding vector(${RETRIEVAL_EMBEDDING_DIMENSIONS})`);
    expect(migration).toMatch(/using hnsw \(embedding vector_cosine_ops\)/);
  });

  it('keeps a generated weighted tsvector behind a GIN index for full text', () => {
    expect(migration).toMatch(/search_vector tsvector generated always as/);
    expect(migration).toContain("setweight(to_tsvector('simple'::regconfig, title), 'A')");
    expect(migration).toMatch(/using gin \(search_vector\)/);
  });

  it('accepts exactly the source kinds the search contract names', () => {
    const declared = /source_kind in \(([^)]*)\)/.exec(migration)?.[1] ?? '';
    const kinds = [...declared.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(kinds).toEqual([...SEARCH_SOURCE_KINDS]);
  });

  it('cascades every source so deleting a source deletes its chunks', () => {
    for (const source of [
      'project_knowledge_files',
      'media_assets',
      'web_conversations',
      'web_artifacts',
      'research_reports',
      'cloud_code_sessions',
    ]) {
      expect(migration).toContain(`references public.${source}(id) on delete cascade`);
    }
    expect(migration).toContain(
      'document_id uuid not null references public.retrieval_documents(id) on delete cascade',
    );
  });

  it('carries owner, workspace and chunk version on both tables', () => {
    for (const column of [
      'user_id text not null',
      'organization_id uuid references public.organizations(id) on delete cascade',
    ]) {
      expect(migration.split(column).length - 1).toBe(2);
    }
    expect(migration).toContain('chunk_version integer not null default 0');
    expect(migration).toContain(
      'constraint retrieval_chunks_position_unique unique (document_id, chunk_version, chunk_index)',
    );
  });

  it('forces row level security on both tables and gates chunks on their document', () => {
    for (const table of ['retrieval_documents', 'retrieval_chunks']) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`);
      expect(migration).toContain(`alter table public.${table} force row level security;`);
    }
    expect(migration).toMatch(
      /create policy retrieval_chunks_read[\s\S]*?select 1 from public\.retrieval_documents d where d\.id = retrieval_chunks\.document_id/,
    );
    expect(migration).toMatch(
      /create policy retrieval_documents_owner_insert[\s\S]*?app_retrieval_source_is_owned/,
    );
  });

  it('forgets a document when its source is soft-deleted or superseded', () => {
    expect(migration).toMatch(
      /new\.deleted_at is not null or new\.superseded_at is not null then\s+perform public\.retrieval_forget_document\('project_knowledge', new\.id\)/,
    );
    expect(migration).toMatch(
      /after insert or update of content, deleted_at\s+on public\.web_messages/,
    );
  });

  it('is reversed by a down file that drops what it created', () => {
    for (const statement of [
      'drop table if exists public.retrieval_chunks;',
      'drop table if exists public.retrieval_documents;',
      'drop function if exists public.retrieval_enqueue_document(text, uuid, text, uuid, text);',
      "where filename = '0202_retrieval_index.sql'",
    ]) {
      expect(reversal).toContain(statement);
    }
  });
});
