import { getModelMetadataById } from '@agiworkforce/types';
import { getDefaultCloudModelIdForTier } from '../src/features/model-picker/service';
import { resolveMobileImageGenerationRequest } from '../src/features/chat/actions/resolveMobileImageGenerationRequest';

const eligibleRequest = {
  executionMode: 'cloud' as const,
  text: '/image a secure enterprise architecture',
  mediaMode: 'text' as const,
  selection: getDefaultCloudModelIdForTier('pro')!,
  subscriptionTier: 'pro',
  hasAttachments: false,
  globalImageGenerationEnabled: true,
  imageGenerationEnabled: true,
  isClerkSignedIn: true,
  ownerId: 'mobile-image-test-user',
  grantedCapabilities: ['canUseImages'],
  isOnline: true,
};

describe('resolveMobileImageGenerationRequest', () => {
  it.each([
    ['/image a secure enterprise architecture', 'a secure enterprise architecture'],
    [
      'Create an image of a secure enterprise architecture',
      'Create an image of a secure enterprise architecture',
    ],
  ])('admits an eligible Cloud image request: %s', (text, expectedPrompt) => {
    const result = resolveMobileImageGenerationRequest({
      ...eligibleRequest,
      text,
    });

    expect(result).toMatchObject({
      status: 'ready',
      prompt: expectedPrompt,
    });
    if (result.status === 'ready') {
      expect(getModelMetadataById(result.model)?.capabilities.imageGen).toBe(true);
    }
  });

  it.each([
    '/image a secure enterprise architecture',
    'Create an image of a secure enterprise architecture',
  ])('blocks %s when Image is turned off', (text) => {
    expect(
      resolveMobileImageGenerationRequest({
        ...eligibleRequest,
        text,
        imageGenerationEnabled: false,
      }),
    ).toMatchObject({ status: 'blocked', code: 'disabled' });
  });

  it.each([
    ['Local mode', { executionMode: 'local' as const }, 'requires_cloud'],
    ['the build feature is off', { globalImageGenerationEnabled: false }, 'feature_unavailable'],
    ['the Clerk session is signed out', { isClerkSignedIn: false }, 'auth_required'],
    ['the Clerk owner is missing', { ownerId: null }, 'auth_required'],
    ['the capability handshake denies images', { grantedCapabilities: [] }, 'plan_required'],
    ['the plan is ineligible', { subscriptionTier: 'free' }, 'plan_required'],
    ['the device is offline', { isOnline: false }, 'offline'],
    ['an explicit image command has attachments', { hasAttachments: true }, 'route_unavailable'],
  ])('blocks when %s', (_label, overrides, expectedCode) => {
    expect(
      resolveMobileImageGenerationRequest({
        ...eligibleRequest,
        ...overrides,
      }),
    ).toMatchObject({ status: 'blocked', code: expectedCode });
  });

  it('does not turn an ineligible natural-language image request into ordinary chat', () => {
    expect(
      resolveMobileImageGenerationRequest({
        ...eligibleRequest,
        text: 'Create an image of a secure enterprise architecture',
        subscriptionTier: 'free',
      }),
    ).toMatchObject({ status: 'blocked', code: 'plan_required' });
  });

  it('does not misclassify a similarly prefixed slash command', () => {
    expect(
      resolveMobileImageGenerationRequest({
        ...eligibleRequest,
        text: '/imageinfo explain this command',
      }),
    ).toEqual({ status: 'not_requested' });
  });
});

describe('resolveMobileImageGenerationRequest — explicit Image mode', () => {
  const imageMode = { ...eligibleRequest, mediaMode: 'image' as const };

  it('admits a prompt that names no visual medium at all', () => {
    const result = resolveMobileImageGenerationRequest({
      ...imageMode,
      text: 'Create an stylist anime MC',
    });

    expect(result).toMatchObject({
      status: 'ready',
      prompt: 'Create an stylist anime MC',
    });
    if (result.status === 'ready') {
      expect(getModelMetadataById(result.model)?.capabilities.imageGen).toBe(true);
    }
  });

  it('leaves the same prompt to ordinary chat when the mode is text', () => {
    expect(
      resolveMobileImageGenerationRequest({
        ...eligibleRequest,
        text: 'Create an stylist anime MC',
      }),
    ).toEqual({ status: 'not_requested' });
  });

  it('still fails closed on the plan gate rather than silently answering as text', () => {
    expect(
      resolveMobileImageGenerationRequest({
        ...imageMode,
        text: 'Create an stylist anime MC',
        subscriptionTier: 'free',
      }),
    ).toMatchObject({ status: 'blocked', code: 'plan_required' });
  });

  it('blocks an empty prompt instead of dispatching a blank generation', () => {
    expect(resolveMobileImageGenerationRequest({ ...imageMode, text: '   ' })).toMatchObject({
      status: 'blocked',
      code: 'empty_prompt',
    });
  });
});
