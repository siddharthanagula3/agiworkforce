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
      /**
       * Only present when the chosen model's adapter actually publishes it.
       * Absent means "no opinion" and the route keeps its own default, which is
       * the honest outcome for a ratio the adapter cannot map — better than
       * sending one the route would reject and failing the whole turn.
       */
      aspectRatio?: ManagedMediaImageAspectRatio;
      ownerId: string;
    };

export interface ResolveMobileImageGenerationRequestInput {
  executionMode: 'local' | 'cloud';
  text: string;
  /** Composer output kind. 'image' means every send this turn is an image request. */
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
  /** Output shape chosen in the [+] sheet. Validated against the model here. */
  aspectRatio?: string;
}

/**
 * Narrow the caller's choice to a ratio the wire accepts AND the chosen model's
 * adapter publishes. Two gates, not one: the contract enum bounds the wire, and
 * the catalog bounds the adapter, so a persisted ratio that was valid for the
 * previous model is dropped rather than sent to one that would reject it.
 */
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

/**
 * Canonical Mobile admission for both new-chat and existing-conversation image
 * turns. This action classifies the request and fails closed before either
 * screen mutates conversation state or invokes the Cloud media action.
 */
export function resolveMobileImageGenerationRequest(
  input: ResolveMobileImageGenerationRequestInput,
): MobileImageGenerationRequestDecision {
  const text = input.text.trim();
  const slashImageRequest = /^\/image(?:\s|$)/i.test(text);
  // Image mode is an explicit user choice, so it admits EVERY send this turn
  // and never consults the wording classifier. Without this the composer could
  // sit in Image mode showing the image model's name while a prompt that did
  // not happen to contain an image word ("Create an stylist anime MC") fell
  // through to chat completions and came back as prose — the mode chip and the
  // model that actually answered disagreeing on screen.
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

  // In Image mode the model is whatever the user picked in the Add-to-chat
  // catalog (falling back to the image_generation slot), the same source the
  // composer chip reads. Routing through the dispatcher here would ignore that
  // choice and re-derive a model from the prompt's wording.
  if (explicitImageMode || slashImageRequest) {
    // The generate route is prompt-only — it accepts no input images. An
    // explicit request that carries attachments has to fail loudly here;
    // dropping the attachments and generating from the prompt alone would
    // silently answer a different question than the one that was asked.
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
