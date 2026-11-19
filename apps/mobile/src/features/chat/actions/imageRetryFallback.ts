import type { ChatMessage } from '@/types/chat';
import { IMAGE_REFERENCE_UNAVAILABLE_MESSAGE } from './mediaGenerationError';

export type ImageRetryFallback =
  { kind: 'resend'; text: string } | { kind: 'reference_unavailable'; message: string };

export function resolveImageRetryFallback(
  original: Pick<ChatMessage, 'content' | 'attachments'>,
): ImageRetryFallback {
  if ((original.attachments?.length ?? 0) > 0) {
    return { kind: 'reference_unavailable', message: IMAGE_REFERENCE_UNAVAILABLE_MESSAGE };
  }
  return { kind: 'resend', text: original.content };
}
