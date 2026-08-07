import { canUseBillingPlanCapability, getModelMetadataById } from '@agiworkforce/types';
import { resolveMediaModelId } from './mediaMode';

export type MobileVideoGenerationBlockCode =
  | 'empty_prompt'
  | 'requires_cloud'
  | 'auth_required'
  | 'plan_required'
  | 'offline'
  | 'route_unavailable';

export interface MobileVideoGenerationAlert {
  title: string;
  message: string;
}

export type MobileVideoGenerationRequestDecision =
  | { status: 'not_requested' }
  | {
      status: 'blocked';
      code: MobileVideoGenerationBlockCode;
      alert: MobileVideoGenerationAlert;
    }
  | {
      status: 'ready';
      prompt: string;
      model: string;
      ownerId: string;
    };

export interface ResolveMobileVideoGenerationRequestInput {
  executionMode: 'local' | 'cloud';
  text: string;
  /** Composer output kind. 'video' means every send this turn is a video request. */
  mediaMode: 'text' | 'image' | 'video';
  subscriptionTier?: string | null;
  isClerkSignedIn: boolean;
  ownerId: string | null;
  grantedCapabilities: readonly string[];
  isOnline: boolean;
}

const BLOCKED_ALERTS: Readonly<Record<MobileVideoGenerationBlockCode, MobileVideoGenerationAlert>> =
  {
    empty_prompt: {
      title: 'Add a video prompt',
      message: 'Describe the video you want AGI to create.',
    },
    requires_cloud: {
      title: 'Video generation uses AGI Cloud',
      message: 'Start an AGI Cloud chat to generate video. Local Mode runs entirely on-device.',
    },
    auth_required: {
      title: 'Sign in to generate video',
      message: 'Video generation uses your signed-in AGI Cloud account.',
    },
    plan_required: {
      title: 'Video generation is not included',
      message: 'Video generation is available on Max 15x and Enterprise plans.',
    },
    offline: {
      title: 'Network connection required',
      message: 'Video generation needs AGI Cloud. Connect to the internet and try again.',
    },
    route_unavailable: {
      title: 'Video generation is unavailable',
      message: 'No eligible video model is available right now. Try again later.',
    },
  };

function blocked(code: MobileVideoGenerationBlockCode): MobileVideoGenerationRequestDecision {
  return { status: 'blocked', code, alert: BLOCKED_ALERTS[code] };
}

/**
 * Canonical Mobile admission for video turns, mirroring
 * `resolveMobileImageGenerationRequest`. Classifies and fails closed before
 * either chat screen mutates conversation state or calls the media route.
 *
 * Unlike image, there is no local task classifier here: video is an explicit
 * user choice (the composer's Video mode, or a `/video` command), never
 * something inferred from the wording of a prompt. Guessing wrong would spend a
 * Max-tier video generation on someone who just mentioned the word "video".
 */
export function resolveMobileVideoGenerationRequest(
  input: ResolveMobileVideoGenerationRequestInput,
): MobileVideoGenerationRequestDecision {
  const text = input.text.trim();
  const slashVideoRequest = /^\/video(?:\s|$)/i.test(text);
  if (!slashVideoRequest && input.mediaMode !== 'video') return { status: 'not_requested' };

  const prompt = slashVideoRequest ? text.slice('/video'.length).trim() : text;
  if (!prompt) return blocked('empty_prompt');
  if (input.executionMode !== 'cloud') return blocked('requires_cloud');
  if (!input.isClerkSignedIn || !input.ownerId) return blocked('auth_required');
  if (
    !input.grantedCapabilities.includes('canUseImages') ||
    !canUseBillingPlanCapability(input.subscriptionTier, 'video_generation')
  ) {
    return blocked('plan_required');
  }
  if (!input.isOnline) return blocked('offline');

  const modelId = resolveMediaModelId('video');
  if (!modelId || getModelMetadataById(modelId)?.capabilities.videoGen !== true) {
    return blocked('route_unavailable');
  }

  return { status: 'ready', prompt, model: modelId, ownerId: input.ownerId };
}
