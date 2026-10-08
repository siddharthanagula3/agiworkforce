import type { CSSProperties } from 'react';
import { freeQuotaSelection } from './free-quota-selection';

export type MediaTurnCategory = 'image' | 'video';
export type MediaFrame = 'image-card' | 'inline-image' | 'video-player';

export interface MediaTurn {
  category: MediaTurnCategory;
  frame: MediaFrame;
  generating: boolean;
  aspectRatio?: string;
  progress?: number;
  taskId?: string;
}

export interface MediaTurnMessage {
  role: string;
  content: string;
  isStreaming?: boolean | undefined;
  model?: string | undefined;
  metadata?:
    | {
        toolType?: string | undefined;
        model?: string | undefined;
        requestedModel?: string | undefined;
        imageUrl?: string | undefined;
        imageGenAspect?: string | undefined;
        videoUrl?: string | undefined;
        videoAspect?: string | undefined;
        videoProgress?: number | undefined;
        videoTaskId?: string | undefined;
      }
    | undefined;
}

const TOOL_TYPE_CATEGORY: Readonly<Record<string, MediaTurnCategory>> = {
  'image-generation': 'image',
  'video-generation': 'video',
};

const FREE_VIDEO_RESULT_TEXT = 'Video generated.';

const PIXEL_SIZE = /^(\d+)\*(\d+)$/;
const RATIO = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;

const SQUARE = 1;
const WIDESCREEN = 16 / 9;
const IMAGE_CARD_SIDE_PX = 420;

interface FittedFrame {
  ratio: number;
  heightPx: number;
}

const FITTED_FRAME: Readonly<Record<Exclude<MediaFrame, 'image-card'>, FittedFrame>> = {
  'inline-image': { ratio: SQUARE, heightPx: 512 },
  'video-player': { ratio: WIDESCREEN, heightPx: 384 },
};

interface FreeMediaOffer {
  category: MediaTurnCategory;
  frame: MediaFrame;
  aspectRatio?: string;
}

function freeMediaOffer(message: MediaTurnMessage): FreeMediaOffer | null {
  const offering = freeQuotaSelection(
    message.metadata?.requestedModel ?? message.model ?? message.metadata?.model,
  );
  if (offering?.category !== 'image' && offering?.category !== 'video') return null;
  const size = PIXEL_SIZE.exec(offering.quotaVideoSize ?? offering.quotaImageSize ?? '');
  const aspectRatio = offering.quotaVideoRatio ?? (size ? `${size[1]}:${size[2]}` : undefined);
  return {
    category: offering.category,
    frame: offering.category === 'image' ? 'inline-image' : 'video-player',
    ...(aspectRatio ? { aspectRatio } : {}),
  };
}

export function mediaTurn(message: MediaTurnMessage): MediaTurn | null {
  if (message.role !== 'assistant') return null;
  const metadata = message.metadata;
  // A failed job has no media URL either, so a missing URL alone would keep a
  // dead turn animating. The writers clear the stream flag on every exit.
  const streaming = message.isStreaming === true;
  const declared = metadata?.toolType ? TOOL_TYPE_CATEGORY[metadata.toolType] : undefined;

  if (declared === 'image') {
    const aspectRatio = metadata?.imageGenAspect;
    return {
      category: 'image',
      frame: 'image-card',
      generating: streaming && !metadata?.imageUrl,
      ...(aspectRatio ? { aspectRatio } : {}),
    };
  }
  if (declared === 'video') {
    const aspectRatio = metadata?.videoAspect ?? freeMediaOffer(message)?.aspectRatio;
    return {
      category: 'video',
      frame: 'video-player',
      generating: streaming && !metadata?.videoUrl,
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(typeof metadata?.videoProgress === 'number' ? { progress: metadata.videoProgress } : {}),
      ...(typeof metadata?.videoTaskId === 'string' ? { taskId: metadata.videoTaskId } : {}),
    };
  }
  if (!streaming) return null;
  const offer = freeMediaOffer(message);
  return offer ? { ...offer, generating: !message.content.trim() } : null;
}

export function mediaTurnProse(message: MediaTurnMessage): string {
  const repeatsThePlayer =
    message.metadata?.toolType === 'video-generation' &&
    Boolean(message.metadata.videoUrl) &&
    message.content.trim() === FREE_VIDEO_RESULT_TEXT;
  return repeatsThePlayer ? '' : message.content;
}

function parseRatio(aspectRatio: string | undefined): number | null {
  const match = RATIO.exec(aspectRatio ?? '');
  if (!match) return null;
  const ratio = Number(match[1]) / Number(match[2]);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

export function hasKnownMediaFrame(aspectRatio: string | undefined): boolean {
  return parseRatio(aspectRatio) !== null;
}

export function mediaFrameStyle(frame: MediaFrame, aspectRatio: string | undefined): CSSProperties {
  if (frame === 'image-card') {
    return {
      width: `min(100%, ${IMAGE_CARD_SIDE_PX}px)`,
      maxHeight: IMAGE_CARD_SIDE_PX,
      aspectRatio: String(parseRatio(aspectRatio) ?? SQUARE),
    };
  }
  const fitted = FITTED_FRAME[frame];
  const ratio = parseRatio(aspectRatio) ?? fitted.ratio;
  return {
    width: `min(100%, ${Math.round(fitted.heightPx * ratio)}px)`,
    aspectRatio: String(ratio),
  };
}
