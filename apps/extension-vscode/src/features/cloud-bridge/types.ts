/** Cross-surface contract types for the cloud-bridge invite-code modal. */

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

export type InviteCodeError =
  | 'invalid_code'
  | 'expired'
  | 'fully_redeemed'
  | 'already_redeemed_by_user'
  | 'anon_signin_failed'
  | 'account_auth_not_wired'
  | 'rpc_error';

export interface InviteCodeModalProps {
  source: InviteCodeSource;
  defaultTab?: InviteCodeTab;
  onRedeemed?: (inviteId: string) => void;
  onWaitlisted?: (email: string) => void;
}
