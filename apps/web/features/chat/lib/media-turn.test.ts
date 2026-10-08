import { describe, expect, it } from 'vitest';
import { getProviderOfferings } from '@agiworkforce/types';
import {
  hasKnownMediaFrame,
  mediaFrameStyle,
  mediaTurn,
  mediaTurnProse,
  type MediaTurnMessage,
} from './media-turn';

function offeringKey(protocol: string, field?: 'quotaVideoRatio' | 'quotaVideoSize'): string {
  const entry = Object.entries(getProviderOfferings()).find(
    ([, offering]) =>
      offering.identityStatus === 'exact' &&
      offering.quotaProbeProtocol === protocol &&
      (!field || Boolean(offering[field])),
  );
  if (!entry) throw new Error(`The catalog must expose a free ${protocol} offering`);
  return entry[0];
}

const FREE_VIDEO_BY_RATIO = offeringKey('video-async', 'quotaVideoRatio');
const FREE_VIDEO_BY_SIZE = offeringKey('video-async', 'quotaVideoSize');
const FREE_IMAGE = offeringKey('image-sync');
const FREE_CHAT = offeringKey('chat');
const UNRESOLVED_VIDEO = Object.entries(getProviderOfferings()).find(
  ([, offering]) => offering.category === 'video' && !offering.quotaProbeProtocol,
)?.[0];

function pending(model: string, overrides: Partial<MediaTurnMessage> = {}): MediaTurnMessage {
  return {
    role: 'assistant',
    content: '',
    isStreaming: true,
    model,
    metadata: { model, requestedModel: model },
    ...overrides,
  };
}

function pixelRatio(size: string | undefined): string {
  const [width, height] = (size ?? '').split('*');
  return `${width}:${height}`;
}

describe('mediaTurn · the managed route, which stamps a tool type', () => {
  it('reports a pending image with the aspect it was asked for', () => {
    expect(
      mediaTurn({
        role: 'assistant',
        content: '',
        isStreaming: true,
        metadata: { toolType: 'image-generation', imageGenAspect: '3:4' },
      }),
    ).toEqual({ category: 'image', frame: 'image-card', generating: true, aspectRatio: '3:4' });
  });

  it('reports a pending video with the progress and job the route gave it', () => {
    expect(
      mediaTurn({
        role: 'assistant',
        content: '',
        isStreaming: true,
        metadata: {
          toolType: 'video-generation',
          videoAspect: '9:16',
          videoProgress: 33,
          videoTaskId: 'task-1',
        },
      }),
    ).toEqual({
      category: 'video',
      frame: 'video-player',
      generating: true,
      aspectRatio: '9:16',
      progress: 33,
      taskId: 'task-1',
    });
  });

  it('stops generating once the media, an error, or the end of the stream arrives', () => {
    const base = { role: 'assistant', content: '' } as const;
    expect(
      mediaTurn({
        ...base,
        isStreaming: true,
        metadata: { toolType: 'video-generation', videoUrl: '/api/files/a' },
      })?.generating,
    ).toBe(false);
    expect(
      mediaTurn({
        ...base,
        isStreaming: true,
        metadata: { toolType: 'image-generation', imageUrl: '/api/files/a' },
      })?.generating,
    ).toBe(false);
    expect(
      mediaTurn({ ...base, isStreaming: false, metadata: { toolType: 'video-generation' } })
        ?.generating,
    ).toBe(false);
  });
});

describe('mediaTurn · the free-quota route, which stamps nothing until it finishes', () => {
  it('knows a pending video turn from the model it was sent to', () => {
    expect(mediaTurn(pending(FREE_VIDEO_BY_RATIO))).toEqual({
      category: 'video',
      frame: 'video-player',
      generating: true,
      aspectRatio: getProviderOfferings()[FREE_VIDEO_BY_RATIO]?.quotaVideoRatio,
    });
  });

  it('reads the frame from a pixel size when the offering states no ratio', () => {
    expect(mediaTurn(pending(FREE_VIDEO_BY_SIZE))?.aspectRatio).toBe(
      pixelRatio(getProviderOfferings()[FREE_VIDEO_BY_SIZE]?.quotaVideoSize),
    );
  });

  it('knows a pending image turn, which lands as an inline image with no progress or job', () => {
    expect(mediaTurn(pending(FREE_IMAGE))).toEqual({
      category: 'image',
      frame: 'inline-image',
      generating: true,
      aspectRatio: pixelRatio(getProviderOfferings()[FREE_IMAGE]?.quotaImageSize),
    });
  });

  it('prefers the requested model over the one the server resolved', () => {
    expect(
      mediaTurn(
        pending(FREE_CHAT, { metadata: { model: FREE_CHAT, requestedModel: FREE_VIDEO_BY_RATIO } }),
      )?.category,
    ).toBe('video');
  });

  it('stops generating when text arrives and is no media turn once the stream ends', () => {
    expect(mediaTurn(pending(FREE_VIDEO_BY_RATIO, { content: 'Refused.' }))?.generating).toBe(
      false,
    );
    expect(mediaTurn(pending(FREE_VIDEO_BY_RATIO, { isStreaming: false }))).toBeNull();
  });

  it('keeps the frame of a finished free video, which carries no aspect of its own', () => {
    expect(
      mediaTurn({
        role: 'assistant',
        content: 'Video generated.',
        isStreaming: false,
        model: FREE_VIDEO_BY_RATIO,
        metadata: { toolType: 'video-generation', videoUrl: '/api/files/a' },
      }),
    ).toEqual({
      category: 'video',
      frame: 'video-player',
      generating: false,
      aspectRatio: getProviderOfferings()[FREE_VIDEO_BY_RATIO]?.quotaVideoRatio,
    });
  });

  it('is not a media turn for a chat offering, an unresolved offering, or a user message', () => {
    expect(mediaTurn(pending(FREE_CHAT))).toBeNull();
    expect(UNRESOLVED_VIDEO).toBeTruthy();
    expect(mediaTurn(pending(UNRESOLVED_VIDEO!))).toBeNull();
    expect(mediaTurn(pending(FREE_VIDEO_BY_RATIO, { role: 'user' }))).toBeNull();
    expect(mediaTurn({ role: 'assistant', content: '', isStreaming: true })).toBeNull();
  });
});

describe('mediaTurnProse', () => {
  const finished = {
    role: 'assistant',
    isStreaming: false,
    metadata: { toolType: 'video-generation', videoUrl: '/api/files/a' },
  } as const;

  it('drops the stored status line that repeats the player', () => {
    expect(mediaTurnProse({ ...finished, content: 'Video generated.' })).toBe('');
  });

  it('keeps anything else a video turn says', () => {
    expect(mediaTurnProse({ ...finished, content: 'Video generated. Here is why.' })).toBe(
      'Video generated. Here is why.',
    );
    expect(
      mediaTurnProse({
        role: 'assistant',
        content: 'Video generated.',
        metadata: { toolType: 'video-generation' },
      }),
    ).toBe('Video generated.');
    expect(mediaTurnProse({ role: 'assistant', content: 'Video generated.' })).toBe(
      'Video generated.',
    );
  });
});

describe('mediaFrameStyle', () => {
  it('fits a video inside the height the player is capped at', () => {
    expect(mediaFrameStyle('video-player', '16:9')).toEqual({
      width: 'min(100%, 683px)',
      aspectRatio: String(16 / 9),
    });
    expect(mediaFrameStyle('video-player', '9:16')).toEqual({
      width: 'min(100%, 216px)',
      aspectRatio: String(9 / 16),
    });
  });

  it('fits an inline image inside the height the markdown renderer caps it at', () => {
    expect(mediaFrameStyle('inline-image', '1024:1024')).toEqual({
      width: 'min(100%, 512px)',
      aspectRatio: '1',
    });
  });

  it('gives a card image the width and height the result card is capped at', () => {
    expect(mediaFrameStyle('image-card', '3:4')).toEqual({
      width: 'min(100%, 420px)',
      maxHeight: 420,
      aspectRatio: String(3 / 4),
    });
  });

  it('defaults to a square image and a widescreen video when the ratio is unknown', () => {
    expect(mediaFrameStyle('image-card', 'auto').aspectRatio).toBe('1');
    expect(mediaFrameStyle('inline-image', undefined).aspectRatio).toBe('1');
    expect(mediaFrameStyle('video-player', undefined).aspectRatio).toBe(String(16 / 9));
    expect(hasKnownMediaFrame('auto')).toBe(false);
    expect(hasKnownMediaFrame('0:9')).toBe(false);
    expect(hasKnownMediaFrame('1280:720')).toBe(true);
  });
});
