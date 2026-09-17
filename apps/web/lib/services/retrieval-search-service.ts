import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  SEARCH_SOURCE_KINDS,
  isSearchSourceKind,
  rerankCandidates,
  type SearchCandidate,
  type SearchChunkMetadata,
  type SearchProvider,
  type SearchRequest,
  type SearchResponse,
  type SemanticSearchState,
} from '@agiworkforce/data-layer/search';

import { logger } from '@/lib/logger';
import {
  embedTextsMetered,
  RetrievalEmbeddingError,
} from '@/lib/services/retrieval-embedding-service';
import { toVectorLiteral } from '@/lib/services/retrieval-index-service';

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_OBJECT = '42704';
const CANDIDATE_MULTIPLIER = 4;
const MAX_CANDIDATES = 100;
const MAX_QUERY_TERMS = 16;
const MAX_QUERY_CHARS = 2_000;
const QUERY_TERM_PATTERN = /[\p{L}\p{N}]+/gu;

export interface RetrievalSearchScope {
  db: Pick<DatabaseAdapter, 'query'> & Partial<Pick<DatabaseAdapter, 'transaction' | 'execute'>>;
  userId: string;
  organizationId: string | null;
  semantic: boolean;
}

interface CandidateRow {
  chunk_id: string;
  document_id: string;
  source_kind: string;
  source_id: string;
  title: string;
  content: string;
  start_offset: number | null;
  end_offset: number | null;
  metadata: SearchChunkMetadata | null;
  chunk_version: number;
  indexed_at: string | null;
  lexical_rank: string | number | null;
  semantic_rank: string | number | null;
}

export function buildTsQuery(text: string, match: SearchRequest['match']): string | null {
  const terms = Array.from(
    new Set((text.toLowerCase().match(QUERY_TERM_PATTERN) ?? []).filter(Boolean)),
  ).slice(0, MAX_QUERY_TERMS);
  if (terms.length === 0) return null;
  if (match === 'any_term') return terms.join(' | ');
  return terms.map((term, index) => (index === terms.length - 1 ? `${term}:*` : term)).join(' & ');
}

function isRetrievalSchemaMissing(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_OBJECT;
}

function isFullAdapter(db: RetrievalSearchScope['db']): db is DatabaseAdapter {
  return typeof db.transaction === 'function' && typeof db.execute === 'function';
}

function toRank(value: string | number | null): number | null {
  if (value === null) return null;
  const rank = Number(value);
  return Number.isFinite(rank) ? rank : null;
}

async function queryEmbedding(
  scope: RetrievalSearchScope,
  request: SearchRequest,
  kinds: readonly string[],
): Promise<{ vector: string | null; state: SemanticSearchState }> {
  if (!scope.semantic || !isFullAdapter(scope.db)) return { vector: null, state: 'unavailable' };
  const [indexed] = await scope.db.query<{ present: boolean }>(
    `select exists (
       select 1 from retrieval_chunks
        where user_id = $1
          and organization_id is not distinct from $2::uuid
          and source_kind = any($3::text[])
          and embedding is not null
     ) as present`,
    [scope.userId, scope.organizationId, kinds],
  );
  if (!indexed?.present) return { vector: null, state: 'no_index' };
  try {
    const result = await embedTextsMetered({
      db: scope.db,
      userId: scope.userId,
      organizationId: scope.organizationId,
      texts: [request.text.slice(0, MAX_QUERY_CHARS)],
      purpose: 'query',
      operationKey: `${scope.userId}:${kinds.join(',')}`,
    });
    const vector = result.vectors[0];
    return vector
      ? { vector: toVectorLiteral(vector), state: 'used' }
      : { vector: null, state: 'unavailable' };
  } catch (error) {
    if (!(error instanceof RetrievalEmbeddingError)) throw error;
    logger.info(
      { userId: scope.userId, failure: error.code },
      '[retrieval] query embedding unavailable; ranking by full text only',
    );
    return { vector: null, state: 'unavailable' };
  }
}

function candidateSql(options: {
  lexicalParam: number | null;
  semanticParam: number | null;
}): string {
  const scope = `c.user_id = $1
         and c.organization_id is not distinct from $2::uuid
         and c.source_kind = any($3::text[])
         and ($4::uuid[] is null or c.source_id = any($4::uuid[]))`;
  const ctes: string[] = [];
  const joins: string[] = [];
  const present: string[] = [];
  if (options.lexicalParam !== null) {
    ctes.push(`lexical as (
      select ranked.id, row_number() over (order by ranked.score desc, ranked.id) as rank
        from (
          select c.id, ts_rank_cd(c.search_vector, to_tsquery('simple', $${options.lexicalParam}), 32) as score
            from retrieval_chunks c
           where ${scope}
             and c.search_vector @@ to_tsquery('simple', $${options.lexicalParam})
           order by score desc
           limit $5
        ) ranked
    )`);
    joins.push('left join lexical l on l.id = c.id');
    present.push('l.id is not null');
  }
  if (options.semanticParam !== null) {
    ctes.push(`semantic as (
      select nearest.id, row_number() over (order by nearest.distance, nearest.id) as rank
        from (
          select c.id, c.embedding <=> $${options.semanticParam}::vector as distance
            from retrieval_chunks c
           where ${scope}
             and c.embedding is not null
           order by c.embedding <=> $${options.semanticParam}::vector
           limit $5
        ) nearest
    )`);
    joins.push('left join semantic s on s.id = c.id');
    present.push('s.id is not null');
  }
  return `with ${ctes.join(',\n')}
    select c.id as chunk_id, c.document_id, c.source_kind, c.source_id::text as source_id,
           c.title, c.content, c.start_offset, c.end_offset, c.metadata, c.chunk_version,
           d.indexed_at::text as indexed_at,
           ${options.lexicalParam !== null ? 'l.rank' : 'null'} as lexical_rank,
           ${options.semanticParam !== null ? 's.rank' : 'null'} as semantic_rank
      from retrieval_chunks c
      join retrieval_documents d on d.id = c.document_id
      ${joins.join('\n      ')}
     where ${present.join(' or ')}`;
}

/**
 * Hybrid retrieval over the Postgres index: full text and vector candidates
 * fused by rank and re-scored, inside the caller's row-level-security scope.
 */
export function createPostgresSearchProvider(scope: RetrievalSearchScope): SearchProvider {
  return {
    async search(request: SearchRequest): Promise<SearchResponse> {
      const kinds = (request.kinds ?? SEARCH_SOURCE_KINDS).filter(isSearchSourceKind);
      if (kinds.length === 0 || request.limit <= 0) return { hits: [], semantic: 'unavailable' };
      const tsQuery = buildTsQuery(request.text, request.match);
      const candidateLimit = Math.min(MAX_CANDIDATES, request.limit * CANDIDATE_MULTIPLIER);

      let rows: CandidateRow[];
      let semanticState: SemanticSearchState = 'unavailable';
      try {
        const embedding = await queryEmbedding(scope, request, kinds);
        semanticState = embedding.state;
        if (!tsQuery && !embedding.vector) return { hits: [], semantic: semanticState };
        const params: unknown[] = [
          scope.userId,
          scope.organizationId,
          kinds,
          request.sourceIds && request.sourceIds.length > 0 ? [...request.sourceIds] : null,
          candidateLimit,
        ];
        const lexicalParam = tsQuery ? params.push(tsQuery) : null;
        const semanticParam = embedding.vector ? params.push(embedding.vector) : null;
        const sql = candidateSql({ lexicalParam, semanticParam });
        rows = await scope.db.query<CandidateRow>(sql, params);
      } catch (error) {
        if (isRetrievalSchemaMissing(error)) return { hits: [], semantic: 'unavailable' };
        throw error;
      }

      const candidates: SearchCandidate[] = rows
        .filter((row) => isSearchSourceKind(row.source_kind))
        .map((row) => ({
          chunkId: row.chunk_id,
          documentId: row.document_id,
          sourceKind: row.source_kind as SearchCandidate['sourceKind'],
          sourceId: row.source_id,
          title: row.title,
          text: row.content,
          start: row.start_offset,
          end: row.end_offset,
          metadata: row.metadata ?? {},
          chunkVersion: row.chunk_version,
          indexedAt: row.indexed_at,
          lexicalRank: toRank(row.lexical_rank),
          semanticRank: toRank(row.semantic_rank),
        }));

      return {
        hits: rerankCandidates(request.text, candidates, {
          limit: request.limit,
          ...(request.maxPerSource !== undefined ? { maxPerSource: request.maxPerSource } : {}),
        }),
        semantic: semanticState,
      };
    },
  };
}
