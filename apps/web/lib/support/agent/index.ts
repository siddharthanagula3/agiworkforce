/**
 * Support agent — grounded answers, structural citations, first-class abstention.
 *
 * The one entry point is `answerSupportQuestion`. Everything else exported here
 * exists so the other support builders do not duplicate work:
 *
 *   - `retrieveSupportChunks` — the escalation builder's "what the agent already
 *     tried" transcript.
 *   - `classifyHardAbstain` / `SUPPORT_ABSTAIN_CATEGORIES` — the widget can
 *     pre-empt a pointless round trip. The server classifies again regardless;
 *     a client-side check is never the gate.
 *   - `authoritativeCitations` — the widget renders the same links the engine
 *     attaches to an abstention.
 *
 * Boundaries this module holds:
 *   - it reads no database and imports no user data,
 *   - it executes no action; it only echoes back a validated action id,
 *   - every citation URL is `SITE_URL` + a corpus-declared public path.
 *
 * `answerSupportQuestion` is server-only (it reaches the provider layer).
 * The types and the pure policy helpers are safe to import anywhere.
 */

export { answerSupportQuestion } from './answer/synthesize';
export { retrieveSupportChunks, buildCitation } from './retrieval/retrieve';
export {
  classifyHardAbstain,
  SUPPORT_ABSTAIN_CATEGORIES,
  HARD_ABSTAIN_REASON,
  HARD_ABSTAIN_COPY,
} from './policy/hard-abstain';
export {
  AUTHORITATIVE_LINKS,
  ALL_AUTHORITATIVE_PATHS,
  authoritativeCitations,
} from './policy/authoritative-links';
export {
  MIN_ABSOLUTE_SCORE,
  MIN_TERM_COVERAGE,
  MIN_MATCHED_TERMS,
  evaluateRelevanceFloor,
} from './policy/relevance-floor';
export { getSupportCorpus } from './corpus';
export { isSupportAgentEnabled } from './answer/model-route';

export type {
  SupportAnswer,
  SupportAnswerOk,
  SupportAbstention,
  SupportAbstentionReason,
  SupportAnswerInput,
  SupportCitation,
  SupportViewer,
  SupportAccountFact,
  SupportActionOption,
  SupportHistoryTurn,
  SupportRoute,
  HardAbstainCategory,
  CorpusChunk,
  RetrievedChunk,
  RetrievalResult,
} from './types';
