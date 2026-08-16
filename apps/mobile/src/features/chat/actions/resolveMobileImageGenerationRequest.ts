import {
  canUseBillingPlanCapability,
  getModelMetadataById,
  isImageAspectSupported,
} from '@agiworkforce/types';
import {
  MANAGED_MEDIA_IMAGE_ASPECT_RATIOS,
  type ManagedMediaImageAspectRatio,
} from '@agiworkforce/cloud-contracts';
import { resolveMobileCloudDispatch } from '@/src/features/chat/utils/cloudDispatchRouting';
import { resolveMediaModelId } from './mediaMode';

export type MobileImageGenerationBlockCode =
  | 'empty_prompt'
  | 'requires_cloud'
  | 'feature_unavailable'
  | 'disabled'
  | 'auth_required'
  | 'plan_required'
  | 'offline'
  | 'route_unavailable';

export interface MobileImageGenerationAlert {
  title: string;
  message: string;
}

export type MobileImageGenerationRequestDecision =
  | { status: 'not_requested' }
  | {
      status: 'blocked';
      code: MobileImageGenerationBlockCode;
      alert: MobileImageGenerationAlert;
    }
  | {
      status: 'ready';
      prompt: string;
      model: string;
      aspectRatio?: ManagedMediaImageAspectRatio;
      ownerId: string;
    };

export interface ResolveMobileImageGenerationRequestInput {
  executionMode: 'local' | 'cloud';
  text: string;
  mediaMode: 'text' | 'image' | 'video';
  selection: string;
  subscriptionTier?: string | null;
  hasAttachments: boolean;
  globalImageGenerationEnabled: boolean;
  imageGenerationEnabled: boolean;
  isClerkSignedIn: boolean;
  ownerId: string | null;
  grantedCapabilities: readonly string[];
  isOnline: boolean;
  aspectRatio?: string;
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
  };

function blocked(code: MobileImageGenerationBlockCode): MobileImageGenerationRequestDecision {
  return { status: 'blocked', code, alert: BLOCKED_ALERTS[code] };
}

export function resolveMobileImageGenerationRequest(
  input: ResolveMobileImageGenerationRequestInput,
): MobileImageGenerationRequestDecision {
  const text = input.text.trim();
  const slashImageRequest = /^\/image(?:\s|$)/i.test(text);
  const explicitImageMode = input.mediaMode === 'image';
  const cloudDispatch =
    !explicitImageMode && input.executionMode === 'cloud' && !input.hasAttachments
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
    if (input.hasAttachments) return blocked('route_unavailable');

    const modelId = resolveMediaModelId('image');
    if (!modelId || getModelMetadataById(modelId)?.capabilities.imageGen !== true) {
      return blocked('route_unavailable');
    }
    const aspectRatio = resolveAspectRatio(modelId, input.aspectRatio);
    return {
      status: 'ready',
      prompt,
      model: modelId,
      ...(aspectRatio ? { aspectRatio } : {}),
      ownerId: input.ownerId,
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
    ownerId: input.ownerId,
  };
}
