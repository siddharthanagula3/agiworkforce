/**
 * Cross-surface cloud-bridge type contract.
 * Must stay in sync with apps/desktop/src/features/cloud-bridge/types.ts.
 */

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
  | 'rpc_error';

export interface InviteCodeModalProps {
  open: boolean;
  onClose: () => void;
  source: InviteCodeSource;
  defaultTab?: InviteCodeTab;
  onRedeemed?: (inviteId: string) => void;
  onWaitlisted?: (email: string) => void;
}
