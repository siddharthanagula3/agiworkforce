import type { InviteCodeError } from './types';

/** Maps typed error codes to user-visible strings. Never pattern-match prose. */
export function friendlyInviteError(code: InviteCodeError): string {
  switch (code) {
    case 'invalid_code':
      return 'That code is not valid. Check for typos and try again.';
    case 'expired':
      return 'This invitation code has expired.';
    case 'fully_redeemed':
      return 'This invitation code has already been fully used.';
    case 'already_redeemed_by_user':
      return 'You have already redeemed an invitation code.';
    case 'anon_signin_failed':
      return 'Could not create an anonymous session. Check your network and try again.';
    case 'account_auth_not_wired':
      return 'AGI Cloud sign-in is not available in the VS Code extension yet. Use AGI Web for invite access.';
    case 'rpc_error':
      return 'A server error occurred. Please try again later.';
  }
}
