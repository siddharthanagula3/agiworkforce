export type SupportSurface = 'marketing' | 'app';

export interface SupportCitation {
  id: string;
  title: string;
  url: string;
  snippet?: string;
}

export const SUPPORT_ABSTENTION_REASONS = [
  'no_relevant_source',
  'hard_abstain_billing',
  'hard_abstain_data_deletion',
  'hard_abstain_security',
  'hard_abstain_legal',
  'unverifiable_citation',
  'malformed_model_output',
  'model_unavailable',
  'corpus_unavailable',
  'no_source',
  'unrecognized_response',
  'transport_error',
  'not_available',
] as const;

export type SupportAbstentionReason = (typeof SUPPORT_ABSTENTION_REASONS)[number];

export const SUPPORT_HARD_ABSTAIN_REASONS = [
  'hard_abstain_billing',
  'hard_abstain_data_deletion',
  'hard_abstain_security',
  'hard_abstain_legal',
] as const;

export interface SupportAnswerView {
  kind: 'answer';
  text: string;
  citations: SupportCitation[];
  proposedActionId: string | null;
}

export interface SupportAbstentionView {
  kind: 'abstention';
  reason: SupportAbstentionReason;
  text: string;
  citations: SupportCitation[];
  escalationOffered: true;
}

export type SupportReplyView = SupportAnswerView | SupportAbstentionView;

export interface SupportAccountFact {
  label: string;
  value: string;
}

export type SupportAccountContextView =
  | { signedIn: false }
  | { signedIn: true; planLabel: string | null; facts: SupportAccountFact[] };

export interface SupportAvailableAction {
  id: string;
  title: string;
}

export interface SupportActionProposal {
  proposalId: string;
  actionId: string;
  title: string;
  summary: string;
  effects: string[];
  reversible: boolean;
  expiresAt: string | null;
  confirmationToken: string;
}

export interface SupportRefusedAction {
  actionId: string;
  explanation: string;
  control: { label: string; href: string } | null;
}

export type SupportProposeResult =
  | { kind: 'proposal'; proposal: SupportActionProposal }
  | { kind: 'refused'; refusal: SupportRefusedAction }
  | { kind: 'unavailable'; message: string }
  | { kind: 'error'; message: string };

export type SupportActionFollowUp =
  | { mode: 'link'; label: string; href: string }
  | { mode: 'post'; label: string; path: string };

export type SupportActionOutcome =
  | {
      kind: 'ok';
      message: string;
      followUp: SupportActionFollowUp | null;
      secret?: { label: string; value: string };
    }
  | { kind: 'denied'; message: string }
  | { kind: 'failed'; message: string };

export interface SupportPresenceView {
  live: boolean;
  headline: string;
  detail: string;
  fallback: {
    address: string;
    expectedReply: string;
    configured: boolean;
  };
  waitTimeoutSeconds: number;
  pollIntervalMs: number;
}

export const UNAVAILABLE_PRESENCE: SupportPresenceView = {
  live: false,
  headline: 'No one is on live chat right now.',
  detail: 'I can send this conversation to the support team instead.',
  fallback: { address: '', expectedReply: '', configured: false },
  waitTimeoutSeconds: 120,
  pollIntervalMs: 5000,
};

export type SupportHandoffView =
  | {
      kind: 'waiting';
      sessionId: string;
      referenceId: string;
      waitExpiresAt: string;
      pollIntervalMs: number;
      headline: string;
      detail: string;
    }
  | {
      kind: 'connected';
      sessionId: string;
      referenceId: string;
      agentDisplayName: string | null;
      pollIntervalMs: number;
      headline: string;
      detail: string;
    }
  | {
      kind: 'emailed';
      referenceId: string;
      emailedTo: string;
      expectedReply: string;
      headline: string;
      detail: string;
    }
  | {
      kind: 'undeliverable';
      referenceId: string | null;
      headline: string;
      detail: string;
      mailtoHref: string | null;
    }
  | { kind: 'closed'; referenceId: string | null; headline: string; detail: string }
  /**
   * The client-side deadline elapsed and the server had not moved the session
   * on. The widget stops rendering a waiting state here NO MATTER WHAT the poll
   * says, this is the third of the three independent enforcers (client
   * deadline, server-on-poll transition, cron sweep) and the only one that
   * still works when the server is wedged.
   */
  | { kind: 'timed_out'; referenceId: string | null; headline: string; detail: string }
  | { kind: 'failed'; message: string };

export interface SupportUserTurn {
  id: string;
  role: 'user';
  text: string;
}

export interface SupportAssistantTurn {
  id: string;
  role: 'assistant';
  reply: SupportReplyView;
}

export type SupportTurn = SupportUserTurn | SupportAssistantTurn;

export const SUPPORT_MAX_QUESTION_LENGTH = 2000;
export const SUPPORT_HISTORY_LIMIT = 6;
