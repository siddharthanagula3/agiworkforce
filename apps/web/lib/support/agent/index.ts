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
