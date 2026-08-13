/**
 * Remote (Managed Cloud) chat gate for Mobile.
 *
 * Managed Cloud is PUBLIC ALPHA, open by default — the signed-in entitlement is the
 * gate (no invite, no waitlist, no private beta). When `cloudChat` is on and the
 * build is not explicitly local-only, this gate returns null (allowed) and the
 * sign-in requirement is enforced upstream (chatExecutionStore C1 auth gate +
 * Clerk session). The legacy `cloudUnlocked` flag below now reflects the signed-in
 * entitlement (synced from the Clerk session in ClerkTokenBridge), not invite
 * redemption. Local Mode never auto-routes off the device.
 */
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
  // Legacy flag stays in the shared type for compatibility, but Mobile does not expose it.
  void flags.byokKeys;
  if (!flags.cloudChat) {
    return MOBILE_REMOTE_CHAT_DISABLED_MESSAGE;
  }
  // Public alpha: when not explicitly local-only, Managed Cloud is open by default.
  // The signed-in entitlement is enforced upstream (auth gate + Clerk session). The
  // v1LocalOnly branch stays only for the kill-switch / local-only build path.
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
