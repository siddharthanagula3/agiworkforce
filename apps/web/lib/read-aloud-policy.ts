import { isLocalModelId } from '@agiworkforce/local-runtime-contract';
import type { DeveloperSessionTrustMode } from '@agiworkforce/types/protocol';

export const READ_ALOUD_PRIVACY_UNAVAILABLE =
  'Read-aloud is unavailable for this reply’s privacy mode.';
export const READ_ALOUD_UNVERIFIED =
  'Read-aloud is unavailable because this session’s trust mode is unverified.';

interface ReadAloudMessage {
  id: string;
  content: string;
  model?: string;
  metadata?: { privacyMode?: unknown; providerMode?: unknown };
}

export function messageReadAloudUnavailable(message: ReadAloudMessage): string | null {
  const metadata = message.metadata;
  if (
    metadata?.privacyMode === 'local' ||
    metadata?.privacyMode === 'byok' ||
    metadata?.providerMode === 'Local' ||
    metadata?.providerMode === 'DirectByok' ||
    (message.model !== undefined && isLocalModelId(message.model))
  ) {
    return READ_ALOUD_PRIVACY_UNAVAILABLE;
  }
  // Unlabeled legacy Chat keeps its existing behavior. No inference from the
  // active model picker, provider display names, or unrelated transcript rows.
  return null;
}

export function currentReadAloudMessage<T extends ReadAloudMessage>(
  messages: readonly T[],
  id: string,
): T | null {
  const message = messages.find((candidate) => candidate.id === id);
  return message && !messageReadAloudUnavailable(message) ? message : null;
}

export function codeReadAloudUnavailable(mode: DeveloperSessionTrustMode): string | null {
  if (mode === 'managed') return null;
  return mode === 'local' || mode === 'byok'
    ? READ_ALOUD_PRIVACY_UNAVAILABLE
    : READ_ALOUD_UNVERIFIED;
}
