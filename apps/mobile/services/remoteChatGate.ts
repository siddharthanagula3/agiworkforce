import { FEATURES } from '@/lib/v1FeatureFlags';

export interface RemoteChatFeatureFlags {
  v1LocalOnly: boolean;
  cloudChat: boolean;
  byokKeys: boolean;
}

export interface RemoteChatAccessState {
  cloudUnlocked?: boolean;
}

export const MOBILE_REMOTE_CHAT_DISABLED_MESSAGE =
  'AGI Cloud chat is not enabled in this mobile build yet. Local Mode stays on this device.';

export const MOBILE_REMOTE_CHAT_INVITE_REQUIRED_MESSAGE =
  'AGI Cloud chat requires invite access. Local Mode stays available on this device.';

export class RemoteChatDisabledError extends Error {
  readonly code = 'MOBILE_REMOTE_CHAT_DISABLED';

  constructor(message = MOBILE_REMOTE_CHAT_DISABLED_MESSAGE) {
    super(message);
    this.name = 'RemoteChatDisabledError';
  }
}

export function getRemoteChatDisabledReason(
  flags: RemoteChatFeatureFlags = FEATURES,
  access: RemoteChatAccessState = {},
): string | null {
  // Legacy flag stays in the shared type for compatibility, but Mobile does not expose it.
  void flags.byokKeys;
  if (!flags.cloudChat) {
    return MOBILE_REMOTE_CHAT_DISABLED_MESSAGE;
  }
  if (flags.v1LocalOnly && !access.cloudUnlocked) return MOBILE_REMOTE_CHAT_INVITE_REQUIRED_MESSAGE;
  return null;
}

export function assertRemoteChatAllowed(
  flags: RemoteChatFeatureFlags = FEATURES,
  access: RemoteChatAccessState = {},
): void {
  const disabledReason = getRemoteChatDisabledReason(flags, access);
  if (disabledReason) {
    throw new RemoteChatDisabledError(disabledReason);
  }
}
