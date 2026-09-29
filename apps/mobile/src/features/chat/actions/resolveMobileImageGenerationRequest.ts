import {
  canUseBillingPlanCapability,
  getModelMetadataById,
  isImageAspectSupported,
} from '@agiworkforce/types';
import {
  MANAGED_MEDIA_IMAGE_ASPECT_RATIOS,
  MANAGED_MEDIA_IMAGE_REF_MAX_BYTES,
  MANAGED_MEDIA_MAX_IMAGE_REFERENCES,
  supportsManagedMediaImageEdit,
  type ManagedMediaImageAspectRatio,
  type ManagedMediaImageOperation,
} from '@agiworkforce/cloud-contracts';
import { resolveMobileCloudDispatch } from '@/src/features/chat/utils/cloudDispatchRouting';
import { listMediaModels, resolveMediaModelId } from './mediaMode';

export type MobileImageGenerationBlockCode =
  | 'empty_prompt'
  | 'requires_cloud'
  | 'feature_unavailable'
  | 'disabled'
  | 'auth_required'
  | 'plan_required'
  | 'offline'
  | 'route_unavailable'
  | 'reference_image_invalid'
  | 'reference_image_too_large'
  | 'reference_image_unsupported';

export interface MobileImageGenerationAlert {
  title: string;
  message: string;
}

export interface MobileImageModelOption {
  id: string;
  name: string;
}

export interface MobileImageReferenceAttachment {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize?: number;
}

export type MobileImageGenerationRequestDecision =
  | { status: 'not_requested' }
  | {
      status: 'blocked';
      code: MobileImageGenerationBlockCode;
      alert: MobileImageGenerationAlert;
      switchModel?: MobileImageModelOption;
    }
  | {
      status: 'ready';
      prompt: string;
      model: string;
      aspectRatio?: ManagedMediaImageAspectRatio;
      transparentBackground?: true;
      ownerId: string;
      operation?: ManagedMediaImageOperation;
      sourceImage?: MobileImageReferenceAttachment;
      referenceImages?: MobileImageReferenceAttachment[];
    };

export interface ResolveMobileImageGenerationRequestInput {
  executionMode: 'local' | 'cloud';
  text: string;
  mediaMode: 'text' | 'image' | 'video';
  selection: string;
  subscriptionTier?: string | null;
  attachments?: readonly MobileImageReferenceAttachment[];
  globalImageGenerationEnabled: boolean;
  imageGenerationEnabled: boolean;
  isClerkSignedIn: boolean;
  ownerId: string | null;
  grantedCapabilities: readonly string[];
  isOnline: boolean;
  aspectRatio?: string;
  transparentBackground?: boolean;
}

function transparencyFor(
  modelId: string,
  requested: boolean | undefined,
): { transparentBackground?: true } {
  return requested === true &&
    supportsManagedMediaImageEdit(getModelMetadataById(modelId)?.provider)
    ? { transparentBackground: true }
    : {};
}

function resolveAspectRatio(
  modelId: string,
  aspectRatio: string | undefined,
): ManagedMediaImageAspectRatio | undefined {
  if (!aspectRatio) return undefined;
  if (!MANAGED_MEDIA_IMAGE_ASPECT_RATIOS.includes(aspectRatio as ManagedMediaImageAspectRatio)) {
    return undefined;
  }
  if (!isImageAspectSupported(modelId, aspectRatio)) return undefined;
  return aspectRatio as ManagedMediaImageAspectRatio;
}

const BLOCKED_ALERTS: Readonly<Record<MobileImageGenerationBlockCode, MobileImageGenerationAlert>> =
  {
    empty_prompt: {
      title: 'Add an image prompt',
      message: 'Type what you want AGI to create after /image.',
    },
    requires_cloud: {
      title: 'Image generation uses AGI Cloud',
      message:
        'Start an AGI Cloud chat to generate images. Local Mode can attach and inspect images without uploading them.',
    },
    feature_unavailable: {
      title: 'Image generation uses AGI Cloud',
      message:
        'You can attach and inspect local images now. Image generation is available with Cloud access.',
    },
    disabled: {
      title: 'Image generation is off',
      message: 'Turn on Image in Add to chat, then try your prompt again.',
    },
    auth_required: {
      title: 'Sign in to generate images',
      message: 'Image generation uses your signed-in AGI Cloud account.',
    },
    plan_required: {
      title: 'Image generation is not included',
      message: 'Upgrade to an eligible AGI Cloud plan to generate images.',
    },
    offline: {
      title: 'Network connection required',
      message: 'Image generation needs AGI Cloud. Connect to the internet and try again.',
    },
    route_unavailable: {
      title: 'Image generation is unavailable',
      message:
        'No eligible image model is available for this request. Choose another Cloud model or try again later.',
    },
    reference_image_invalid: {
      title: 'Attach one image to edit',
      message:
        'A reference image must be a single image file. Remove the other attachments and try again.',
    },
    reference_image_too_large: {
      title: 'Reference image is too large',
      message: `A reference image must be under ${Math.floor(MANAGED_MEDIA_IMAGE_REF_MAX_BYTES / (1024 * 1024))} MB. Attach a smaller image and try again.`,
    },
    reference_image_unsupported: {
      title: 'This image model cannot use a reference image',
      message:
        'No image model in this build can edit an attached image. Remove the attachment to generate a new image from your prompt.',
    },
  };

function blocked(
  code: MobileImageGenerationBlockCode,
  message?: string,
  switchModel?: MobileImageModelOption,
): MobileImageGenerationRequestDecision {
  return {
    status: 'blocked',
    code,
    alert: message ? { ...BLOCKED_ALERTS[code], message } : BLOCKED_ALERTS[code],
    ...(switchModel ? { switchModel } : {}),
  };
}

function editCapableImageModels(): MobileImageModelOption[] {
  return listMediaModels('image')
    .filter((id) => supportsManagedMediaImageEdit(getModelMetadataById(id)?.provider))
    .map((id) => ({ id, name: getModelMetadataById(id)?.name ?? id }));
}

type ReferenceImageDecision =
  | { kind: 'none' }
  | {
      kind: 'blocked';
      code: MobileImageGenerationBlockCode;
      message?: string;
      switchModel?: MobileImageModelOption;
    }
  | { kind: 'ready'; attachment: MobileImageReferenceAttachment };

function resolveReferenceImage(
  attachments: readonly MobileImageReferenceAttachment[],
  modelId: string,
): ReferenceImageDecision {
  if (attachments.length === 0) return { kind: 'none' };
  if (attachments.length > MANAGED_MEDIA_MAX_IMAGE_REFERENCES + 1) {
    return {
      kind: 'blocked',
      code: 'reference_image_invalid',
      message: `Attach up to ${MANAGED_MEDIA_MAX_IMAGE_REFERENCES + 1} images: the first is edited and the others guide it.`,
    };
  }
  const guideRefusal = guideImageRefusal(attachments.slice(1));
  if (guideRefusal) return guideRefusal;
  const attachment = attachments[0]!;
  if (!attachment.mimeType.startsWith('image/')) {
    return { kind: 'blocked', code: 'reference_image_invalid' };
  }
  if (
    typeof attachment.fileSize === 'number' &&
    attachment.fileSize > MANAGED_MEDIA_IMAGE_REF_MAX_BYTES
  ) {
    return { kind: 'blocked', code: 'reference_image_too_large' };
  }
  if (!supportsManagedMediaImageEdit(getModelMetadataById(modelId)?.provider)) {
    const capable = editCapableImageModels();
    return {
      kind: 'blocked',
      code: 'reference_image_unsupported',
      ...(capable.length > 0
        ? {
            message: `${getModelMetadataById(modelId)?.name ?? modelId} cannot edit an attached image. Pick ${capable.map((model) => model.name).join(' or ')} as the image model in Add to chat, or remove the attachment.`,
            switchModel: capable[0],
          }
        : {}),
    };
  }
  return { kind: 'ready', attachment };
}

export function resolveMobileImageGenerationRequest(
  input: ResolveMobileImageGenerationRequestInput,
): MobileImageGenerationRequestDecision {
  const text = input.text.trim();
  const attachments = input.attachments ?? [];
  const slashImageRequest = /^\/image(?:\s|$)/i.test(text);
  const explicitImageMode = input.mediaMode === 'image';
  const cloudDispatch =
    !explicitImageMode && input.executionMode === 'cloud' && attachments.length === 0
      ? resolveMobileCloudDispatch({
          selection: input.selection,
          message: text,
          subscriptionTier: input.subscriptionTier,
        })
      : null;
  const imageTaskRequest =
    slashImageRequest || explicitImageMode || cloudDispatch?.taskType === 'image_generation';

  if (!imageTaskRequest) return { status: 'not_requested' };

  const prompt = slashImageRequest ? text.slice('/image'.length).trim() : text;
  if (!prompt) return blocked('empty_prompt');
  if (input.executionMode !== 'cloud') return blocked('requires_cloud');
  if (!input.globalImageGenerationEnabled) return blocked('feature_unavailable');
  if (!input.imageGenerationEnabled) return blocked('disabled');
  if (!input.isClerkSignedIn || !input.ownerId) return blocked('auth_required');
  if (
    !input.grantedCapabilities.includes('canUseImages') ||
    !canUseBillingPlanCapability(input.subscriptionTier, 'image_generation')
  ) {
    return blocked('plan_required');
  }
  if (!input.isOnline) return blocked('offline');

  if (explicitImageMode || slashImageRequest) {
    const modelId = resolveMediaModelId('image');
    if (!modelId || getModelMetadataById(modelId)?.capabilities.imageGen !== true) {
      return blocked('route_unavailable');
    }
    const reference = resolveReferenceImage(attachments, modelId);
    if (reference.kind === 'blocked') {
      return blocked(reference.code, reference.message, reference.switchModel);
    }
    const aspectRatio = resolveAspectRatio(modelId, input.aspectRatio);
    return {
      status: 'ready',
      prompt,
      model: modelId,
      ...(aspectRatio ? { aspectRatio } : {}),
      ...transparencyFor(modelId, input.transparentBackground),
      ownerId: input.ownerId,
      ...(reference.kind === 'ready'
        ? {
            operation: 'edit' as const,
            sourceImage: reference.attachment,
            ...(attachments.length > 1 ? { referenceImages: attachments.slice(1) } : {}),
          }
        : {}),
    };
  }

  const imageDispatch =
    cloudDispatch?.status === 'selected' &&
    cloudDispatch.dispatch === 'media' &&
    getModelMetadataById(cloudDispatch.modelKey)?.capabilities.imageGen === true
      ? cloudDispatch
      : null;
  if (!imageDispatch) return blocked('route_unavailable');

  const dispatchAspectRatio = resolveAspectRatio(imageDispatch.modelKey, input.aspectRatio);
  return {
    status: 'ready',
    prompt,
    model: imageDispatch.modelKey,
    ...(dispatchAspectRatio ? { aspectRatio: dispatchAspectRatio } : {}),
    ...transparencyFor(imageDispatch.modelKey, input.transparentBackground),
    ownerId: input.ownerId,
  };
}

function guideImageRefusal(
  guides: readonly MobileImageReferenceAttachment[],
): ReferenceImageDecision | null {
  for (const guide of guides) {
    if (!guide.mimeType.startsWith('image/')) {
      return { kind: 'blocked', code: 'reference_image_invalid' };
    }
    if (typeof guide.fileSize === 'number' && guide.fileSize > MANAGED_MEDIA_IMAGE_REF_MAX_BYTES) {
      return { kind: 'blocked', code: 'reference_image_too_large' };
    }
  }
  return null;
}
