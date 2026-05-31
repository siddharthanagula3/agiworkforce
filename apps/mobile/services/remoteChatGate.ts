import { FEATURES } from '@/lib/v1FeatureFlags';
import { useWaitlistStore } from '@/src/features/waitlist/store';

export interface RemoteChatFeatureFlags {
  v1LocalOnly: boolean;
  cloudChat: boolean;
  byokKeys: boolean;
}

export const MOBILE_REMOTE_CHAT_DISABLED_MESSAGE =
  'Remote chat is disabled while Mobile is in Local Mode. Mobile supports Local and Cloud Managed invite/waitlist only; BYOK belongs to supported Desktop and developer surfaces. Generated PDFs, docs, slides, code execution, and browser environments require Desktop or Cloud Managed access.';

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
  void flags.byokKeys;
  const cloudUnlocked = useWaitlistStore.getState().cloudUnlocked;
  if (flags.v1LocalOnly && !flags.cloudChat && !cloudUnlocked) {
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
