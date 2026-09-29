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
  type SearchSourceKind,
  type SemanticSearchState,
} from '@agiworkforce/data-layer/search';
import { DEFAULT_DATA_REGION, normaliseDataRegion } from '@agiworkforce/compliance';

import { retrievalQueryMayCarryGoogleUserData } from '@/lib/connectors/google-user-data-runs';
import {
  googleUserDataConnectorRefs,
  retrievalDocumentGoogleUserDataSql,
} from '@/lib/connectors/google-user-data';
import { logger } from '@/lib/logger';
import { readOrganizationRegion } from '@/lib/server/data-region';
import {
  embedTextsMetered,
  RetrievalEmbeddingError,
} from '@/lib/services/retrieval-embedding-service';
import { toVectorLiteral } from '@/lib/services/retrieval-index-service';
import { recordVectorQuery } from '@/lib/services/infrastructure-cost';

const VECTOR_STORE_PROVIDER = 'neon';

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
  healthSpaceProjectId?: string | null;
  includeHealthSpaces?: boolean;
  /**
   * Whether documents holding Google user data are searched. They are left out
   * unless the caller serves results only to models that keep inputs out of
   * training, or only to the account itself.
   */
  googleUserData?: 'exclude' | 'include';
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
  google_user_data: boolean | null;
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
      forceNoTraining: await retrievalQueryMayCarryGoogleUserData(scope.db, scope.userId),
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
  healthSpaceParam: number | null;
  googleRefsParam: number;
  excludeGoogleUserData: boolean;
}): string {
  const googleUserData = retrievalDocumentGoogleUserDataSql({
    document: 'd',
    artifact: 'artifact',
    report: 'report',
    asset: 'asset',
    connectorRefsParam: options.googleRefsParam,
  });
  const scope = `c.user_id = $1
         and c.organization_id is not distinct from $2::uuid
         and c.source_kind = any($3::text[])
         and ($4::uuid[] is null or c.source_id = any($4::uuid[]))${
           options.healthSpaceParam !== null
             ? '\n         and c.document_id not in (select id from health_space_documents)'
             : ''
         }`;
  const ctes: string[] =
    options.healthSpaceParam !== null ? [healthSpaceDocuments(options.healthSpaceParam)] : [];
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
           ${options.semanticParam !== null ? 's.rank' : 'null'} as semantic_rank,
           ${googleUserData} as google_user_data
      from retrieval_chunks c
      join retrieval_documents d on d.id = c.document_id
      left join web_artifacts artifact on artifact.id = d.artifact_id
      left join research_reports report on report.id = d.research_report_id
      left join web_conversations origin
        on origin.id = coalesce(
          d.conversation_id,
          artifact.conversation_id,
          report.conversation_id
        )
      left join media_assets asset on asset.id = d.media_asset_id
      ${joins.join('\n      ')}
     where (${present.join(' or ')})
       and c.user_id = $1
       and c.organization_id is not distinct from $2::uuid
       and artifact.deleted_at is null
       and origin.deleted_at is null
       and coalesce(origin.is_temporary, false) = false
       and asset.deleted_at is null
       and coalesce(asset.temporary_chat, false) = false${
         options.excludeGoogleUserData ? `\n       and not ${googleUserData}` : ''
       }`;
}

function healthSpaceDocuments(param: number): string {
  return `health_space_documents as (
      select document.id
        from retrieval_documents document
        join user_projects space
          on space.user_id = document.user_id
         and space.space_kind = 'health'
         and space.id is distinct from $${param}::uuid
        left join project_knowledge_files knowledge
          on knowledge.id = document.project_knowledge_file_id
        left join web_artifacts artifact on artifact.id = document.artifact_id
        left join research_reports report on report.id = document.research_report_id
        left join media_assets asset on asset.id = document.media_asset_id
        left join web_conversations origin
          on origin.id = coalesce(
            document.conversation_id,
            artifact.conversation_id,
            report.conversation_id,
            asset.conversation_id
          )
       where document.user_id = $1
         and space.id::text in (knowledge.project_id::text, origin.project_id)
    )`;
}

export interface IndexedSourceText {
  sourceId: string;
  sourceKind: SearchSourceKind;
  title: string;
  text: string;
  truncated: boolean;
  googleUserData: boolean;
}

interface IndexedSourceChunkRow {
  google_user_data: boolean | null;
  source_kind: string;
  title: string;
  content: string;
  start_offset: number | null;
  end_offset: number | null;
  document_end: number | string | null;
}

/**
 * One indexed source read whole, in order, from the current chunk version,
 * under the same scope as search: the caller's own rows, never a deleted or
 * temporary origin, and never another health space's documents. Overlapping
 * chunk windows are joined once.
 */
export async function readIndexedSourceText(
  scope: Pick<RetrievalSearchScope, 'db' | 'userId' | 'organizationId' | 'healthSpaceProjectId'>,
  request: { sourceId: string; kinds: readonly SearchSourceKind[]; maxChars: number },
): Promise<IndexedSourceText | null> {
  let rows: IndexedSourceChunkRow[];
  try {
    // Only the chunks that start inside the cap leave the database. Windows
    // overlap, so a chunk's place is its start offset, not the characters
    // before it, and document_end says whether the file goes on past them.
    rows = await scope.db.query<IndexedSourceChunkRow>(
      `with ${healthSpaceDocuments(5)},
      ordered as (
        select c.chunk_index, c.source_kind, c.title, c.content, c.start_offset, c.end_offset,
               ${retrievalDocumentGoogleUserDataSql({
                 document: 'd',
                 artifact: 'artifact',
                 report: 'report',
                 asset: 'asset',
                 connectorRefsParam: 7,
               })} as google_user_data,
               coalesce(sum(char_length(c.content)) over (
                 order by c.chunk_index rows between unbounded preceding and 1 preceding
               ), 0) as chars_before,
               char_length(c.content) as chars
          from retrieval_chunks c
          join retrieval_documents d on d.id = c.document_id and d.chunk_version = c.chunk_version
          left join web_artifacts artifact on artifact.id = d.artifact_id
          left join research_reports report on report.id = d.research_report_id
          left join web_conversations origin
            on origin.id = coalesce(d.conversation_id, artifact.conversation_id, report.conversation_id)
          left join media_assets asset on asset.id = d.media_asset_id
         where c.user_id = $1
           and c.organization_id is not distinct from $2::uuid
           and c.source_kind = any($3::text[])
           and c.source_id = $4::uuid
           and c.document_id not in (select id from health_space_documents)
           and artifact.deleted_at is null
           and origin.deleted_at is null
           and coalesce(origin.is_temporary, false) = false
           and asset.deleted_at is null
           and coalesce(asset.temporary_chat, false) = false
      ),
      positioned as (
        select ordered.*,
               coalesce(start_offset, chars_before) as position,
               max(coalesce(end_offset, chars_before + chars)) over () as document_end
          from ordered
      )
      select google_user_data, source_kind, title, content, start_offset, end_offset, document_end
        from positioned
       where position <= $6
       order by chunk_index`,
      [
        scope.userId,
        scope.organizationId,
        [...request.kinds],
        request.sourceId,
        scope.healthSpaceProjectId ?? null,
        request.maxChars,
        googleUserDataConnectorRefs(),
      ],
    );
  } catch (error) {
    if (isRetrievalSchemaMissing(error)) return null;
    throw error;
  }
  const first = rows[0];
  if (!first || !isSearchSourceKind(first.source_kind)) return null;

  let text = '';
  let covered = -1;
  for (const row of rows) {
    if (row.start_offset === null || covered < 0) {
      text += (text ? '\n\n' : '') + row.content;
    } else {
      text += row.content.slice(Math.max(0, covered - row.start_offset));
    }
    covered = row.end_offset ?? -1;
    if (text.length > request.maxChars) break;
  }
  const truncated =
    text.length > request.maxChars || Number(first.document_end ?? 0) > request.maxChars;
  return {
    sourceId: request.sourceId,
    sourceKind: first.source_kind,
    title: first.title,
    text: truncated ? text.slice(0, request.maxChars) : text,
    truncated,
    googleUserData: rows.some((row) => row.google_user_data !== false),
  };
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
        const healthSpaceParam = scope.includeHealthSpaces
          ? null
          : params.push(scope.healthSpaceProjectId ?? null);
        const googleRefsParam = params.push(googleUserDataConnectorRefs());
        const sql = candidateSql({
          lexicalParam,
          semanticParam,
          healthSpaceParam,
          googleRefsParam,
          excludeGoogleUserData: scope.googleUserData !== 'include',
        });
        rows = await scope.db.query<CandidateRow>(sql, params);
        if (semanticParam !== null) {
          recordVectorQuery({
            userId: scope.userId,
            organizationId: scope.organizationId,
            provider: VECTOR_STORE_PROVIDER,
          });
        }
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
          metadata:
            row.google_user_data === true
              ? { ...(row.metadata ?? {}), googleUserData: true }
              : (row.metadata ?? {}),
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
