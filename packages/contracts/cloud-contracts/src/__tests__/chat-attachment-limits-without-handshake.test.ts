import { describe, expect, it } from 'vitest';

import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE,
  ChatAttachmentLimitsWireSchema,
  chatAttachmentLimitsToWire,
} from '../chat-attachments';

describe('chat attachment limits without a handshake', () => {
  it('never offer more than the limits this build was made with', () => {
    const fallback = CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE;

    expect(fallback.maxFilesPerMessage).toBeLessThanOrEqual(
      CHAT_ATTACHMENT_LIMITS.maxFilesPerMessage,
    );
    expect(fallback.maxFileBytes).toBeLessThanOrEqual(CHAT_ATTACHMENT_LIMITS.maxFileBytes);
    expect(fallback.maxImageBytes).toBeLessThanOrEqual(CHAT_ATTACHMENT_LIMITS.maxImageBytes);
    expect(fallback.maxMessageBytes).toBeLessThanOrEqual(CHAT_ATTACHMENT_LIMITS.maxMessageBytes);
  });

  it('are limits a server could send, with no large file offer', () => {
    const wire = chatAttachmentLimitsToWire(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE);

    expect(ChatAttachmentLimitsWireSchema.safeParse(wire).success).toBe(true);
    expect(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE.largeFilesAvailable).toBeUndefined();
    expect(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE.maxFileBytes).toBeLessThanOrEqual(
      CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE.maxMessageBytes,
    );
  });

  it('cannot be changed by a caller', () => {
    expect(Object.isFrozen(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE)).toBe(true);
  });
});
