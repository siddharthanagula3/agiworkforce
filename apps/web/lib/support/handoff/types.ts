/**
 * @file types.ts
 * @module lib/support/handoff/types
 *
 * The wire contract for support escalation ("talk to a human"), shared by the
 * support widget, the answer engine, and the action layer.
 *
 * # The invariant this contract exists to enforce
 *
 * A support widget that says "connecting you to an agent" and never connects is
 * worse than having no bot at all. Every type below is shaped so that promise
 * cannot be made unless it is backed:
 *
 *   - `HandoffCreateResponse` has NO `connecting` variant. The only live variant
 *     is `mode: 'live'`, and it REQUIRES both a `sessionId` (a persisted row) and
 *     a `waitExpiresAt` (a deadline). A waiting state without an end is
 *     unrepresentable in the type, unrepresentable in the database (see the
 *     `support_handoff_waiting_has_deadline` CHECK in the migration), and
 *     unrepresentable at runtime.
 *   - Every response carries server-authored `headline` / `detail` strings. The
 *     UI renders them verbatim; it never composes reassurance of its own. A
 *     surface therefore cannot type "an agent will be with you shortly" unless
 *     the server decided that is true.
 *   - Every status maps to a non-empty `nextStep`. There is no terminal state
 *     that leaves the user with nothing to do.
 *   - A `referenceId` is returned in ALL modes, including the fully degraded one,
 *     because the row exists either way and a human sweeping the table must be
 *     able to find it.
 */

/** Where the escalation was raised from. */
export type HandoffSurface = 'web-app' | 'marketing';

/** Why the agent escalated. `hard_abstain` covers the four refuse-to-guess categories. */
export type HandoffReason =
  | 'user_requested'
  | 'hard_abstain'
  | 'low_confidence'
  | 'no_citation'
  | 'action_refused';

/**
 * Lifecycle of one escalation. Deliberately has no `connecting`:
 * a session is either `waiting` (with a deadline) or it is not live.
 */
export type HandoffStatus =
  | 'waiting'
  | 'connected'
  | 'closed'
  | 'emailed'
  | 'timed_out_emailed'
  | 'cancelled'
  | 'undeliverable';

/** Why live chat is or is not on offer. Surfaced so the UI can be specific. */
export type HandoffAvailabilityReason =
  | 'live'
  | 'not_configured'
  | 'disabled'
  | 'no_agents_online'
  | 'at_capacity';

export interface HandoffFallbackChannel {
  channel: 'email';
  /** The address the transcript is mailed to. */
  address: string;
  /** Plain-language reply expectation, e.g. "within one business day". */
  expectedReply: string;
  /**
   * False when no email provider is configured. The UI must then degrade to a
   * plain mailto: and must NOT claim anything was sent.
   */
  configured: boolean;
}

export interface HandoffAvailability {
  live: boolean;
  reason: HandoffAvailabilityReason;
  /** Render verbatim. e.g. "No one is available right now". */
  headline: string;
  /** Render verbatim. */
  detail: string;
  fallback: HandoffFallbackChannel;
  /** How long a live wait is allowed to last before it converts to email. */
  waitTimeoutSeconds: number;
  /** Server-dictated poll cadence. The client obeys it; it does not choose one. */
  pollIntervalMs: number;
  checkedAt: string;
}

export interface HandoffTranscriptTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** ISO timestamp. */
  at: string;
}

/** What the agent already tried, so the human does not retread it. */
export interface HandoffAttemptedAction {
  action: string;
  outcome: 'succeeded' | 'failed' | 'refused' | 'confirmation_pending';
  detail?: string;
  at: string;
}

export interface HandoffCitation {
  title: string;
  url: string;
}

export interface HandoffCreateRequest {
  surface: HandoffSurface;
  reason: HandoffReason;
  /** One-line agent summary of the problem. */
  summary: string;
  transcript: HandoffTranscriptTurn[];
  attemptedActions?: HandoffAttemptedAction[];
  citations?: HandoffCitation[];
  /** Required when signed out. IGNORED when signed in — Clerk's address wins. */
  contactEmail?: string;
  conversationId?: string;
  pagePath?: string;
  locale?: string;
}

export interface HandoffNextStep {
  kind: 'wait' | 'email_sent' | 'closed' | 'retry' | 'contact';
  label: string;
  href?: string;
}

export type HandoffCreateResponse =
  | {
      mode: 'live';
      sessionId: string;
      referenceId: string;
      status: 'waiting';
      /** REQUIRED. A live wait without a deadline is the bug this whole module prevents. */
      waitExpiresAt: string;
      waitTimeoutSeconds: number;
      pollIntervalMs: number;
      onTimeout: 'email_fallback';
      headline: string;
      detail: string;
      nextStep: HandoffNextStep;
    }
  | {
      mode: 'email';
      referenceId: string;
      status: 'emailed';
      emailedTo: string;
      expectedReply: string;
      headline: string;
      detail: string;
      nextStep: HandoffNextStep;
    }
  | {
      mode: 'unavailable';
      referenceId: string;
      status: 'undeliverable';
      headline: string;
      detail: string;
      /** Prefilled mailto carrying the reference id — the last honest resort. */
      mailtoHref: string;
      nextStep: HandoffNextStep;
    };

export interface HandoffStatusResponse {
  sessionId: string;
  referenceId: string;
  status: HandoffStatus;
  /** First name only. Never an email address or a user id. */
  agentDisplayName?: string;
  waitExpiresAt?: string;
  pollIntervalMs: number;
  headline: string;
  detail: string;
  nextStep: HandoffNextStep;
  emailedTo?: string;
  expectedReply?: string;
}

export interface HandoffMessage {
  seq: number;
  author: 'user' | 'agent' | 'system';
  body: string;
  at: string;
}

export interface HandoffMessagesResponse {
  sessionId: string;
  status: HandoffStatus;
  messages: HandoffMessage[];
  /** Pass back as `?after=` on the next poll. */
  nextAfter: number;
  pollIntervalMs: number;
}

/** Server-derived account context. NEVER client-supplied. */
export interface HandoffAccountContext {
  signedIn: boolean;
  userId: string | null;
  planTier: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  usagePercentage: number | null;
  usageResetAt: string | null;
  hasUsageRemaining: boolean | null;
  /** Non-fatal note when a lookup timed out or failed, so the human knows it is missing, not zero. */
  degraded?: string;
}

/** Queue row shown to a human agent. */
export interface HandoffQueueEntry {
  sessionId: string;
  referenceId: string;
  surface: HandoffSurface;
  reason: HandoffReason;
  summary: string;
  createdAt: string;
  waitExpiresAt: string | null;
  signedIn: boolean;
}

/**
 * The claim payload. This is what makes "the user never repeats themselves"
 * true: the human receives the whole context in the claim response.
 */
export interface HandoffClaimResponse {
  sessionId: string;
  referenceId: string;
  status: 'connected';
  summary: string;
  reason: HandoffReason;
  surface: HandoffSurface;
  transcript: HandoffTranscriptTurn[];
  attemptedActions: HandoffAttemptedAction[];
  citations: HandoffCitation[];
  accountContext: HandoffAccountContext;
  contactEmail: string;
  pollIntervalMs: number;
}

export interface HandoffPresenceState {
  agentUserId: string;
  displayName: string;
  status: 'online' | 'offline';
  maxConcurrentSessions: number;
  lastHeartbeatAt: string | null;
  /** When this presence goes stale without another heartbeat. */
  expiresAt: string | null;
  heartbeatIntervalMs: number;
}
