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

export interface InviteCodeModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Which feature surface opened this modal. Used for waitlist source analytics
   * and post-redeem routing decisions.
   */
  source: InviteCodeSource;
  /** Which tab opens first. Defaults to 'invite'. */
  defaultTab?: InviteCodeTab;
  /** Called after a successful invite-code redemption. Receives the invite record id. */
  onRedeemed?: (inviteId: string) => void;
  /** Called after a successful waitlist signup. Receives the submitted email. */
  onWaitlisted?: (email: string) => void;
}
