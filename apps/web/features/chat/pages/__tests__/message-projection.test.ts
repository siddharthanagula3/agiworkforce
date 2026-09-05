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

  it('lifts persisted per-turn usage into metadata', () => {
    const message: Message = {
      id: 'assistant-message',
      role: 'assistant',
      content: 'Here you go.',
      createdAt: '2026-08-06T00:00:00.000Z',
      model: 'test-model',
      inputTokens: 1200,
      outputTokens: 340,
    };

    const projected = toChatMessage(message, 'conversation-id');
    expect(projected.metadata?.['inputTokens']).toBe(1200);
    expect(projected.metadata?.['outputTokens']).toBe(340);
    expect(projected.metadata?.['tokensUsed']).toBe(1540);
    expect(projected.metadata?.['model']).toBe('test-model');
  });

  it('leaves usage absent rather than reporting zero when the row has none', () => {
    const message: Message = {
      id: 'assistant-no-usage',
      role: 'assistant',
      content: 'No usage recorded.',
      createdAt: '2026-08-06T00:00:00.000Z',
    };

    const projected = toChatMessage(message, 'conversation-id');
    expect(projected.metadata?.['tokensUsed']).toBeUndefined();
    expect(projected.metadata?.['inputTokens']).toBeUndefined();
  });

  it('preserves persisted media recovery metadata when a second client hydrates the transcript', () => {
    const message: Message = {
      id: 'video-refusal',
      role: 'assistant',
      content: '\u200b',
      createdAt: '2026-08-09T12:00:00.000Z',
      metadata: {
        toolType: 'video-generation',
        paywall: {
          feature: 'video_generation',
          requiredTier: 'max_15x',
          reason: 'Video generation requires Max 15x.',
          recoveryAction: 'upgrade',
          showUpgradeCta: true,
          showResetTime: false,
          suggestStandardModel: false,
        },
      },
    };

    expect(toChatMessage(message, 'conversation-id').metadata?.['paywall']).toEqual(
      message.metadata?.paywall,
    );
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

  it('does not call an unknown tier Free once the policy reports ready', () => {
    // The live regression on 2026-08-17: Basic and Max 15x accounts rendered
    // "Free plan" with an Upgrade button. billingPolicyReady was true while the
    // subscription was still null, and the Free fallback filled the gap. The
    // button then started Stripe CHECKOUT rather than the in-app upgrade, and
    // the server refused it because a real subscription already existed.
    expect(
      resolveChatAccountDisplay(
        { id: 'user-1', name: 'Dasardhi', email: 'dasardhi@example.com' },
        null,
        true,
      ),
    ).toEqual({
      displayName: 'Dasardhi',
      userInitial: 'D',
      tierLabel: null,
      showFreeUpgrade: false,
      isLoading: false,
    });
  });

  it('still offers the upgrade nudge when the server actually reports free', () => {
    expect(
      resolveChatAccountDisplay(
        { id: 'user-2', name: 'Demo', email: 'demo@example.com' },
        'free',
        true,
      ),
    ).toMatchObject({ showFreeUpgrade: true });
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

  it('keeps showing the loading state, not the word "User", when identity is still missing after billing settles', () => {
    expect(resolveChatAccountDisplay(null, 'free', true)).toEqual({
      displayName: 'Loading account',
      userInitial: '…',
      tierLabel: null,
      showFreeUpgrade: false,
      isLoading: true,
    });
  });
});
