export const SEARCH_SOURCE_KINDS = [
  'project_knowledge',
  'library_file',
  'conversation',
  'artifact',
  'research_report',
  'developer_session',
] as const;

export type SearchSourceKind = (typeof SEARCH_SOURCE_KINDS)[number];

/**
 * Width of every stored embedding. The `retrieval_chunks.embedding` column is
 * declared with this exact width, and a vector of any other width is refused by
 * the database, so changing it is a migration plus a full re-index.
 */
export const RETRIEVAL_EMBEDDING_DIMENSIONS = 1536;

export function isSearchSourceKind(value: unknown): value is SearchSourceKind {
  return typeof value === 'string' && (SEARCH_SOURCE_KINDS as readonly string[]).includes(value);
}

export const SEARCH_MODES = [
  'product',
  'private_knowledge',
  'project',
  'enterprise',
  'code',
  'connector',
  'web',
  'research',
] as const;

export type SearchMode = (typeof SEARCH_MODES)[number];

/**
 * Where a mode reads from. The corpus is what separates product search from
 * retrieval, and both from anything that leaves the workspace.
 */
export type SearchCorpus =
  'workspace_rows' | 'private_index' | 'connector_grant' | 'public_web' | 'multi_step';

/** Who the hits are written for: a person reading a list, or a model reading context. */
export type SearchConsumer = 'person' | 'model';

export type SearchFreshness = 'live' | 'indexed';

export type SearchCitationPolicy = 'required' | 'optional' | 'none';

export type SearchAuthority = 'session' | 'workspace_member' | 'connector_grant';

/**
 * `workspace_region` means the query must be served from the store in the
 * workspace's own data region and refused otherwise, never relocated.
 */
export type SearchResidency = 'workspace_region' | 'external_egress';

export interface SearchModeDeclaration {
  id: SearchMode;
  label: string;
  consumer: SearchConsumer;
  corpus: SearchCorpus;
  freshness: SearchFreshness;
  citations: SearchCitationPolicy;
  authority: SearchAuthority;
  latencyBudgetMs: number;
  residency: SearchResidency;
}

export const SEARCH_MODE_DECLARATIONS: Readonly<Record<SearchMode, SearchModeDeclaration>> =
  Object.freeze({
    product: Object.freeze({
      id: 'product',
      label: 'Product search',
      consumer: 'person',
      corpus: 'workspace_rows',
      freshness: 'live',
      citations: 'none',
      authority: 'session',
      latencyBudgetMs: 1_500,
      residency: 'workspace_region',
    }),
    private_knowledge: Object.freeze({
      id: 'private_knowledge',
      label: 'Private retrieval',
      consumer: 'model',
      corpus: 'private_index',
      freshness: 'indexed',
      citations: 'required',
      authority: 'workspace_member',
      latencyBudgetMs: 3_000,
      residency: 'workspace_region',
    }),
    project: Object.freeze({
      id: 'project',
      label: 'Project knowledge',
      consumer: 'model',
      corpus: 'private_index',
      freshness: 'indexed',
      citations: 'required',
      authority: 'workspace_member',
      latencyBudgetMs: 3_000,
      residency: 'workspace_region',
    }),
    enterprise: Object.freeze({
      id: 'enterprise',
      label: 'Enterprise search',
      consumer: 'person',
      corpus: 'private_index',
      freshness: 'indexed',
      citations: 'required',
      authority: 'workspace_member',
      latencyBudgetMs: 5_000,
      residency: 'workspace_region',
    }),
    code: Object.freeze({
      id: 'code',
      label: 'Code search',
      consumer: 'model',
      corpus: 'private_index',
      freshness: 'indexed',
      citations: 'required',
      authority: 'workspace_member',
      latencyBudgetMs: 3_000,
      residency: 'workspace_region',
    }),
    connector: Object.freeze({
      id: 'connector',
      label: 'Connector search',
      consumer: 'model',
      corpus: 'connector_grant',
      freshness: 'live',
      citations: 'required',
      authority: 'connector_grant',
      latencyBudgetMs: 8_000,
      residency: 'external_egress',
    }),
    web: Object.freeze({
      id: 'web',
      label: 'Web search',
      consumer: 'model',
      corpus: 'public_web',
      freshness: 'live',
      citations: 'required',
      authority: 'session',
      latencyBudgetMs: 10_000,
      residency: 'external_egress',
    }),
    research: Object.freeze({
      id: 'research',
      label: 'Research',
      consumer: 'model',
      corpus: 'multi_step',
      freshness: 'live',
      citations: 'required',
      authority: 'session',
      latencyBudgetMs: 120_000,
      residency: 'external_egress',
    }),
  });

/** What `createPostgresSearchProvider` serves when a caller names no mode. */
export const DEFAULT_PRIVATE_INDEX_SEARCH_MODE: SearchMode = 'private_knowledge';

export function isSearchMode(value: unknown): value is SearchMode {
  return typeof value === 'string' && (SEARCH_MODES as readonly string[]).includes(value);
}

export function searchModeDeclaration(mode: SearchMode): SearchModeDeclaration {
  return SEARCH_MODE_DECLARATIONS[mode];
}

export function searchModesByCorpus(corpus: SearchCorpus): readonly SearchMode[] {
  return SEARCH_MODES.filter((mode) => SEARCH_MODE_DECLARATIONS[mode].corpus === corpus);
}

export const SEARCH_RETRIEVAL_STRATEGIES = ['keyword', 'semantic', 'hybrid'] as const;

export type SearchRetrievalStrategy = (typeof SEARCH_RETRIEVAL_STRATEGIES)[number];

export const DEFAULT_SEARCH_RETRIEVAL_STRATEGY: SearchRetrievalStrategy = 'hybrid';

const LEGACY_STRATEGY_ALIASES: Readonly<Record<string, SearchRetrievalStrategy>> = Object.freeze({
  lexical: 'keyword',
  vector: 'semantic',
});

/** `null` for anything unrecognised so the boundary decides the fallback. */
export function parseSearchRetrievalStrategy(value: unknown): SearchRetrievalStrategy | null {
  if (typeof value !== 'string') return null;
  const lowered = value.trim().toLowerCase();
  if ((SEARCH_RETRIEVAL_STRATEGIES as readonly string[]).includes(lowered)) {
    return lowered as SearchRetrievalStrategy;
  }
  return LEGACY_STRATEGY_ALIASES[lowered] ?? null;
}

export function strategyUsesSemantic(strategy: SearchRetrievalStrategy): boolean {
  return strategy !== 'keyword';
}

export function strategyUsesLexical(strategy: SearchRetrievalStrategy): boolean {
  return strategy !== 'semantic';
}

export interface TextWindow {
  start: number;
  end: number;
  text: string;
}

export interface SearchChunkMetadata {
  messageId?: string;
  role?: string;
  page?: number;
  heading?: string;
  [key: string]: unknown;
}

export interface SearchCandidate {
  chunkId: string;
  documentId: string;
  sourceKind: SearchSourceKind;
  sourceId: string;
  title: string;
  text: string;
  start: number | null;
  end: number | null;
  metadata: SearchChunkMetadata;
  chunkVersion: number;
  indexedAt: string | null;
  lexicalRank: number | null;
  semanticRank: number | null;
}

export interface SearchHit extends SearchCandidate {
  score: number;
  matchedTerms: string[];
}

export type SearchMatchMode = 'all_terms' | 'any_term';

export interface SearchRequest {
  text: string;
  kinds?: readonly SearchSourceKind[];
  sourceIds?: readonly string[];
  limit: number;
  maxPerSource?: number;
  match?: SearchMatchMode;
  mode?: SearchMode;
  strategy?: SearchRetrievalStrategy;
}

export type SemanticSearchState = 'used' | 'no_index' | 'unavailable';

export interface SearchResponse {
  hits: SearchHit[];
  semantic: SemanticSearchState;
}

export interface SearchProvider {
  search(request: SearchRequest): Promise<SearchResponse>;
}

export interface RerankOptions {
  limit: number;
  maxPerSource?: number;
}

/**
 * Scoring and near-duplicate removal, named so it can be swapped for a hosted
 * reranker without the storage layer knowing.
 */
export interface RerankProvider {
  readonly id: string;
  rerank(
    query: string,
    candidates: readonly SearchCandidate[],
    options: RerankOptions,
  ): SearchHit[];
}

/** A named index a search runs against: Postgres today, anything registered tomorrow. */
export interface SearchStorageProvider extends SearchProvider {
  readonly id: string;
}

export interface NamedProvider {
  readonly id: string;
}

export interface ProviderRegistry<T extends NamedProvider> {
  register(provider: T): void;
  unregister(id: string): boolean;
  get(id: string): T | undefined;
  list(): T[];
  ids(): string[];
}

export type EmbeddingPurpose = 'document' | 'query';

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
}

export interface EmbeddingProvider {
  embed(texts: readonly string[], purpose: EmbeddingPurpose): Promise<EmbeddingResult>;
}
