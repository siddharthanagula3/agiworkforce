import { describe, expect, it } from 'vitest';
import type { Message } from '@shared/stores/web-chat-store';
import { resolveChatAccountDisplay, resolveChatAccountUser, toChatMessage } from '../WebChatPage';

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

describe('WebChatPage account identity', () => {
  it('prefers the canonical /api/me identity over the compatibility auth store', () => {
    const canonicalUser = {
      id: 'user-1',
      name: 'Canonical Name',
      email: 'canonical@example.com',
    };
    const compatibilityUser = {
      id: 'user-1',
      name: 'Stale Name',
      email: 'stale@example.com',
    };

    const clerkUser = {
      id: 'user-1',
      name: 'Clerk Name',
      email: 'clerk@example.com',
    };

    expect(resolveChatAccountUser(canonicalUser, compatibilityUser, clerkUser)).toBe(canonicalUser);
    expect(resolveChatAccountUser(null, compatibilityUser, clerkUser)).toBe(compatibilityUser);
    expect(resolveChatAccountUser(null, null, clerkUser)).toBe(clerkUser);
  });

  it('shows authenticated identity immediately without guessing a tier while policy loads', () => {
    expect(
      resolveChatAccountDisplay(
        {
          id: 'user-1',
          name: 'Siddhartha',
          email: 'siddhartha@example.com',
        },
        null,
        false,
      ),
    ).toEqual({
      displayName: 'Siddhartha',
      userInitial: 'S',
      tierLabel: null,
      showFreeUpgrade: false,
      isLoading: false,
    });
  });

  it('shows a neutral loading state when neither identity nor policy is ready', () => {
    expect(resolveChatAccountDisplay(null, null, false)).toEqual({
      displayName: 'Loading account',
      userInitial: '…',
      tierLabel: null,
      showFreeUpgrade: false,
      isLoading: true,
    });
  });
});
