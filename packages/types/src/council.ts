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

// ============================================================================
// Model Vote
// ============================================================================

/**
 * A single model's response in a council deliberation.
 *
 * Each participating model produces a vote with its answer, confidence,
 * and reasoning. The council synthesizer aggregates these into a final response.
 *
 * @example
 * ```typescript
 * const vote: ModelVote = {
 *   modelId: 'claude-opus-4-6',
 *   provider: 'anthropic',
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
  /** Model identifier that produced this vote. */
  modelId: string;

  /** Provider of the model. */
  provider: string;

  /** The model's response content. */
  response: string;

  /** Confidence score (0.0 to 1.0) in the response. */
  confidence: number;

  /** Reasoning or chain-of-thought behind the response. */
  reasoning?: string;

  /** Response latency in milliseconds. */
  latencyMs?: number;

  /** Total tokens used for this vote (input + output). */
  tokenCount?: number;

  /** Cost in USD for this vote. */
  cost?: number;

  /** Whether this model agreed with the final consensus. */
  agreedWithConsensus?: boolean;

  /** Error message if the model failed to respond. */
  error?: string;
}

// ============================================================================
// Council Query
// ============================================================================

/**
 * A query submitted to the multi-model council.
 *
 * @example
 * ```typescript
 * const query: CouncilQuery = {
 *   id: 'council-abc',
 *   query: 'What database indexing strategy should we use for this schema?',
 *   context: 'We have a PostgreSQL database with 50M rows...',
 *   models: [
 *     { modelId: 'claude-opus-4-6', provider: 'anthropic' },
 *     { modelId: 'gpt-4o', provider: 'openai' },
 *     { modelId: 'gemini-2.5-pro', provider: 'google' },
 *   ],
 *   consensusThreshold: 0.7,
 * };
 * ```
 */
export interface CouncilQuery {
  /** Unique council query identifier. */
  id: string;

  /** The question or task for the council. */
  query: string;

  /** Additional context provided to all models. */
  context?: string;

  /** System prompt override for all council members. */
  systemPrompt?: string;

  /** Models participating in the council. Minimum 2. */
  models: Array<{
    /** Model identifier. */
    modelId: string;
    /** Provider identifier. */
    provider: string;
    /** Optional weight for this model's vote (default: 1.0). */
    weight?: number;
  }>;

  /** Minimum agreement threshold (0.0 to 1.0) to declare consensus. */
  consensusThreshold?: number;

  /** Maximum time to wait for all votes (milliseconds). */
  timeoutMs?: number;

  /** Sampling temperature for all models. */
  temperature?: number;
}

// ============================================================================
// Council Response
// ============================================================================

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
 *   dissent: 'GPT-4o suggested a hash index instead, but was outvoted...',
 *   status: 'completed',
 *   totalLatencyMs: 4200,
 *   totalCost: 0.092,
 *   createdAt: '2026-03-15T10:30:00Z',
 * };
 * ```
 */
export interface CouncilResponse {
  /** Unique response identifier. */
  id: string;

  /** Query that produced this response. */
  queryId: string;

  /** Synthesized consensus answer. */
  consensus: string;

  /** Overall confidence score (0.0 to 1.0) of the consensus. */
  confidenceScore: number;

  /** Individual model votes. */
  votes: ModelVote[];

  /** Agreement level among models (0.0 to 1.0). */
  agreementLevel: number;

  /** Summary of dissenting opinions (if any). */
  dissent?: string;

  /** Council deliberation status. */
  status: 'pending' | 'deliberating' | 'completed' | 'failed' | 'timeout';

  /** Total wall-clock time for the council deliberation in milliseconds. */
  totalLatencyMs?: number;

  /** Total cost of all model invocations in USD. */
  totalCost?: number;

  /** Error message if status is `'failed'`. */
  error?: string;

  /** ISO 8601 timestamp when the response was created. */
  createdAt: string;
}
