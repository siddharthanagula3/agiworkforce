import { create } from 'zustand';
import {
  ManagedCloudChatMessageLimitsWireSchema,
  managedCloudChatLatestMessageMaxChars,
  type ManagedCloudChatMessageLimitsWire,
} from '@agiworkforce/cloud-contracts';

interface ServerMessageLimitsState {
  limits: ManagedCloudChatMessageLimitsWire | null;
}

const useServerMessageLimitsStore = create<ServerMessageLimitsState>(() => ({
  limits: null,
}));

/** Takes the `message_limits` block of the sign-in handshake; anything unreadable clears it. */
export function applyServerMessageLimits(wire: unknown): void {
  const parsed = ManagedCloudChatMessageLimitsWireSchema.safeParse(wire);
  useServerMessageLimitsStore.setState({ limits: parsed.success ? parsed.data : null });
}

export function clearServerMessageLimits(): void {
  useServerMessageLimitsStore.setState({ limits: null });
}

/**
 * The longest newest message a Cloud completion turn may carry inline. A
 * server that announces nothing keeps the limit it has always enforced.
 */
export function useCloudLatestMessageMaxChars(): number {
  return managedCloudChatLatestMessageMaxChars(
    useServerMessageLimitsStore((state) => state.limits),
  );
}
