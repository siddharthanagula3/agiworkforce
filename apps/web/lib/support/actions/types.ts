import type { AuditEventType } from '@/lib/security-audit';

export type SupportActionId =
  | 'resend_verification_email'
  | 'revoke_connector'
  | 'regenerate_api_key'
  | 'export_account_data'
  | 'open_billing_portal';

export const SUPPORT_ACTION_IDS: readonly SupportActionId[] = Object.freeze([
  'resend_verification_email',
  'revoke_connector',
  'regenerate_api_key',
  'export_account_data',
  'open_billing_portal',
]);

export type SupportActionSurface = 'web' | 'marketing';

export type SupportActionExecution = 'server' | 'handoff';

export interface SupportActionAvailability {
  available: boolean;
  reason?: string;
}

export interface SupportActionDescription {
  summary: string;
  effects: string[];
  reversibleNote: string;
}

export interface SupportActionEndpoint {
  method: 'GET' | 'POST';
  path: string;
}

export type SupportActionResult =
  | { kind: 'completed'; message: string }
  /**
   * CARRIES LIVE CREDENTIAL MATERIAL.
   *
   * `fullKey` must be rendered once in the UI and MUST NOT be written into a
   * support transcript, an escalation email, an audit detail, or any model
   * prompt. `sanitizeAuditDetail` redacts sk_live_-shaped values as a backstop
   * on the audit path only, nothing protects a transcript path.
   */
  | {
      kind: 'secret_once';
      message: string;
      apiKey: { id: string; name: string; keyPrefix: string };
      fullKey: string;
      doNotPersist: true;
    }
  | { kind: 'handoff'; message: string; request: SupportActionEndpoint };

export interface SupportActionProposalView {
  id: string;
  actionId: SupportActionId;
  title: string;
  summary: string;
  effects: string[];
  reversible: true;
  expiresAt: string;
}

export interface SupportActionOption {
  id: SupportActionId;
  title: string;
  description: string;
}

export type SupportActionRefusalCode =
  | 'SUPPORT_ACTION_UNKNOWN'
  | 'SUPPORT_ACTION_EXCLUDED'
  | 'SUPPORT_ACTION_UNAVAILABLE'
  | 'SUPPORT_ACTION_TARGET_NOT_FOUND'
  | 'SUPPORT_ACTION_INVALID_PARAMS'
  | 'SUPPORT_ACTION_PROPOSAL_SPENT'
  | 'SUPPORT_ACTION_RATE_LIMITED';

export class SupportActionRefusal extends Error {
  readonly code: SupportActionRefusalCode;
  readonly status: number;
  readonly control?: { label: string; href: string };
  readonly explain?: string;

  constructor(
    code: SupportActionRefusalCode,
    status: number,
    message: string,
    extra?: { control?: { label: string; href: string }; explain?: string },
  ) {
    super(message);
    this.name = 'SupportActionRefusal';
    this.code = code;
    this.status = status;
    if (extra?.control) this.control = extra.control;
    if (extra?.explain) this.explain = extra.explain;
  }
}

export interface SupportActionAuditBinding {
  proposeEventType: AuditEventType;
  executeEventType: AuditEventType;
  resourceType: string;
}
