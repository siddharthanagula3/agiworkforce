/**
 * Support widget wire contract + view models.
 *
 * OWNERSHIP NOTE. The widget owns none of the endpoints it calls. Three other
 * builders own them:
 *   - `POST /api/support/ask`                    — answer engine (retrieval + abstention)
 *   - `GET  /api/support/account/context`        — account-context builder
 *   - `GET  /api/support/actions/available`      — action builder
 *   - `POST /api/support/actions/propose`        — action builder
 *   - `POST /api/support/actions/confirm`        — action builder
 *   - `GET  /api/support/handoff/availability`   — handoff builder
 *   - `POST /api/support/handoff`                — handoff builder
 *   - `GET  /api/support/handoff/{sessionId}`    — handoff builder
 *
 * Therefore this file declares the shapes the widget *expects*, and every
 * response is parsed defensively in `normalize-answer.ts` / `support-client.ts`
 * rather than cast. Contract drift between builders is a certainty (the answer
 * engine calls its citation fields `title`/`url`; the account builder calls
 * them `label`/`href`), so the parsers accept both spellings and anything they
 * cannot understand degrades to an abstention with a human-handoff offer — never
 * to a blank bubble and never to a confident-looking reply.
 *
 * INVARIANTS THIS MODULE EXISTS TO ENFORCE
 *  1. An answer with zero citations is not renderable as an answer.
 *  2. A citation URL that is not same-origin-relative or http(s) is not
 *     renderable as a link.
 *  3. No response shape can produce an action that executes without a second,
 *     explicit user click.
 */

export type SupportSurface = 'marketing' | 'app';

/** Normalized citation. `url` is always safe to put in an href (see isSafeCitationUrl). */
export interface SupportCitation {
  id: string;
  title: string;
  url: string;
  snippet?: string;
}

/**
 * Abstention reasons. The first block mirrors the answer engine's published
 * union; the second block is widget-local and covers the cases where the
 * *transport or the payload itself* failed — those must still read as an
 * abstention rather than an error toast, because the user asked a question and
 * deserves an honest "I won't guess" plus a route to a human.
 */
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
  // widget-local
  'no_source',
  'unrecognized_response',
  'transport_error',
  'not_available',
] as const;

export type SupportAbstentionReason = (typeof SUPPORT_ABSTENTION_REASONS)[number];

/** The four categories the founder made hard-abstain. Rendered with a named heading. */
export const SUPPORT_HARD_ABSTAIN_REASONS = [
  'hard_abstain_billing',
  'hard_abstain_data_deletion',
  'hard_abstain_security',
  'hard_abstain_legal',
] as const;

export interface SupportAnswerView {
  kind: 'answer';
  text: string;
  /** Invariant: length >= 1. An empty array is impossible — normalizeAnswer coerces it. */
  citations: SupportCitation[];
  proposedActionId: string | null;
}

export interface SupportAbstentionView {
  kind: 'abstention';
  reason: SupportAbstentionReason;
  /** Server-authored where available, otherwise the local fallback for `reason`. */
  text: string;
  /** Authoritative links (may legitimately be empty — an abstention makes no claim). */
  citations: SupportCitation[];
  /** Always true. Every abstention offers a human. */
  escalationOffered: true;
}

export type SupportReplyView = SupportAnswerView | SupportAbstentionView;

/* ------------------------------------------------------------------ *
 * Account context (signed-in only)
 * ------------------------------------------------------------------ */

export interface SupportAccountFact {
  label: string;
  value: string;
}

export type SupportAccountContextView =
  | { signedIn: false }
  | { signedIn: true; planLabel: string | null; facts: SupportAccountFact[] };

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

/** What `/api/support/actions/available` advertises, normalized. */
export interface SupportAvailableAction {
  id: string;
  title: string;
}

/** A server-authored, single-use proposal. `summary`/`effects` are NEVER model text. */
export interface SupportActionProposal {
  proposalId: string;
  actionId: string;
  title: string;
  summary: string;
  effects: string[];
  reversible: boolean;
  expiresAt: string | null;
  /**
   * Server-minted, single-use. The ONLY identifier the client sends back.
   * The client never sends a user id, connector id, key id, or any target.
   */
  confirmationToken: string;
}

/** A destructive/irreversible intent the action layer refuses to run. */
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

/**
 * A follow-up the user may click AFTER a successful action. `post` exists
 * because two allowlisted actions (data export, billing portal) are executed by
 * their own already-audited routes; the widget never follows a server-supplied
 * endpoint automatically, only on a further explicit click, and only when the
 * path is same-origin under `/api/`.
 */
export type SupportActionFollowUp =
  | { mode: 'link'; label: string; href: string }
  | { mode: 'post'; label: string; path: string };

export type SupportActionOutcome =
  | {
      kind: 'ok';
      message: string;
      followUp: SupportActionFollowUp | null;
      /**
       * Live credential material, shown exactly once.
       *
       * CONTRACT (from the action builder, restated because it is load-bearing):
       * this value must never be written into the transcript, the escalation
       * email, an audit record, or a model prompt. The widget keeps it in a
       * separate slice of state that `buildHandoffTranscript` cannot reach.
       */
      secret?: { label: string; value: string };
    }
  | { kind: 'denied'; message: string }
  | { kind: 'failed'; message: string };

/* ------------------------------------------------------------------ *
 * Handoff / presence
 * ------------------------------------------------------------------ */

export interface SupportPresenceView {
  /** Default false. Only a successful response may raise this. */
  live: boolean;
  headline: string;
  detail: string;
  fallback: {
    /** Empty string when the server did not supply one — the UI must not invent an address. */
    address: string;
    expectedReply: string;
    configured: boolean;
  };
  waitTimeoutSeconds: number;
  pollIntervalMs: number;
}

/**
 * The state the widget assumes before — and instead of — any successful
 * presence response. Fetch failure, 404, malformed body and "not configured"
 * all land here, so an unstaffed or half-deployed install degrades honestly.
 */
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
      /** REQUIRED. A waiting state without a deadline is the bug this feature exists to avoid. */
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
   * says — this is the third of the three independent enforcers (client
   * deadline, server-on-poll transition, cron sweep) and the only one that
   * still works when the server is wedged.
   */
  | { kind: 'timed_out'; referenceId: string | null; headline: string; detail: string }
  | { kind: 'failed'; message: string };

/* ------------------------------------------------------------------ *
 * Transcript
 * ------------------------------------------------------------------ */

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
/** How many prior turns travel back to the server. The server must re-truncate. */
export const SUPPORT_HISTORY_LIMIT = 6;
