/**
 * Internal types for the @agiworkforce/routing package.
 *
 * The public taxonomy `RoutingTaskType` lives in
 * `@agiworkforce/types/runtime.ts` and is re-exported below for convenience.
 *
 * @module routing/types
 * @packageDocumentation
 */

import type { RoutingTaskType } from '@agiworkforce/types';

/** Re-export the canonical 11-value task taxonomy. */
export type { RoutingTaskType } from '@agiworkforce/types';

// ============================================================================
// Classifier inputs
// ============================================================================

/**
 * Minimal message shape consumed by the classifier.
 *
 * The classifier never reads message text in production aggregations — it only
 * reads from the provided `history` for token-budget estimation and for the
 * 5-turn sticky-pivot conversation context. Keep this as narrow as possible
 * so call sites are not forced to over-fetch fields.
 */
export interface RoutingMessage {
  /** Who produced this message. */
  role: 'user' | 'assistant' | 'system' | 'tool';

  /** Plain-text representation of the message body. */
  content: string;

  /**
   * Pre-classified task type for prior turns. Used by `applyConversationContext`
   * to compute the running mode over the last 3 turns. Omit for new turns
   * where the classifier has not yet run.
   */
  taskType?: RoutingTaskType;

  /**
   * Confidence (0..1) attached to the prior classification. Used by
   * `applyConversationContext` to decide whether a new high-confidence
   * pivot can override the running mode.
   */
  taskTypeConfidence?: number;
}

/**
 * Minimal attachment shape consumed by the classifier.
 *
 * The classifier inspects only `mime` and the synthetic `type` discriminator
 * (e.g., `'screenshot'` for computer-use signal). MIME prefix matching
 * (`image/`, `video/`) routes to multimodal.
 */
export interface RoutingAttachment {
  /** MIME type; matched as a prefix string (e.g. `"image/png"`, `"video/mp4"`). */
  mime: string;

  /**
   * Optional discriminator that distinguishes a desktop / browser screenshot
   * from a regular image attachment. Computer-use intent only fires when
   * `'screenshot'` is set AND the message contains an automation verb.
   */
  type?: 'screenshot' | 'image' | 'video' | 'document' | 'audio' | string;
}

// ============================================================================
// Classifier output
// ============================================================================

/** Result returned by `classifyTaskLocally`. */
export interface ClassifierResult {
  /** Task bucket selected from the 11-value canonical taxonomy. */
  type: RoutingTaskType;

  /** Confidence in [0, 1]. */
  confidence: number;
}

// ============================================================================
// Conversation context
// ============================================================================

/**
 * Snapshot of conversation state used by `applyConversationContext`.
 *
 * Constructed once per turn from the active conversation history and the
 * outgoing user message; the classifier then merges it with the local
 * heuristic result.
 */
export interface ConversationContext {
  /**
   * Cumulative token estimate across the entire conversation INCLUDING the
   * outgoing user turn. Pre-computed via `estimateTokens` so the classifier
   * itself can stay synchronous.
   */
  cumulativeTokens: number;

  /**
   * Most recent task types from prior turns, ordered oldest → newest. Only
   * the LAST 3 entries are inspected by the sticky-pivot logic; longer
   * arrays are tolerated and silently truncated by the consumer.
   */
  recentTaskTypes: ReadonlyArray<RoutingTaskType>;
}
