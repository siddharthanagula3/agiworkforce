/**
 * Video admission fails CLOSED. Every gate here exists because the alternative
 * is spending a Max-tier video generation the account is not entitled to, or
 * firing one the user never asked for.
 */

import { resolveMobileVideoGenerationRequest } from '@/src/features/chat/actions/resolveMobileVideoGenerationRequest';

const ENTITLED = {
  executionMode: 'cloud' as const,
  mediaMode: 'video' as const,
  subscriptionTier: 'max_15x',
  isClerkSignedIn: true,
  ownerId: 'user_123',
  grantedCapabilities: ['canUseImages'],
  isOnline: true,
};

describe('resolveMobileVideoGenerationRequest', () => {
  it('admits a video-mode send on an entitled cloud account', () => {
    const decision = resolveMobileVideoGenerationRequest({ ...ENTITLED, text: 'a cat surfing' });

    expect(decision.status).toBe('ready');
    if (decision.status !== 'ready') return;
    expect(decision.prompt).toBe('a cat surfing');
    expect(decision.ownerId).toBe('user_123');
    expect(decision.model).toBeTruthy();
  });

  it('admits an explicit /video command outside video mode', () => {
    const decision = resolveMobileVideoGenerationRequest({
      ...ENTITLED,
      mediaMode: 'text',
      text: '/video a cat surfing',
    });

    expect(decision.status).toBe('ready');
    if (decision.status !== 'ready') return;
    expect(decision.prompt).toBe('a cat surfing');
  });

  /**
   * Video is never INFERRED from wording. A prompt that merely mentions video
   * while in text mode is an ordinary chat message — guessing would spend a
   * paid generation on someone who just used the word.
   */
  it('does not claim a text-mode message that merely mentions video', () => {
    const decision = resolveMobileVideoGenerationRequest({
      ...ENTITLED,
      mediaMode: 'text',
      text: 'explain how video codecs work',
    });

    expect(decision.status).toBe('not_requested');
  });

  it('blocks an empty prompt rather than sending a blank generation', () => {
    const decision = resolveMobileVideoGenerationRequest({ ...ENTITLED, text: '/video' });

    expect(decision.status).toBe('blocked');
    if (decision.status !== 'blocked') return;
    expect(decision.code).toBe('empty_prompt');
  });

  it('blocks in Local mode — video only exists behind Managed Cloud', () => {
    const decision = resolveMobileVideoGenerationRequest({
      ...ENTITLED,
      executionMode: 'local',
      text: 'a cat surfing',
    });

    expect(decision.status).toBe('blocked');
    if (decision.status !== 'blocked') return;
    expect(decision.code).toBe('requires_cloud');
  });

  it('blocks when signed out', () => {
    const decision = resolveMobileVideoGenerationRequest({
      ...ENTITLED,
      isClerkSignedIn: false,
      ownerId: null,
      text: 'a cat surfing',
    });

    expect(decision.status).toBe('blocked');
    if (decision.status !== 'blocked') return;
    expect(decision.code).toBe('auth_required');
  });

  it('blocks below Max 15x, matching the billing catalog', () => {
    const decision = resolveMobileVideoGenerationRequest({
      ...ENTITLED,
      subscriptionTier: 'pro',
      text: 'a cat surfing',
    });

    expect(decision.status).toBe('blocked');
    if (decision.status !== 'blocked') return;
    expect(decision.code).toBe('plan_required');
  });

  it('blocks when the server capability handshake denies media', () => {
    const decision = resolveMobileVideoGenerationRequest({
      ...ENTITLED,
      grantedCapabilities: [],
      text: 'a cat surfing',
    });

    expect(decision.status).toBe('blocked');
    if (decision.status !== 'blocked') return;
    expect(decision.code).toBe('plan_required');
  });

  it('blocks while offline instead of queueing a paid generation', () => {
    const decision = resolveMobileVideoGenerationRequest({
      ...ENTITLED,
      isOnline: false,
      text: 'a cat surfing',
    });

    expect(decision.status).toBe('blocked');
    if (decision.status !== 'blocked') return;
    expect(decision.code).toBe('offline');
  });

  it('carries a user-facing alert on every blocked decision', () => {
    const decision = resolveMobileVideoGenerationRequest({
      ...ENTITLED,
      subscriptionTier: 'free',
      text: 'a cat surfing',
    });

    expect(decision.status).toBe('blocked');
    if (decision.status !== 'blocked') return;
    expect(decision.alert.title).toBeTruthy();
    expect(decision.alert.message).toBeTruthy();
  });
});
