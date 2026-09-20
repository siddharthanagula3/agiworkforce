export const ACCOUNT_STATUSES = [
  'active',
  'locked',
  'recovery_pending',
  'suspended',
  'banned',
  'deletion_scheduled',
  'deleted',
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export type AccountDenialReason = 'locked' | 'recovery' | 'suspended' | 'deleted';

export interface AccountAccessAllowed {
  allowed: true;
}

export interface AccountAccessDenied {
  allowed: false;
  reason: AccountDenialReason;
  recoveryPath: string | null;
  message: string;
}

/** The page each denial is actually resolved on; an erasure has none by design. */
export const LOCKOUT_RECOVERY_PATH = '/auth/reset-password';
export const SUSPENSION_APPEAL_PATH = '/support';

/** A denial needs a heading and a control, not only the sentence a 403 carries. */
export interface AccountDenialNotice {
  title: string;
  action: string;
}

export const ACCOUNT_DENIAL_NOTICE: Readonly<Record<AccountDenialReason, AccountDenialNotice>> = {
  locked: { title: 'This account is locked', action: 'Reset your password' },
  recovery: { title: 'Finish recovering this account', action: 'Continue recovery' },
  suspended: { title: 'This account is suspended', action: 'Contact support' },
  deleted: { title: 'This account has been deleted', action: 'Back to sign-in' },
};

export type AccountAccessDecision = AccountAccessAllowed | AccountAccessDenied;

const ALLOWED: AccountAccessAllowed = { allowed: true };

export function isAccountStatus(value: string | null): value is AccountStatus {
  return value !== null && (ACCOUNT_STATUSES as readonly string[]).includes(value);
}

export interface AccountLifecycleFacts {
  status: string | null;
  deletionScheduled: boolean;
  erased: boolean;
}

/**
 * Two states no column holds: 0071 records a scheduled deletion as a date and
 * erasure leaves only a tombstone (0103). An erasure outranks every other state.
 */
export function effectiveAccountStatus(facts: AccountLifecycleFacts): AccountStatus | null {
  if (facts.erased) return 'deleted';
  if (isAccountStatus(facts.status) && facts.status !== 'active') return facts.status;
  if (facts.deletionScheduled) return 'deletion_scheduled';
  return isAccountStatus(facts.status) ? facts.status : null;
}

/**
 * A lockout is self-service, a suspension is not, and they must not share a
 * message. `deletion_scheduled` is allowed: cancelling one is done signed in.
 */
export function accountAccessDecision(status: string | null): AccountAccessDecision {
  switch (status) {
    case 'locked':
      return {
        allowed: false,
        reason: 'locked',
        recoveryPath: LOCKOUT_RECOVERY_PATH,
        message: `Your account is locked. Reset your password at ${LOCKOUT_RECOVERY_PATH} to unlock it.`,
      };
    case 'recovery_pending':
      return {
        allowed: false,
        reason: 'recovery',
        recoveryPath: LOCKOUT_RECOVERY_PATH,
        message: `Account recovery is not finished. Complete it at ${LOCKOUT_RECOVERY_PATH} before signing in.`,
      };
    case 'suspended':
    case 'banned':
      return {
        allowed: false,
        reason: 'suspended',
        recoveryPath: SUSPENSION_APPEAL_PATH,
        message: 'Your account has been suspended. Please contact support.',
      };
    case 'deleted':
      return {
        allowed: false,
        reason: 'deleted',
        recoveryPath: null,
        message: 'This account has been deleted.',
      };
    default:
      return ALLOWED;
  }
}
