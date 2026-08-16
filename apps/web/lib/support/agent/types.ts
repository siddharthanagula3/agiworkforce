
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
  citations: SupportCitation[];
  proposedActionId: string | null;
  route: SupportRoute;
  handoffOffered: boolean;
}

export interface SupportAbstention {
  kind: 'abstention';
  reason: SupportAbstentionReason;
  text: string;
  authoritativeLinks: SupportCitation[];
  handoffOffered: true;
  route: SupportRoute | null;
}

export type SupportAnswer = SupportAnswerOk | SupportAbstention;

export interface SupportViewer {
  isSignedIn: boolean;
  userId: string | null;
  planTier: string | null;
}

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

export interface CorpusChunk {
  id: string;
  docId: string;
  docTitle: string;
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
