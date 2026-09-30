import { ApiHttpError } from '@/services/apiErrors';

const ACCOUNT_DELETION_REFUSAL_REASONS = [
  'active_subscription',
  'sole_organization_owner',
] as const;

export type AccountDeletionRefusalReason = (typeof ACCOUNT_DELETION_REFUSAL_REASONS)[number];

export interface AccountDeletionRefusal {
  reason: AccountDeletionRefusalReason;
  message: string;
}

function isAccountDeletionRefusalReason(value: unknown): value is AccountDeletionRefusalReason {
  return ACCOUNT_DELETION_REFUSAL_REASONS.some((reason) => reason === value);
}

export function accountDeletionRefusal(error: unknown): AccountDeletionRefusal | null {
  if (!(error instanceof ApiHttpError) || error.status !== 409) return null;
  const reason = error.body?.['reason'];
  const message = error.message.trim();
  if (!isAccountDeletionRefusalReason(reason) || !message) return null;
  return { reason, message };
}
