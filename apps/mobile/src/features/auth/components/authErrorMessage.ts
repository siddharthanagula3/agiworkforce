import { classifyAuthError } from '@agiworkforce/client-runtime';

type AuthAction = 'sign-in' | 'sign-up' | 'send-code';

export function isNativeAppleCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ERR_REQUEST_CANCELED'
  );
}

export function authErrorMessage(error: unknown, action: AuthAction): string {
  switch (classifyAuthError(error).kind) {
    case 'rate_limited':
      return 'Too many attempts. Try again later.';
    case 'code_expired':
      return 'That code expired. Send a new code.';
    case 'code_incorrect':
      return 'That code is incorrect. Check the latest email and try again.';
    case 'link_expired':
    case 'link_already_used':
      return 'That sign-in link is no longer valid. Start again.';
    case 'account_suspended':
      return 'This account is suspended. Contact support for help.';
    case 'account_locked':
      return 'This account is temporarily locked. Try again later.';
    case 'credentials_invalid':
      return 'The email and password do not match. Try again.';
    case 'identifier_not_found':
      return 'No account uses this email.';
    case 'identifier_exists':
      return 'This email already has an account.';
    case 'provider_cancelled':
    case 'passkey_dismissed':
      return 'Sign-in was cancelled. Try again when ready.';
    case 'provider_outage':
      return 'The sign-in provider is unavailable. Try another way.';
    case 'passkey_unrecognized':
      return 'This passkey was not recognized. Use email instead.';
    case 'network_unreachable':
      return 'Could not reach the server. Check your connection and try again.';
    case 'unexpected':
      return action === 'send-code'
        ? "We couldn't send a code. Try again."
        : action === 'sign-up'
          ? 'Could not complete sign-up. Try again.'
          : 'Could not complete sign-in. Try again.';
  }
}
