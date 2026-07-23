import { describe, expect, it } from 'vitest';
import type { Message } from '@shared/stores/web-chat-store';
import { toChatMessage } from '../WebChatPage';

describe('WebChatPage message projection', () => {
  it('preserves durable attachments for the transcript after reload', () => {
    const message: Message = {
      id: 'user-message',
      role: 'user',
      content: 'Describe this image',
      createdAt: '2026-07-23T03:02:49.503Z',
      attachments: [
        {
          id: '54af5655-43d0-4ecc-a418-afefdeb746e0',
          assetId: '54af5655-43d0-4ecc-a418-afefdeb746e0',
          type: 'image',
          name: 'trip-planning.png',
          size: 446_059,
          mimeType: 'image/png',
          url: '/api/files/54af5655-43d0-4ecc-a418-afefdeb746e0',
        },
      ],
    };

    expect(toChatMessage(message, 'conversation-id').attachments).toEqual(message.attachments);
  });
});
