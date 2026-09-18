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
