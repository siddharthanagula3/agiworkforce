/**
 * @file Types for the bounded support-action layer.
 *
 * BLAST RADIUS, STATED ONCE:
 *   - Nothing acts by inference. `SupportActionId` is a closed union and the
 *     registry is a frozen record keyed by it.
 *   - Everything here is SAFE and REVERSIBLE. Destructive or irreversible
 *     operations live in `excluded.ts`, are never proposable, and are answered
 *     with an explanation plus a link to the real control.
 *   - Every action is scoped to the authenticated caller server-side. No shape
 *     in this file carries a target user id, because no code path may accept one.
 */

import type { AuditEventType } from '@/lib/security-audit';

/**
 * The complete action allowlist. Adding a member here is a deliberate act:
 * the registry is exhaustively typed over this union, so a new id will not
 * compile until it has params validation, a plain-language description, an
 * availability probe, a rate limit and an audit event type.
 */
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

/**
 * How the effect actually happens.
 *   'server'  — this layer performs the mutation itself.
 *   'handoff' — this layer authorizes and records, then returns a SERVER-DEFINED
 *               endpoint descriptor the client invokes under the same session.
 *               Used where an existing, already-audited route owns the effect
 *               (data export, billing portal) so we neither duplicate nor
 *               modify it.
 */
export type SupportActionExecution = 'server' | 'handoff';

export interface SupportActionAvailability {
  available: boolean;
  /** Plain-language reason, shown to the user when unavailable. */
  reason?: string;
}

export interface SupportActionDescription {
  /** One sentence: what will happen, in plain language. */
  summary: string;
  /** Bullet points. Rendered verbatim; the model never writes these. */
  effects: string[];
  /** Why this is safe to undo. */
  reversibleNote: string;
}

/** A server-issued descriptor for a `handoff` action. Never client-supplied. */
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
   * on the audit path only — nothing protects a transcript path.
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

/** Non-fatal, expected refusals. Every one of these is a 2xx-shaped decision. */
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
  /**
   * Existing enterprise audit vocabulary. There is no
   * `support_action_proposed` / `support_action_denied` value yet — that is a
   * dependency on the concurrent audit-logging workflow. Until it lands, a
   * denial rides the nearest business event with `outcome: 'denied'` and
   * `detail.source = 'support_agent'`, which is honest but coarser than it
   * should be. `record.ts` is the single change point.
   */
  proposeEventType: AuditEventType;
  executeEventType: AuditEventType;
  resourceType: string;
}
