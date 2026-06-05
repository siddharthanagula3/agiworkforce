import { FEATURES } from '@/lib/v1FeatureFlags';

export interface RemoteChatFeatureFlags {
  v1LocalOnly: boolean;
  cloudChat: boolean;
  byokKeys: boolean;
}

export const MOBILE_REMOTE_CHAT_DISABLED_MESSAGE =
  'Remote chat is disabled while Mobile is in Local Mode. Mobile supports Local and Cloud Managed invite/waitlist only. Generated PDFs, docs, slides, code execution, and browser environments require Desktop or Cloud Managed access.';

export class RemoteChatDisabledError extends Error {
  readonly code = 'MOBILE_REMOTE_CHAT_DISABLED';

  constructor(message = MOBILE_REMOTE_CHAT_DISABLED_MESSAGE) {
    super(message);
    this.name = 'RemoteChatDisabledError';
  }
}

export function getRemoteChatDisabledReason(
  flags: RemoteChatFeatureFlags = FEATURES,
): string | null {
  // Legacy flag stays in the shared type for compatibility, but Mobile does not expose it.
  void flags.byokKeys;
  if (flags.v1LocalOnly && !flags.cloudChat) {
    return MOBILE_REMOTE_CHAT_DISABLED_MESSAGE;
  }
  return null;
}

export function assertRemoteChatAllowed(flags: RemoteChatFeatureFlags = FEATURES): void {
  const disabledReason = getRemoteChatDisabledReason(flags);
  if (disabledReason) {
    throw new RemoteChatDisabledError(disabledReason);
  }
}
