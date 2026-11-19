import { create } from 'zustand';
import {
  CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE,
  ChatAttachmentLimitsWireSchema,
  chatAttachmentLimitsFromWire,
  type ChatAttachmentLimits,
} from '@agiworkforce/cloud-contracts';

interface ServerAttachmentLimitsState {
  limits: ChatAttachmentLimits | null;
}

/**
 * The limits the server last handed this account at sign-in. Held in memory
 * only, so a signed-out phone or another account never inherits them.
 */
const useServerAttachmentLimitsStore = create<ServerAttachmentLimitsState>(() => ({
  limits: null,
}));

/** Takes the `attachment_limits` block of the sign-in handshake; anything unreadable clears it. */
export function applyServerAttachmentLimits(wire: unknown): void {
  const parsed = ChatAttachmentLimitsWireSchema.safeParse(wire);
  useServerAttachmentLimitsStore.setState({
    limits: parsed.success ? chatAttachmentLimitsFromWire(parsed.data) : null,
  });
}

export function clearServerAttachmentLimits(): void {
  useServerAttachmentLimitsStore.setState({ limits: null });
}

/**
 * The one place Cloud attachment limits are read on the phone: the server's
 * numbers when it sent them, the conservative ones for a server that sends
 * none otherwise. Never the larger limits compiled into this build, which an
 * older server refuses. The server refuses anything over its own limits
 * whatever this returns.
 */
export function currentAttachmentLimits(): ChatAttachmentLimits {
  return (
    useServerAttachmentLimitsStore.getState().limits ?? CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE
  );
}

export function useAttachmentLimits(): ChatAttachmentLimits {
  return (
    useServerAttachmentLimitsStore((state) => state.limits) ??
    CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE
  );
}
