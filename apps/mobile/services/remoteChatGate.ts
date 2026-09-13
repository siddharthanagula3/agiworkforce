import { FEATURES } from '@/lib/v1FeatureFlags';

export interface RemoteChatFeatureFlags {
  cloudChat: boolean;
  /** Local-only build shape. No released build sets it; the branch stays so a
   * build that does cannot reach Cloud without an explicit unlock. */
  v1LocalOnly?: boolean;
  /** Accepted and never consulted: a direct-provider build must not be able to
   * widen this gate by declaring keys. */
  byokKeys?: boolean;
}

export interface RemoteChatAccessState {
  cloudUnlocked?: boolean;
}

export const MOBILE_REMOTE_CHAT_DISABLED_MESSAGE =
  'AGI Cloud chat is unavailable in this mobile build. Local Mode stays on this device.';

export const MOBILE_REMOTE_CHAT_SIGNIN_REQUIRED_MESSAGE =
  'Sign in to use AGI Cloud chat. Local Mode stays available on this device.';

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
  if (!flags.cloudChat) {
    return MOBILE_REMOTE_CHAT_DISABLED_MESSAGE;
  }
  if (flags.v1LocalOnly && !access.cloudUnlocked) return MOBILE_REMOTE_CHAT_SIGNIN_REQUIRED_MESSAGE;
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
