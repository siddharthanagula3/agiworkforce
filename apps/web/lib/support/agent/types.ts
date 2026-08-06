/**
 * Public contract for the grounded support answer engine.
 *
 * This module is the seam the other support builders integrate against. It is
 * intentionally free of `server-only` so the widget can import the TYPES; the
 * implementation modules that touch providers carry `server-only` themselves.
 */

/**
 * A resolved source. `title`/`url`/`snippet` are ALWAYS produced server-side by
 * looking a chunk id up in the retrieved set — the model never emits any of
 * them, so an injected document cannot introduce an attacker-controlled URL.
 */
export interface SupportCitation {
  title: string;
  url: string;
  snippet: string;
  docId: string;
  chunkId: string;
}

export type HardAbstainCategory = 'billing' | 'data_deletion' | 'security' | 'legal';

export type SupportAbstentionReason =
  | 'no_relevant_source'
  | 'hard_abstain_billing'
  | 'hard_abstain_data_deletion'
  | 'hard_abstain_security'
  | 'hard_abstain_legal'
  | 'unverifiable_citation'
  | 'malformed_model_output'
  | 'model_unavailable'
  | 'corpus_unavailable'
  | 'agent_disabled'
  | 'invalid_question';

export interface SupportRoute {
  provider: string;
  modelKey: string;
}

export interface SupportAnswerOk {
  kind: 'answer';
  text: string;
  /** Invariant: length >= 1. An answer with no source is downgraded to an abstention. */
  citations: SupportCitation[];
  /** Always one of `input.availableActions`, else null. The engine executes nothing. */
  proposedActionId: string | null;
  route: SupportRoute;
  handoffOffered: boolean;
}

export interface SupportAbstention {
  kind: 'abstention';
  reason: SupportAbstentionReason;
  text: string;
  authoritativeLinks: SupportCitation[];
  /** Always true: an abstention always offers a human. */
  handoffOffered: true;
  route: SupportRoute | null;
}

export type SupportAnswer = SupportAnswerOk | SupportAbstention;

export interface SupportViewer {
  isSignedIn: boolean;
  userId: string | null;
  planTier: string | null;
}

/**
 * An account fact resolved SERVER-SIDE by the account-context builder from the
 * authenticated session. The answer engine never reads a database and never
 * takes a user id from the model or the client.
 */
export interface SupportAccountFact {
  label: string;
  value: string;
  sourceUrl: string;
}

export interface SupportActionOption {
  id: string;
  title: string;
  description: string;
}

export interface SupportHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface SupportAnswerInput {
  question: string;
  history?: SupportHistoryTurn[];
  surface: 'app' | 'marketing';
  viewer: SupportViewer;
  accountFacts?: SupportAccountFact[];
  availableActions?: SupportActionOption[];
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Corpus / retrieval shapes
// ---------------------------------------------------------------------------

export interface CorpusChunk {
  /** Globally unique within the merged index. */
  id: string;
  docId: string;
  docTitle: string;
  /** Site-relative public route, e.g. `/byok`. Never an authenticated surface. */
  path: string;
  category: string;
  tags: readonly string[];
  heading: string | null;
  headingPath: string;
  text: string;
  origin: 'markdown' | 'static-data';
}

export interface RetrievedChunk {
  chunk: CorpusChunk;
  score: number;
  citation: SupportCitation;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  topScore: number;
  coverage: number;
  matchedTermCount: number;
  queryTermCount: number;
  passedFloor: boolean;
  floorReason: 'ok' | 'empty_query' | 'below_score' | 'below_coverage' | 'corpus_unavailable';
}
