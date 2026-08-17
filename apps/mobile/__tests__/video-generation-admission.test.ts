import {
  getVideoAspectOptionsForModel,
  getVideoQualityOptionsForModel,
  isVideoOutputSupported,
} from '@agiworkforce/types';
import {
  MANAGED_MEDIA_VIDEO_ASPECT_RATIOS,
  MANAGED_MEDIA_VIDEO_RESOLUTIONS,
} from '@agiworkforce/cloud-contracts';
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

describe('resolveMobileVideoGenerationRequest — Auto intent routing', () => {
  const TEXT_MODE = { ...ENTITLED, mediaMode: 'text' as const };

  it.each([
    'Create a video of an stylist anime character',
    'make an animation showing a rocket launch',
    'generate a video',
    'create a short clip about dogs',
    'render an animation of a spinning globe',
    'make me a video featuring a sunset',
  ])('routes a plainly worded video request: %s', (text) => {
    const decision = resolveMobileVideoGenerationRequest({ ...TEXT_MODE, text });

    expect(decision.status).toBe('ready');
    if (decision.status !== 'ready') return;
    expect(decision.prompt).toBe(text);
  });

  it.each([
    'create a video game character',
    'make a movie recommendation',
    'summarise this video',
    'explain how video codecs work',
    'create a video editing plan',
    'write a script for a movie trailer',
    'make a list of video ideas',
  ])('leaves a non-generation mention to chat: %s', (text) => {
    expect(resolveMobileVideoGenerationRequest({ ...TEXT_MODE, text })).toEqual({
      status: 'not_requested',
    });
  });

  it('never hijacks an explicit Image-mode send', () => {
    expect(
      resolveMobileVideoGenerationRequest({
        ...ENTITLED,
        mediaMode: 'image',
        text: 'Create a video of an stylist anime character',
      }),
    ).toEqual({ status: 'not_requested' });
  });

  it('still fails closed on the plan gate for an inferred request', () => {
    const decision = resolveMobileVideoGenerationRequest({
      ...TEXT_MODE,
      subscriptionTier: 'free',
      text: 'Create a video of a cat',
    });

    expect(decision.status).toBe('blocked');
    if (decision.status !== 'blocked') return;
    expect(decision.code).toBe('plan_required');
  });

  it('does not infer video from a Local Mode chat', () => {
    const decision = resolveMobileVideoGenerationRequest({
      ...TEXT_MODE,
      executionMode: 'local',
      text: 'Create a video of a cat',
    });

    expect(decision.status).toBe('blocked');
    if (decision.status !== 'blocked') return;
    expect(decision.code).toBe('requires_cloud');
  });
});

describe('resolveMobileVideoGenerationRequest — output shape follows the routed model', () => {
  const routed = resolveMobileVideoGenerationRequest({
    ...ENTITLED,
    text: 'a cat surfing',
    aspectRatio: '16:9',
    resolution: '720p',
  });
  const routedModel = routed.status === 'ready' ? routed.model : '';
  const publishedAspects = getVideoAspectOptionsForModel(routedModel).map((option) => option.id);
  const publishedQualities = getVideoQualityOptionsForModel(routedModel, publishedAspects[0]).map(
    (option) => option.id,
  );

  it('routes to a model whose published output catalog is narrower than the contract enums', () => {
    expect(routedModel).toBeTruthy();
    expect(publishedAspects.length).toBeGreaterThan(0);
    expect(publishedQualities.length).toBeGreaterThan(0);
    expect(MANAGED_MEDIA_VIDEO_ASPECT_RATIOS.some((id) => !publishedAspects.includes(id))).toBe(
      true,
    );
    expect(MANAGED_MEDIA_VIDEO_RESOLUTIONS.some((id) => !publishedQualities.includes(id))).toBe(
      true,
    );
  });

  it('clamps a persisted aspect the routed model never published', () => {
    const unpublished = MANAGED_MEDIA_VIDEO_ASPECT_RATIOS.find(
      (id) => !publishedAspects.includes(id),
    )!;
    const decision = resolveMobileVideoGenerationRequest({
      ...ENTITLED,
      text: 'a cat surfing',
      aspectRatio: unpublished,
      resolution: publishedQualities[0]!,
    });

    expect(decision.status).toBe('ready');
    if (decision.status !== 'ready') return;
    expect(decision.aspectRatio).not.toBe(unpublished);
    expect(publishedAspects).toContain(decision.aspectRatio);
    expect(isVideoOutputSupported(decision.model, decision.aspectRatio, decision.resolution)).toBe(
      true,
    );
  });

  it('clamps a persisted resolution the routed model never published at that aspect', () => {
    const unpublished = MANAGED_MEDIA_VIDEO_RESOLUTIONS.find(
      (id) => !publishedQualities.includes(id),
    )!;
    const decision = resolveMobileVideoGenerationRequest({
      ...ENTITLED,
      text: 'a cat surfing',
      aspectRatio: publishedAspects[0]!,
      resolution: unpublished,
    });

    expect(decision.status).toBe('ready');
    if (decision.status !== 'ready') return;
    expect(decision.resolution).not.toBe(unpublished);
    expect(publishedQualities).toContain(decision.resolution);
    expect(isVideoOutputSupported(decision.model, decision.aspectRatio, decision.resolution)).toBe(
      true,
    );
  });

  it('keeps a persisted pair the routed model does publish', () => {
    const decision = resolveMobileVideoGenerationRequest({
      ...ENTITLED,
      text: 'a cat surfing',
      aspectRatio: publishedAspects[0]!,
      resolution: publishedQualities[publishedQualities.length - 1]!,
    });

    expect(decision.status).toBe('ready');
    if (decision.status !== 'ready') return;
    expect(decision.aspectRatio).toBe(publishedAspects[0]);
    expect(decision.resolution).toBe(publishedQualities[publishedQualities.length - 1]);
  });
});
