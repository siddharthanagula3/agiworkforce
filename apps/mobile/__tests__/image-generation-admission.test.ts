import { getModelMetadataById } from '@agiworkforce/types';
import {
  MANAGED_MEDIA_IMAGE_REF_MAX_BYTES,
  supportsManagedMediaImageEdit,
} from '@agiworkforce/cloud-contracts';
import { getDefaultCloudModelIdForTier } from '../src/features/model-picker/service';
import { resolveMobileImageGenerationRequest } from '../src/features/chat/actions/resolveMobileImageGenerationRequest';
import { listMediaModels } from '../src/features/chat/actions/mediaMode';
import { useChatViewStore } from '../stores/chat/chatViewStore';

const eligibleRequest = {
  executionMode: 'cloud' as const,
  text: '/image a secure enterprise architecture',
  mediaMode: 'text' as const,
  selection: getDefaultCloudModelIdForTier('pro')!,
  subscriptionTier: 'pro',
  attachments: [],
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
    [
      'an explicit image command carries a non-image attachment',
      {
        attachments: [{ uri: 'file:///brief.pdf', mimeType: 'application/pdf', fileName: 'b.pdf' }],
      },
      'reference_image_invalid',
    ],
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

describe('resolveMobileImageGenerationRequest, explicit Image mode', () => {
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

describe('resolveMobileImageGenerationRequest, reference image', () => {
  const editCapableModelId = listMediaModels('image').find((id) =>
    supportsManagedMediaImageEdit(getModelMetadataById(id)?.provider),
  );
  const textOnlyModelId = listMediaModels('image').find(
    (id) => !supportsManagedMediaImageEdit(getModelMetadataById(id)?.provider),
  );
  const photo = {
    uri: 'file:///photo.jpg',
    mimeType: 'image/jpeg',
    fileName: 'photo.jpg',
    fileSize: 512_000,
  };
  const imageMode = { ...eligibleRequest, mediaMode: 'image' as const, text: 'make it a poster' };

  afterEach(() => {
    useChatViewStore.setState({ selectedMediaModel: {} });
  });

  it('turns an attached photo into an edit operation carrying the source image', () => {
    if (!editCapableModelId) throw new Error('catalog exposes no edit-capable image model');
    useChatViewStore.setState({ selectedMediaModel: { image: editCapableModelId } });

    const result = resolveMobileImageGenerationRequest({ ...imageMode, attachments: [photo] });

    expect(result).toMatchObject({
      status: 'ready',
      model: editCapableModelId,
      operation: 'edit',
      sourceImage: photo,
    });
  });

  it('leaves a prompt with no attachment as a plain generation', () => {
    if (!editCapableModelId) throw new Error('catalog exposes no edit-capable image model');
    useChatViewStore.setState({ selectedMediaModel: { image: editCapableModelId } });

    const result = resolveMobileImageGenerationRequest({ ...imageMode, attachments: [] });

    expect(result).toMatchObject({ status: 'ready' });
    expect(result).not.toHaveProperty('operation');
    expect(result).not.toHaveProperty('sourceImage');
  });

  it('names the editing model instead of claiming the route is unavailable', () => {
    if (!textOnlyModelId || !editCapableModelId) {
      throw new Error('catalog must expose one editing and one text-only image model');
    }
    useChatViewStore.setState({ selectedMediaModel: { image: textOnlyModelId } });

    const result = resolveMobileImageGenerationRequest({ ...imageMode, attachments: [photo] });

    expect(result).toMatchObject({ status: 'blocked', code: 'reference_image_unsupported' });
    if (result.status === 'blocked') {
      expect(result.alert.message).toContain(
        getModelMetadataById(editCapableModelId)?.name ?? editCapableModelId,
      );
    }
  });

  it('refuses more than one reference image', () => {
    if (!editCapableModelId) throw new Error('catalog exposes no edit-capable image model');
    useChatViewStore.setState({ selectedMediaModel: { image: editCapableModelId } });

    expect(
      resolveMobileImageGenerationRequest({
        ...imageMode,
        attachments: [photo, { ...photo, uri: 'file:///second.jpg', fileName: 'second.jpg' }],
      }),
    ).toMatchObject({ status: 'blocked', code: 'reference_image_invalid' });
  });

  it('refuses a reference image the wire contract cannot carry', () => {
    if (!editCapableModelId) throw new Error('catalog exposes no edit-capable image model');
    useChatViewStore.setState({ selectedMediaModel: { image: editCapableModelId } });

    expect(
      resolveMobileImageGenerationRequest({
        ...imageMode,
        attachments: [{ ...photo, fileSize: MANAGED_MEDIA_IMAGE_REF_MAX_BYTES + 1 }],
      }),
    ).toMatchObject({ status: 'blocked', code: 'reference_image_too_large' });
  });
});
