import type {
  EscalationPageOutcome,
  EscalationSeverity,
  EscalationTracker,
  SupportDiagnostics,
  TicketPriority,
} from '@agiworkforce/cloud-contracts/support';

export interface CreateEscalationInput {
  ticketId: string;
  referenceId: string;
  severity: EscalationSeverity;
  summary: string;
  escalatedByUserId: string;
  tracker: EscalationTracker;
  pagedAt: string | null;
  pageOutcome: EscalationPageOutcome | null;
  responders: readonly string[];
}

export interface CreateTicketInput {
  userId: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  priority: TicketPriority;
  supportTier: string | null;
  handoffSessionId: string | null;
  diagnostics: SupportDiagnostics | null;
}
