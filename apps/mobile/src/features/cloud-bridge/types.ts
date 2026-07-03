export type InviteCodeSource =
  | 'connectors'
  | 'shared-links'
  | 'team-plan'
  | 'cloud-history'
  | 'research-panel'
  | 'cloud-sync'
  | 'web-search'
  | 'computer-use'
  | 'quick-mode'
  | 'other';

export type InviteCodeTab = 'invite' | 'waitlist';

/** Typed error codes returned by the validate_and_redeem_invite_code RPC. Cross-surface contract. */
export type InviteCodeError =
  | 'invalid_code'
  | 'expired'
  | 'fully_redeemed'
  | 'already_redeemed_by_user'
  | 'anon_signin_failed'
  | 'rpc_error';

export interface InviteCodeModalProps {
  open: boolean;
  onClose: () => void;
  source: InviteCodeSource;
  defaultTab?: InviteCodeTab;
  onRedeemed?: (inviteId: string) => void;
  onWaitlisted?: (email: string) => void;
  /**
   * Header copy override. Managed Cloud itself is public alpha (open by
   * sign-in, no invite/waitlist) — this modal now only gates individual
   * unshipped features (Connectors, Shared Links, Skills, paid Billing,
   * hosted code environments). Callers should describe the specific
   * feature; the default text does not claim "AGI Cloud" broadly is
   * invite-only.
   */
  title?: string;
  body?: string;
  /**
   * Waitlist-confirmed copy override. Defaults to "We'll email you when AGI
   * Cloud is ready" which is wrong for callers gating a specific feature
   * (e.g. paid upgrades) on a Cloud-enabled account — Cloud itself is
   * already available.
   */
  waitlistConfirmedBody?: string;
}
