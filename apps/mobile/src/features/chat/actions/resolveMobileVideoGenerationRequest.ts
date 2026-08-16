import { canUseBillingPlanCapability, getModelMetadataById } from '@agiworkforce/types';
import {
  MANAGED_MEDIA_VIDEO_ASPECT_RATIOS,
  MANAGED_MEDIA_VIDEO_RESOLUTIONS,
  type ManagedMediaVideoAspectRatio,
  type ManagedMediaVideoResolution,
} from '@agiworkforce/cloud-contracts';
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
      aspectRatio: ManagedMediaVideoAspectRatio;
      resolution: ManagedMediaVideoResolution;
      ownerId: string;
    };

export interface ResolveMobileVideoGenerationRequestInput {
  aspectRatio: string;
  resolution: string;
  executionMode: 'local' | 'cloud';
  text: string;
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

const RE_VIDEO_PHRASE =
  /\b(generate|create|make|render|animate)\s+(me\s+)?(an?\s+|some\s+)?(\w+\s+){0,2}(video|clip|animation|movie|reel|gif)\b(?=\s*$|[.,!?]|\s+(of|about|showing|featuring|depicting|with|where|that|in which)\b)/i;

export function resolveMobileVideoGenerationRequest(
  input: ResolveMobileVideoGenerationRequestInput,
): MobileVideoGenerationRequestDecision {
  const text = input.text.trim();
  const slashVideoRequest = /^\/video(?:\s|$)/i.test(text);
  const inferredVideoRequest = input.mediaMode === 'text' && RE_VIDEO_PHRASE.test(text);
  if (!slashVideoRequest && input.mediaMode !== 'video' && !inferredVideoRequest) {
    return { status: 'not_requested' };
  }

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

  return {
    status: 'ready',
    prompt,
    model: modelId,
    aspectRatio: MANAGED_MEDIA_VIDEO_ASPECT_RATIOS.includes(
      input.aspectRatio as ManagedMediaVideoAspectRatio,
    )
      ? (input.aspectRatio as ManagedMediaVideoAspectRatio)
      : '16:9',
    resolution: MANAGED_MEDIA_VIDEO_RESOLUTIONS.includes(
      input.resolution as ManagedMediaVideoResolution,
    )
      ? (input.resolution as ManagedMediaVideoResolution)
      : '720p',
    ownerId: input.ownerId,
  };
}
