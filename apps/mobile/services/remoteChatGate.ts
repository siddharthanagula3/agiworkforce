import { FEATURES } from '@/lib/v1FeatureFlags';

export interface RemoteChatFeatureFlags {
  v1LocalOnly: boolean;
  cloudChat: boolean;
  byokKeys: boolean;
}

export const MOBILE_REMOTE_CHAT_DISABLED_MESSAGE =
  'Remote chat is disabled while Mobile is in Local Only mode. Use on-device/local models, or enable BYOK/Cloud Managed mode after setup is available.';

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
  if (flags.v1LocalOnly && !flags.cloudChat && !flags.byokKeys) {
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
