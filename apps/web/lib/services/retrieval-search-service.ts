import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEFAULT_PRIVATE_INDEX_SEARCH_MODE,
  DEFAULT_SEARCH_RETRIEVAL_STRATEGY,
  SEARCH_SOURCE_KINDS,
  assertSearchResidency,
  isSearchSourceKind,
  rerankCandidates,
  searchModeDeclaration,
  searchModesByCorpus,
  strategyUsesLexical,
  strategyUsesSemantic,
  type SearchCandidate,
  type SearchChunkMetadata,
  type SearchMode,
  type SearchProvider,
  type SearchRequest,
  type SearchResidencyState,
  type SearchResponse,
  type SearchRetrievalStrategy,
  type SemanticSearchState,
} from '@agiworkforce/data-layer/search';
import { DEFAULT_DATA_REGION, normaliseDataRegion } from '@agiworkforce/compliance';

import { logger } from '@/lib/logger';
import { readOrganizationRegion } from '@/lib/server/data-region';
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
  env?: Record<string, string | undefined>;
  residency?: SearchResidencyState;
}

const PRIVATE_INDEX_MODES = searchModesByCorpus('private_index');

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

function assertPrivateIndexMode(mode: SearchMode): void {
  if (searchModeDeclaration(mode).corpus === 'private_index') return;
  throw new Error(
    `Search mode "${mode}" reads the ${searchModeDeclaration(mode).corpus} corpus and cannot be ` +
      `served by the private index. Modes this provider serves: ${PRIVATE_INDEX_MODES.join(', ')}.`,
  );
}

/**
 * The workspace's pinned region against the region this deployment answers from.
 * A handle that cannot be asked returns a null origin, which refuses.
 */
export async function resolveRetrievalResidency(input: {
  db: RetrievalSearchScope['db'];
  organizationId: string | null;
  env?: Record<string, string | undefined>;
}): Promise<SearchResidencyState> {
  const env = input.env ?? process.env;
  const executing = normaliseDataRegion(env['AGI_DATA_REGION']) ?? DEFAULT_DATA_REGION;
  if (!input.organizationId) {
    return { origin: executing, executing, provisioned: true, missing: [] };
  }
  // readOrganizationRegion reads one row through `query`, which every scoped
  // handle carries even when it is narrower than the full adapter.
  const state = await readOrganizationRegion(
    input.db as DatabaseAdapter,
    input.organizationId,
    env,
  );
  return {
    origin: state.effective,
    executing,
    provisioned: state.provisioned,
    missing: state.missing,
  };
}

async function queryEmbedding(
  scope: RetrievalSearchScope,
  request: SearchRequest,
  kinds: readonly string[],
  strategy: SearchRetrievalStrategy,
): Promise<{ vector: string | null; state: SemanticSearchState }> {
  if (!scope.semantic || !strategyUsesSemantic(strategy) || !isFullAdapter(scope.db)) {
    return { vector: null, state: 'unavailable' };
  }
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
      const mode = request.mode ?? DEFAULT_PRIVATE_INDEX_SEARCH_MODE;
      assertPrivateIndexMode(mode);
      const kinds = (request.kinds ?? SEARCH_SOURCE_KINDS).filter(isSearchSourceKind);
      if (kinds.length === 0 || request.limit <= 0) return { hits: [], semantic: 'unavailable' };
      assertSearchResidency(
        mode,
        scope.residency ??
          (await resolveRetrievalResidency({
            db: scope.db,
            organizationId: scope.organizationId,
            ...(scope.env ? { env: scope.env } : {}),
          })),
      );

      const strategy = request.strategy ?? DEFAULT_SEARCH_RETRIEVAL_STRATEGY;
      const tsQuery = strategyUsesLexical(strategy)
        ? buildTsQuery(request.text, request.match)
        : null;
      const candidateLimit = Math.min(MAX_CANDIDATES, request.limit * CANDIDATE_MULTIPLIER);

      let rows: CandidateRow[];
      let semanticState: SemanticSearchState = 'unavailable';
      try {
        const embedding = await queryEmbedding(scope, request, kinds, strategy);
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
