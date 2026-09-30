import { z } from 'zod';

export const SUPPORT_ACCOUNT_CONTEXT_PATH = '/api/support/account/context';
export const SUPPORT_ACTIONS_AVAILABLE_PATH = '/api/support/actions/available';
export const SUPPORT_ACTIONS_PROPOSE_PATH = '/api/support/actions/propose';
export const SUPPORT_ACTIONS_CONFIRM_PATH = '/api/support/actions/confirm';
export const SUPPORT_APPEAL_PATH = '/api/support/appeal';
export const SUPPORT_ASK_PATH = '/api/support/ask';
export const SUPPORT_DIAGNOSTICS_PATH = '/api/support/diagnostics';
export const SUPPORT_HANDOFF_PATH = '/api/support/handoff';
export const SUPPORT_HANDOFF_AVAILABILITY_PATH = '/api/support/handoff/availability';
export const SUPPORT_AGENT_PRESENCE_PATH = '/api/support/handoff/agent/presence';
export const SUPPORT_AGENT_QUEUE_PATH = '/api/support/handoff/agent/queue';
export const SUPPORT_RECOVERY_PATH = '/api/support/recovery';
export const SUPPORT_TICKETS_PATH = '/api/support/tickets';
export const SUPPORT_STAFF_TICKETS_PATH = '/api/support/staff/tickets';

export function supportHandoffPath(sessionId: string): string {
  return `${SUPPORT_HANDOFF_PATH}/${encodeURIComponent(sessionId)}`;
}

export function supportHandoffMessagesPath(sessionId: string): string {
  return `${supportHandoffPath(sessionId)}/messages`;
}

export function supportAgentClaimPath(sessionId: string): string {
  return `${SUPPORT_HANDOFF_PATH}/agent/${encodeURIComponent(sessionId)}/claim`;
}

export function supportAgentMessagesPath(sessionId: string): string {
  return `${SUPPORT_HANDOFF_PATH}/agent/${encodeURIComponent(sessionId)}/messages`;
}

export function supportTicketPath(ticketId: string): string {
  return `${SUPPORT_TICKETS_PATH}/${encodeURIComponent(ticketId)}`;
}

export function supportTicketEscalatePath(ticketId: string): string {
  return `${supportTicketPath(ticketId)}/escalate`;
}

export function supportStaffTicketPath(ticketId: string): string {
  return `${SUPPORT_STAFF_TICKETS_PATH}/${encodeURIComponent(ticketId)}`;
}

export function supportStaffTicketRecoveryPath(ticketId: string): string {
  return `${supportStaffTicketPath(ticketId)}/recovery`;
}

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
  { signedIn: false } | { signedIn: true; planLabel: string | null; facts: SupportAccountFact[] };

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
  { mode: 'link'; label: string; href: string } | { mode: 'post'; label: string; path: string };

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
  | { kind: 'timed_out'; referenceId: string | null; headline: string; detail: string }
  | { kind: 'failed'; message: string };

export interface SupportHandoffMessageView {
  seq: number;
  author: 'user' | 'agent' | 'system';
  body: string;
  at: string;
}

export interface SupportHandoffThreadPage {
  status: string;
  messages: SupportHandoffMessageView[];
  nextAfter: number;
  pollIntervalMs: number;
}

export type SupportHandoffSendResult =
  { ok: true; message: SupportHandoffMessageView } | { ok: false; message: string };

export interface SupportHandoffQueueEntryView {
  sessionId: string;
  referenceId: string;
  summary: string;
  createdAt: string;
  waitExpiresAt: string | null;
  signedIn: boolean;
}

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

export const DIAGNOSTIC_SURFACES = [
  'web',
  'desktop',
  'mobile',
  'cli',
  'extension-chrome',
  'extension-vscode',
] as const;

export type DiagnosticSurface = (typeof DIAGNOSTIC_SURFACES)[number];

export interface DiagnosticEvent {
  at: string;
  kind: 'error' | 'warning' | 'request_failed';
  message: string;
}

export interface SupportDiagnostics {
  collectedAt: string;
  surface: DiagnosticSurface;
  appVersion: string | null;
  releaseSha: string | null;
  deployEnv: string | null;
  platform: string | null;
  locale: string | null;
  timeZone: string | null;
  viewport: { width: number; height: number } | null;
  online: boolean | null;
  pagePath: string | null;
  conversationId: string | null;
  recentEvents: DiagnosticEvent[];
}

export const MAX_DIAGNOSTIC_EVENTS = 10;
export const MAX_DIAGNOSTIC_MESSAGE_CHARS = 500;

export function describeDiagnostics(diagnostics: SupportDiagnostics): string {
  const lines = [
    `surface: ${diagnostics.surface}`,
    `app version: ${diagnostics.appVersion ?? 'unknown'}`,
    `release: ${diagnostics.releaseSha ?? 'unknown'}`,
    `environment: ${diagnostics.deployEnv ?? 'unknown'}`,
    `platform: ${diagnostics.platform ?? 'unknown'}`,
    `locale: ${diagnostics.locale ?? 'unknown'}`,
    `time zone: ${diagnostics.timeZone ?? 'unknown'}`,
    `viewport: ${
      diagnostics.viewport
        ? `${diagnostics.viewport.width}x${diagnostics.viewport.height}`
        : 'unknown'
    }`,
    `online: ${diagnostics.online === null ? 'unknown' : String(diagnostics.online)}`,
    `page: ${diagnostics.pagePath ?? 'unknown'}`,
  ];
  if (diagnostics.recentEvents.length > 0) {
    lines.push('recent events:');
    for (const event of diagnostics.recentEvents) {
      lines.push(`  ${event.at} [${event.kind}] ${event.message}`);
    }
  }
  return lines.join('\n');
}

const diagnosticEventSchema = z
  .object({
    at: z.string().datetime(),
    kind: z.enum(['error', 'warning', 'request_failed']),
    message: z
      .string()
      .trim()
      .min(1)
      .max(MAX_DIAGNOSTIC_MESSAGE_CHARS * 4),
  })
  .strict();

export const supportDiagnosticsSchema = z
  .object({
    collectedAt: z.string().datetime(),
    surface: z.enum(DIAGNOSTIC_SURFACES),
    appVersion: z.string().max(100).nullable(),
    releaseSha: z.string().max(100).nullable(),
    deployEnv: z.string().max(50).nullable(),
    platform: z.string().max(200).nullable(),
    locale: z.string().max(50).nullable(),
    timeZone: z.string().max(100).nullable(),
    viewport: z
      .object({
        width: z.number().int().min(0).max(100_000),
        height: z.number().int().min(0).max(100_000),
      })
      .strict()
      .nullable(),
    online: z.boolean().nullable(),
    pagePath: z.string().max(500).nullable(),
    conversationId: z.string().max(200).nullable(),
    recentEvents: z.array(diagnosticEventSchema).max(MAX_DIAGNOSTIC_EVENTS * 4),
  })
  .strict();

export const MAX_TICKET_SUBJECT_CHARS = 200;
export const MAX_TICKET_MESSAGE_CHARS = 8_000;
export const MAX_TICKETS_LISTED = 50;

export const APPEAL_TICKET_SUBJECT = 'Account suspension appeal';
export const APPEAL_FOLLOW_PATH = '/login';
export const TICKET_FOLLOW_PATH = '/settings/help';

export const RECOVERY_TICKET_SUBJECT = 'Account recovery request';
export const RECOVERY_FOLLOW_PATH = '/recover';

export function ticketFollowPath(subject: string): string {
  if (subject === APPEAL_TICKET_SUBJECT) return APPEAL_FOLLOW_PATH;
  if (subject === RECOVERY_TICKET_SUBJECT) return RECOVERY_FOLLOW_PATH;
  return TICKET_FOLLOW_PATH;
}

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUS_LABEL: Readonly<Record<TicketStatus, string>> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const TICKET_STATUS_MEANING: Readonly<Record<TicketStatus, string>> = {
  open: 'Raised. Nobody on the support team has replied yet.',
  in_progress: 'The support team has picked this up.',
  resolved: 'Answered. Replying here reopens it if it is not actually fixed.',
  closed: 'Finished. Raise a new ticket and reference this one to carry on.',
};

export const OPEN_TICKET_STATUSES: readonly TicketStatus[] = ['open', 'in_progress', 'resolved'];

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && (TICKET_STATUSES as readonly string[]).includes(value);
}

export function isTicketPriority(value: unknown): value is TicketPriority {
  return typeof value === 'string' && (TICKET_PRIORITIES as readonly string[]).includes(value);
}

export interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  status: TicketStatus;
  priority: TicketPriority;
  supportTier: string | null;
  handoffSessionId: string | null;
  diagnostics: SupportDiagnostics | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export const MAX_ESCALATION_SUMMARY_CHARS = 4_000;

export const ESCALATION_SEVERITIES = ['p0', 'p1', 'p2', 'p3'] as const;
export const ESCALATION_TRACKERS = ['on-call', 'support-engineering'] as const;

export type EscalationSeverity = (typeof ESCALATION_SEVERITIES)[number];
export type EscalationTracker = (typeof ESCALATION_TRACKERS)[number];
export type EscalationPageOutcome = 'paged' | 'unconfigured' | 'failed';

const PRIORITY_SEVERITY: Readonly<Record<TicketPriority, EscalationSeverity>> = Object.freeze({
  urgent: 'p0',
  high: 'p1',
  normal: 'p2',
  low: 'p3',
});

export function severityForPriority(priority: TicketPriority): EscalationSeverity {
  return PRIORITY_SEVERITY[priority];
}

export function pagesOnCall(severity: EscalationSeverity): boolean {
  return severity === 'p0' || severity === 'p1';
}

export function isEscalationTracker(value: unknown): value is EscalationTracker {
  return typeof value === 'string' && (ESCALATION_TRACKERS as readonly string[]).includes(value);
}

export interface TicketEscalation {
  id: string;
  ticketId: string;
  referenceId: string;
  severity: EscalationSeverity;
  summary: string;
  escalatedByUserId: string;
  tracker: EscalationTracker;
  pagedAt: string | null;
  pageOutcome: EscalationPageOutcome | null;
  responders: readonly string[];
  resolvedAt: string | null;
  createdAt: string;
}

export interface SupportTicketReply {
  id: string;
  ticketId: string;
  message: string;
  isStaff: boolean;
  createdAt: string;
}

export interface SupportTicketThread {
  ticket: SupportTicket;
  replies: SupportTicketReply[];
}

export interface SupportTicketListResponse {
  tickets: SupportTicket[];
}

export interface OpenedSupportTicket {
  ticket: SupportTicket;
  staffNotified: boolean;
}

export const STAFF_QUEUE_PAGE_SIZE = 25;
export const STAFF_QUEUE_PATH = '/operator#support';

export const STAFF_QUEUE_STATUSES: readonly TicketStatus[] = ['open', 'in_progress'];

export interface StaffSupportTicket extends SupportTicket {
  userId: string;
  email: string;
}

export interface StaffTicketPage {
  tickets: StaffSupportTicket[];
  nextOffset: number | null;
}

export interface StaffTicketThread {
  ticket: StaffSupportTicket;
  replies: SupportTicketReply[];
}

export function statusAfterStaffReply(from: TicketStatus, resolve: boolean): TicketStatus {
  if (resolve) return 'resolved';
  return from === 'open' ? 'in_progress' : from;
}

export const CUSTOMER_SETTABLE_STATUSES = ['closed'] as const;

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  if (from === 'closed') return false;
  if (from === 'resolved') return to === 'closed' || to === 'in_progress';
  return true;
}

export const HANDOFF_SURFACES = ['web-app', 'marketing'] as const;

export type HandoffSurface = (typeof HANDOFF_SURFACES)[number];

export const HANDOFF_REASONS = [
  'user_requested',
  'hard_abstain',
  'low_confidence',
  'no_citation',
  'action_refused',
] as const;

export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export type HandoffStatus =
  | 'waiting'
  | 'connected'
  | 'closed'
  | 'emailed'
  | 'timed_out_emailed'
  | 'cancelled'
  | 'undeliverable';

export type HandoffAvailabilityReason =
  'live' | 'not_configured' | 'disabled' | 'no_agents_online' | 'at_capacity';

export interface HandoffFallbackChannel {
  channel: 'email';
  address: string;
  expectedReply: string;
  configured: boolean;
}

export interface HandoffAvailability {
  live: boolean;
  reason: HandoffAvailabilityReason;
  headline: string;
  detail: string;
  fallback: HandoffFallbackChannel;
  waitTimeoutSeconds: number;
  pollIntervalMs: number;
  checkedAt: string;
}

export interface HandoffTranscriptTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  at: string;
}

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
  summary: string;
  transcript: HandoffTranscriptTurn[];
  attemptedActions?: HandoffAttemptedAction[];
  citations?: HandoffCitation[];
  contactEmail?: string;
  conversationId?: string;
  pagePath?: string;
  locale?: string;
  diagnostics?: SupportDiagnostics;
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
      mailtoHref: string;
      nextStep: HandoffNextStep;
    };

export interface HandoffStatusResponse {
  sessionId: string;
  referenceId: string;
  status: HandoffStatus;
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
  nextAfter: number;
  pollIntervalMs: number;
}

export interface HandoffAccountContext {
  signedIn: boolean;
  userId: string | null;
  planTier: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  usagePercentage: number | null;
  usageResetAt: string | null;
  hasUsageRemaining: boolean | null;
  degraded?: string;
}

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
  expiresAt: string | null;
  heartbeatIntervalMs: number;
}

export interface SupportAccountUsage {
  usagePercentage: number;
  sessionUsagePercentage: number;
  weeklyUsagePercentage: number;
  flagshipWeeklyUsagePercentage: number;
  usageResetAt: string | null;
  sessionResetAt: string | null;
  weeklyResetAt: string | null;
  hasUsageRemaining: boolean;
}

export interface SupportAccountPlan {
  tier: string;
  effectiveTier: string;
  displayName: string;
  status: string;
  currentPeriodEnd: string | null;
  subscriptionSource: 'stripe' | 'apple' | 'google' | 'manual' | 'none';
}

export interface SupportAccountConnector {
  id: string;
  connectorId: string;
  source: 'user' | 'github-app' | 'custom';
  connectedAt: string | null;
}

export interface SupportAccountApiKeys {
  activeCount: number;
  atCeiling: boolean;
}

export interface SupportAccountEmail {
  present: boolean;
  verified: 'verified' | 'unverified' | 'unknown';
}

export interface SupportAccountCitation {
  id: string;
  label: string;
  href: string;
}

export interface SupportAccountContext {
  plan: SupportAccountPlan;
  usage: SupportAccountUsage | null;
  connectors: SupportAccountConnector[];
  apiKeys: SupportAccountApiKeys;
  email: SupportAccountEmail;
  resolvedAt: string;
}

export interface ModelSafeAccountFacts {
  plan_tier: string;
  effective_plan_tier: string;
  subscription_status: string;
  subscription_source: string;
  current_period_end: string | null;
  usage_percentage: number | null;
  session_usage_percentage: number | null;
  weekly_usage_percentage: number | null;
  flagship_weekly_usage_percentage: number | null;
  usage_reset_at: string | null;
  has_usage_remaining: boolean | null;
  connector_ids: string[];
  connector_count: number;
  active_api_key_count: number;
  api_key_at_ceiling: boolean;
  email_verification_state: 'verified' | 'unverified' | 'unknown';
}

export interface SupportAvailableActionOption {
  id: string;
  title: string;
  description: string;
}

export interface SupportAvailableActionsResponse {
  actions: SupportAvailableActionOption[];
  unavailable: { id: string; reason: string }[];
  excluded: { id: string; reason: string; control: { label: string; href: string } }[];
}

export interface SupportAccountContextResponse {
  context: SupportAccountContext;
  facts: ModelSafeAccountFacts;
  citations: SupportAccountCitation[];
}

export const RECOVERY_LOSSES = ['password', 'email', 'factor'] as const;

export type RecoveryLoss = (typeof RECOVERY_LOSSES)[number];

export const RECOVERY_ACTIONS = ['remove_second_factor', 'replace_email'] as const;

export type RecoveryAction = (typeof RECOVERY_ACTIONS)[number];

const SUPPORT_ACTION_SURFACES = ['web', 'marketing'] as const;

export const SupportActionProposeRequestSchema = z
  .object({
    actionId: z.string().min(1).max(64),
    params: z.record(z.string(), z.unknown()).optional(),
    surface: z.enum(SUPPORT_ACTION_SURFACES).optional(),
    conversationRef: z.string().max(128).optional(),
  })
  .strip();

export const SupportActionConfirmRequestSchema = z
  .object({
    proposalId: z.string().uuid(),
    confirmationToken: z.string().min(20).max(200),
    surface: z.enum(SUPPORT_ACTION_SURFACES).optional(),
  })
  .strip();

export const SupportAppealRequestSchema = z.object({
  message: z.string().trim().min(1).max(MAX_TICKET_MESSAGE_CHARS),
  email: z.string().trim().email().max(254).optional(),
});

export const SupportAskRequestSchema = z.object({
  message: z.string().trim().min(1).max(SUPPORT_MAX_QUESTION_LENGTH),
  surface: z.enum(['marketing', 'app']),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) }))
    .max(50)
    .optional(),
});

export const SupportDiagnosticsExportRequestSchema = z.object({ diagnostics: z.unknown() });

const SupportHandoffTurnSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(20_000),
  at: z.string().max(40),
});

export const SupportHandoffRequestSchema = z.object({
  surface: z.enum(HANDOFF_SURFACES),
  reason: z.enum(HANDOFF_REASONS),
  summary: z.string().trim().min(1).max(1_000),
  transcript: z.array(SupportHandoffTurnSchema).max(500),
  attemptedActions: z
    .array(
      z.object({
        action: z.string().max(200),
        outcome: z.enum(['succeeded', 'failed', 'refused', 'confirmation_pending']),
        detail: z.string().max(2_000).optional(),
        at: z.string().max(40),
      }),
    )
    .max(100)
    .optional(),
  citations: z
    .array(z.object({ title: z.string().max(300), url: z.string().max(2_000) }))
    .max(50)
    .optional(),
  contactEmail: z.string().trim().max(254).optional(),
  conversationId: z.string().max(200).optional(),
  pagePath: z.string().max(2_000).optional(),
  locale: z.string().max(35).optional(),
  diagnostics: z.unknown().optional(),
});

export type SupportHandoffRequest = z.infer<typeof SupportHandoffRequestSchema>;

export const SupportHandoffMessageRequestSchema = z.object({
  body: z.string().trim().min(1).max(4_000),
});

export const SupportAgentPresenceRequestSchema = z.object({
  status: z.enum(['online', 'offline']),
  displayName: z.string().trim().min(1).max(60),
  maxConcurrentSessions: z.number().int().min(0).max(50).optional(),
});

export const SupportRecoveryRequestSchema = z
  .object({
    accountEmail: z.string().trim().email().max(254),
    contactEmail: z.string().trim().email().max(254),
    lost: z.enum(RECOVERY_LOSSES),
    details: z.string().trim().min(1).max(MAX_TICKET_MESSAGE_CHARS),
  })
  .strict();

export const SupportStaffTicketsQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export const SupportTicketIdSchema = z.string().uuid();

export const SupportStaffTicketReplyRequestSchema = z
  .object({
    reply: z.string().trim().min(1).max(MAX_TICKET_MESSAGE_CHARS),
    resolve: z.boolean().default(false),
  })
  .strict();

export const SupportStaffTicketRecoveryRequestSchema = z
  .object({
    action: z.enum(RECOVERY_ACTIONS),
    email: z.string().trim().email().max(254).optional(),
  })
  .strict();

export const SupportTicketCreateRequestSchema = z.object({
  subject: z.string().trim().min(1).max(MAX_TICKET_SUBJECT_CHARS),
  message: z.string().trim().min(1).max(MAX_TICKET_MESSAGE_CHARS),
  handoffSessionId: z.string().uuid().optional(),
  diagnostics: z.unknown().optional(),
});

export const SupportTicketPatchRequestSchema = z.union([
  z.object({ status: z.enum(CUSTOMER_SETTABLE_STATUSES) }).strict(),
  z.object({ reply: z.string().trim().min(1).max(MAX_TICKET_MESSAGE_CHARS) }).strict(),
]);

export const SupportTicketEscalateRequestSchema = z
  .object({
    summary: z.string().trim().min(1).max(MAX_ESCALATION_SUMMARY_CHARS),
    tracker: z.enum(ESCALATION_TRACKERS).optional(),
  })
  .strict();
