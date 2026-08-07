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
 * Natural-language video generation phrases ("make a video of …").
 *
 * Held to a stricter standard than the image equivalent, because the cost of a
 * false positive is not symmetric: video generation is a Max-15x/Enterprise
 * capability billed per second of output, so mistaking a chat request for a
 * video request spends real money and takes a minute to fail. The medium noun
 * is therefore mandatory and the verb list is short — merely SAYING the word
 * "video" is not a request to generate one, which is why `\b(video)\b` alone
 * would be the wrong pattern. "Explain how video codecs work" and "summarise
 * this video" must both stay in chat.
 */
const RE_VIDEO_PHRASE =
  /\b(generate|create|make|render|animate)\s+(me\s+)?(an?\s+|some\s+)?(\w+\s+){0,2}(video|clip|animation|movie|reel|gif)\b(?=\s*$|[.,!?]|\s+(of|about|showing|featuring|depicting|with|where|that|in which)\b)/i;

/**
 * Canonical Mobile admission for video turns, mirroring
 * `resolveMobileImageGenerationRequest`. Classifies and fails closed before
 * either chat screen mutates conversation state or calls the media route.
 *
 * Three ways in, in descending order of explicitness: a `/video` command, the
 * composer's Video mode, or — for parity with how Auto already routes image
 * requests — the wording of the prompt itself.
 *
 * Intent detection is confined to `mediaMode === 'text'` ON PURPOSE. In Image
 * mode the user has already named the output kind, and this resolver runs
 * BEFORE the image one, so an unguarded pattern would let "create a video game
 * character" hijack an explicit image request and bill it as video.
 */
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

  return { status: 'ready', prompt, model: modelId, ownerId: input.ownerId };
}
