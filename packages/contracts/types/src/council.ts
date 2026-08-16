/**
 * Council Types
 *
 * Types for the multi-model council / consensus system. The council
 * sends the same query to multiple LLMs, collects their responses,
 * and synthesizes a consensus answer. Used for high-stakes decisions
 * where diverse model perspectives improve accuracy.
 *
 * @module council
 * @packageDocumentation
 */

/**
 * A single model's response in a council deliberation.
 *
 * Each participating model produces a vote with its answer, confidence,
 * and reasoning. The council synthesizer aggregates these into a final response.
 *
 * @example
 * ```typescript
 * const vote: ModelVote = {
 *   modelId: selectedModel.id,
 *   provider: selectedModel.provider,
 *   response: 'The optimal approach is to use a B+ tree index...',
 *   confidence: 0.92,
 *   reasoning: 'Based on the query patterns described, a B+ tree provides...',
 *   latencyMs: 2500,
 *   tokenCount: 450,
 *   cost: 0.034,
 * };
 * ```
 */
export interface ModelVote {
  modelId: string;

  provider: string;

  response: string;

  confidence: number;

  reasoning?: string;

  latencyMs?: number;

  tokenCount?: number;

  cost?: number;

  agreedWithConsensus?: boolean;

  error?: string;
}

/**
 * A query submitted to the multi-model council.
 *
 * @example
 * ```typescript
 * const query: CouncilQuery = {
 *   id: 'council-abc',
 *   query: 'What database indexing strategy should we use for this schema?',
 *   context: 'We have a PostgreSQL database with 50M rows...',
 *   models: councilModels.map(({ id, provider }) => ({ modelId: id, provider })),
 *   consensusThreshold: 0.7,
 * };
 * ```
 */
export interface CouncilQuery {
  id: string;

  query: string;

  context?: string;

  systemPrompt?: string;

  models: Array<{
    modelId: string;
    provider: string;
    weight?: number;
  }>;

  consensusThreshold?: number;

  timeoutMs?: number;

  temperature?: number;
}

/**
 * The aggregated response from a council deliberation.
 *
 * @example
 * ```typescript
 * const response: CouncilResponse = {
 *   id: 'council-resp-abc',
 *   queryId: 'council-abc',
 *   consensus: 'Use a composite B+ tree index on (user_id, created_at)...',
 *   confidenceScore: 0.89,
 *   votes: [vote1, vote2, vote3],
 *   agreementLevel: 0.85,
 *   dissent: 'One voter suggested a hash index instead, but was outvoted...',
 *   status: 'completed',
 *   totalLatencyMs: 4200,
 *   totalCost: 0.092,
 *   createdAt: '2026-03-15T10:30:00Z',
 * };
 * ```
 */
export interface CouncilResponse {
  id: string;

  queryId: string;

  consensus: string;

  confidenceScore: number;

  votes: ModelVote[];

  agreementLevel: number;

  dissent?: string;

  status: 'pending' | 'deliberating' | 'completed' | 'failed' | 'timeout';

  totalLatencyMs?: number;

  totalCost?: number;

  error?: string;

  createdAt: string;
}
