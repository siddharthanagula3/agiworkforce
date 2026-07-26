import { canUseBillingPlanCapability, getModelMetadataById } from '@agiworkforce/types';
import { resolveMobileCloudDispatch } from '@/src/features/chat/utils/cloudDispatchRouting';

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
      ownerId: string;
    };

export interface ResolveMobileImageGenerationRequestInput {
  executionMode: 'local' | 'cloud';
  text: string;
  selection: string;
  subscriptionTier?: string | null;
  hasAttachments: boolean;
  globalImageGenerationEnabled: boolean;
  imageGenerationEnabled: boolean;
  isClerkSignedIn: boolean;
  ownerId: string | null;
  grantedCapabilities: readonly string[];
  isOnline: boolean;
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
  const cloudDispatch =
    input.executionMode === 'cloud' && !input.hasAttachments
      ? resolveMobileCloudDispatch({
          selection: input.selection,
          message: text,
          subscriptionTier: input.subscriptionTier,
        })
      : null;
  const imageTaskRequest = slashImageRequest || cloudDispatch?.taskType === 'image_generation';

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

  const imageDispatch =
    cloudDispatch?.status === 'selected' &&
    cloudDispatch.dispatch === 'media' &&
    getModelMetadataById(cloudDispatch.modelKey)?.capabilities.imageGen === true
      ? cloudDispatch
      : null;
  if (!imageDispatch) return blocked('route_unavailable');

  return {
    status: 'ready',
    prompt,
    model: imageDispatch.modelKey,
    ownerId: input.ownerId,
  };
}
