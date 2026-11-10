import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InteractiveCard } from '@agiworkforce/types';
import {
  ChromeVideoError,
  isChromeVideoTaskId,
  readChromeVideoStatus,
  startChromeVideo,
} from '../src/features/cloud-bridge/videoGenerationClient';
import { buildBubbleWithTools } from '../src/features/side-panel/bubbles';
import type { SidePanelChatMessage } from '../src/features/side-panel/chat-state';
import { openImageViewer } from '../src/features/side-panel/mediaViewer';
import {
  buildAnswerFiles,
  clearAnswerFilePreviews,
  savedFileName,
  type AnswerFileAccess,
} from '../src/features/side-panel/generatedFiles';

const catalog = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '_locales', 'en', 'messages.json'),
    'utf8',
  ),
) as Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

function getMessage(key: string, substitutions: string[] = []): string {
  const entry = catalog[key];
  if (!entry) return '';
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_match, name: string) =>
    (entry.placeholders?.[name.toLowerCase()]?.content ?? '').replace(
      /\$(\d)/g,
      (_digit, index: string) => substitutions[Number(index) - 1] ?? '',
    ),
  );
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  clearAnswerFilePreviews();
  (globalThis as { chrome?: unknown }).chrome = {
    i18n: { getMessage, getUILanguage: () => 'en' },
    runtime: { getManifest: () => ({ version: '0.0.1' }) },
  };
});

afterEach(async () => {
  clearAnswerFilePreviews();
  delete (globalThis as { chrome?: unknown }).chrome;
  document.body.replaceChildren();
  await Promise.resolve();
  vi.restoreAllMocks();
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('video generation client', () => {
  it('starts a video on the managed route with a chrome media key and the bearer token', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, { success: true, task_id: 'vid_123', status: 'queued' }),
    );
    const task = await startChromeVideo('a lighthouse at dusk', {
      getAuthToken: async () => 'token-1',
      fetchImpl,
      operationId: () => '0190a000-0000-7000-8000-000000000001',
    });

    expect(task).toEqual({ taskId: 'vid_123', status: 'queued' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/media\/video\/generate$/);
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer token-1');
    expect(headers['Idempotency-Key']).toBe(
      'agi.media.chrome.video.0190a000-0000-7000-8000-000000000001',
    );
    expect(JSON.parse(String(init.body))).toEqual({ prompt: 'a lighthouse at dusk' });
  });

  it('marks a plan refusal as an upgrade, never as a usage meter', async () => {
    const fetchImpl = vi.fn(async () =>
      json(403, {
        error: {
          message: 'Video generation is available on paid plans.',
          code: 'plan_upgrade_required',
        },
      }),
    );
    const failure = await startChromeVideo('a lighthouse', {
      getAuthToken: async () => 'token-1',
      fetchImpl,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ChromeVideoError);
    expect((failure as ChromeVideoError).upgradeRequired).toBe(true);
    expect((failure as ChromeVideoError).message).toBe(
      'Video generation is available on paid plans.',
    );
  });

  it('refuses to start while signed out', async () => {
    const fetchImpl = vi.fn();
    await expect(
      startChromeVideo('a lighthouse', { getAuthToken: async () => null, fetchImpl }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads progress and the finished video address from the status route', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, {
        success: true,
        task_id: 'vid_123',
        status: 'completed',
        video_url: '/api/files/0f8fad5b-d9cb-469f-a165-70867728950e',
      }),
    );
    const task = await readChromeVideoStatus('vid_123', {
      getAuthToken: async () => 'token-1',
      fetchImpl,
    });
    expect(task.videoUrl).toBe('/api/files/0f8fad5b-d9cb-469f-a165-70867728950e');
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toMatch(
      /\/api\/media\/video\/status\?task_id=vid_123$/,
    );
  });

  it('rejects task ids that could carry a path or a query', () => {
    expect(isChromeVideoTaskId('vid_123')).toBe(true);
    expect(isChromeVideoTaskId('../files')).toBe(false);
    expect(isChromeVideoTaskId('a?b=c')).toBe(false);
  });
});

describe('produced media in an answer', () => {
  const access: AnswerFileAccess = {
    resolveUrl: (uri) => `https://agiworkforce.com${uri}`,
    fetchFile: vi.fn(async () => new Blob(['mp4'], { type: 'video/mp4' })),
    openUrl: vi.fn(),
  };

  function mountedVideos(
    count: number,
    prefix: string,
    fileAccess: AnswerFileAccess = access,
  ): HTMLElement {
    const list = buildAnswerFiles(
      Array.from({ length: count }, (_, index) => ({
        key: `${prefix}-${index}`,
        name: `Clip ${index}`,
        mimeType: 'video/mp4',
        uri: `/api/files/${prefix}-${index}`,
        surface: 'file' as const,
      })),
      fileAccess,
    )!;
    document.body.appendChild(list);
    return list;
  }

  it('does not revoke any of five mounted player URLs when the four-entry cache fills', async () => {
    let sequence = 0;
    const revokeObjectURL = vi.fn();
    Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:five-mounted-${++sequence}`),
      revokeObjectURL,
    });
    const list = mountedVideos(5, 'five-mounted');
    await vi.waitFor(() => expect(list.querySelectorAll('video')).toHaveLength(5));
    const revoked = new Set(revokeObjectURL.mock.calls.map(([url]) => url));
    expect(
      Array.from(list.querySelectorAll('video')).filter((video) => revoked.has(video.src)),
    ).toEqual([]);
  });

  it('does not create an object URL for a player removed before its fetch completes', async () => {
    const createObjectURL = vi.fn(() => 'blob:detached-before-load');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    let finish!: (blob: Blob) => void;
    const pending = new Promise<Blob>((resolve) => {
      finish = resolve;
    });
    const fetchFile = vi.fn(async (_url: string) => pending);
    const list = mountedVideos(1, 'detached-before-load', { ...access, fetchFile });
    await vi.waitFor(() => expect(fetchFile).toHaveBeenCalledOnce());
    list.remove();
    finish(new Blob(['mp4'], { type: 'video/mp4' }));
    await pending;
    await Promise.resolve();
    await Promise.resolve();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('releases a shared player URL only after the last mounted consumer leaves', async () => {
    let sequence = 0;
    const revokeObjectURL = vi.fn();
    Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:shared-players-${++sequence}`),
      revokeObjectURL,
    });
    const fetchFile = vi.fn(async (_url: string) => new Blob(['mp4'], { type: 'video/mp4' }));
    const sharedAccess = { ...access, fetchFile };
    const first = mountedVideos(1, 'shared-players', sharedAccess);
    const second = mountedVideos(1, 'shared-players', sharedAccess);
    await vi.waitFor(() => expect(document.querySelectorAll('video')).toHaveLength(2));
    const source = first.querySelector('video')!.src;
    expect(second.querySelector('video')!.src).toBe(source);
    expect(fetchFile).toHaveBeenCalledOnce();
    first.remove();
    await Promise.resolve();
    expect(revokeObjectURL).not.toHaveBeenCalledWith(source);
    second.remove();
    await Promise.resolve();
    await Promise.resolve();
    expect(revokeObjectURL).toHaveBeenCalledWith(source);
  });

  it('does not fetch a detached preview that was never mounted', async () => {
    const fetchFile = vi.fn(async (_url: string) => new Blob(['mp4'], { type: 'video/mp4' }));
    const list = buildAnswerFiles(
      [
        {
          key: 'never-mounted',
          name: 'Clip',
          mimeType: 'video/mp4',
          uri: '/api/files/never-mounted',
          surface: 'file',
        },
      ],
      { ...access, fetchFile },
    )!;
    await Promise.resolve();
    expect(fetchFile).not.toHaveBeenCalled();
    document.body.appendChild(list);
    await vi.waitFor(() => expect(list.querySelector('video')).not.toBeNull());
    expect(fetchFile).toHaveBeenCalledOnce();
  });

  it('releases mounted media and refetches the same URI after its account preview scope resets', async () => {
    let sequence = 0;
    const revokeObjectURL = vi.fn();
    Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:account-reset-${++sequence}`),
      revokeObjectURL,
    });
    const fetchFile = vi.fn(async (_url: string) => new Blob(['mp4'], { type: 'video/mp4' }));
    const scopedAccess = { ...access, fetchFile };
    const first = mountedVideos(1, 'account-reset', scopedAccess);
    await vi.waitFor(() => expect(first.querySelector('video')).not.toBeNull());
    const source = first.querySelector('video')!.src;
    openImageViewer('blob:owner-preview', 'Owner preview');
    expect(document.querySelector('.sp-media-viewer')).not.toBeNull();
    clearAnswerFilePreviews();
    expect(document.querySelector('.sp-media-viewer')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith(source);
    expect(first.querySelector('video')!.getAttribute('src')).toBeNull();
    const second = mountedVideos(1, 'account-reset', scopedAccess);
    await vi.waitFor(() =>
      expect(second.querySelector('video')?.getAttribute('src')).toBe('blob:account-reset-2'),
    );
    expect(fetchFile).toHaveBeenCalledTimes(2);
  });

  it('keeps the inactive blob cache bounded while creating fresh URLs for remounted players', async () => {
    let sequence = 0;
    Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:idle-bound-${++sequence}`),
      revokeObjectURL: vi.fn(),
    });
    const fetchFile = vi.fn(async (_url: string) => new Blob(['mp4'], { type: 'video/mp4' }));
    const scopedAccess = { ...access, fetchFile };
    for (let index = 0; index < 6; index += 1) {
      const list = mountedVideos(1, `idle-bound-${index}`, scopedAccess);
      await vi.waitFor(() => expect(list.querySelector('video')).not.toBeNull());
      list.remove();
      await Promise.resolve();
    }
    const oldest = mountedVideos(1, 'idle-bound-0', scopedAccess);
    await vi.waitFor(() => expect(oldest.querySelector('video')).not.toBeNull());
    expect(fetchFile.mock.calls.filter(([url]) => url.endsWith('/idle-bound-0-0'))).toHaveLength(2);
    const warmSource = oldest.querySelector('video')!.src;
    oldest.remove();
    await Promise.resolve();
    const warm = mountedVideos(1, 'idle-bound-0', scopedAccess);
    await vi.waitFor(() => expect(warm.querySelector('video')).not.toBeNull());
    expect(warm.querySelector('video')!.src).not.toBe(warmSource);
    expect(fetchFile.mock.calls.filter(([url]) => url.endsWith('/idle-bound-0-0'))).toHaveLength(2);
  });

  it('plays a produced video inline and keeps the download', async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:video-1'), revokeObjectURL: vi.fn() });
    const list = buildAnswerFiles(
      [
        {
          key: 'vid_123',
          name: 'Generated video',
          mimeType: 'video/mp4',
          uri: '/api/files/video-1',
          surface: 'file',
        },
      ],
      access,
    )!;
    document.body.appendChild(list);
    await vi.waitFor(() => expect(list.querySelector('video')).not.toBeNull());
    const video = list.querySelector('video')!;
    expect(video.getAttribute('src')).toBe('blob:video-1');
    expect(video.hasAttribute('controls')).toBe(true);
    expect(list.querySelector('[aria-label="Download Generated video"]')).not.toBeNull();
  });

  it('names a download from what the server actually sent', () => {
    expect(savedFileName('Generated video', 'video/mp4')).toBe('Generated video.mp4');
    expect(savedFileName('Generated image 1', 'image/webp')).toBe('Generated image 1.webp');
    expect(savedFileName('report.pdf', 'application/pdf')).toBe('report.pdf');
  });

  it('shows that a video is being made until the file arrives', () => {
    const msg: SidePanelChatMessage = {
      id: 'v-1',
      role: 'assistant',
      content: '',
      timestamp: 0,
      videoTaskId: 'vid_123',
    };
    const bubble = buildBubbleWithTools(msg, { fileAccess: access });
    expect(bubble.querySelector('#sp-video-progress-v-1')?.textContent).toBe(
      'Creating your video. This usually takes a minute or two.',
    );
    expect(bubble.querySelector<HTMLElement>('.sp-bubble')!.hidden).toBe(true);
  });

  it('renders the loading logo beside the video progress label', () => {
    const msg: SidePanelChatMessage = {
      id: 'v-2',
      role: 'assistant',
      content: '',
      timestamp: 0,
      videoTaskId: 'vid_123',
    };
    const bubble = buildBubbleWithTools(msg, { fileAccess: access });
    const label = bubble.querySelector('#sp-video-progress-v-2 .sp-video-progress__label');
    expect(label?.textContent).toContain('Creating your video');
    const mark = bubble.querySelector<HTMLImageElement>('#sp-video-progress-v-2 .agi-loading-mark');
    expect(mark).not.toBeNull();
    expect(mark?.alt).toBe('');
    expect(mark?.width).toBe(14);
    expect(bubble.querySelector('#sp-video-progress-v-2 .agi-icon')?.textContent).toBe('');
  });

  it('renders an image card from a chat turn with each image downloadable', async () => {
    const card = {
      schemaVersion: 1,
      cardId: 'image-call-1',
      kind: 'image.v1',
      recognized: true,
      createdAt: '2026-10-17T10:00:00.000Z',
      fallback: { headline: 'Generated image', text: 'A red fox in snow' },
      producedBy: { toolCallId: 'image-call-1', toolName: 'generate_image' },
      body: {
        operation: 'generate',
        prompt: 'A red fox in snow',
        images: [
          { assetId: 'asset-1', url: '/api/files/asset-1' },
          { assetId: 'asset-2', url: '/api/files/asset-2' },
        ],
      },
    } as unknown as InteractiveCard;
    const imageAccess: AnswerFileAccess = {
      ...access,
      fetchFile: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
    };
    const bubble = buildBubbleWithTools(
      {
        id: 'a-1',
        role: 'assistant',
        content: 'Here is your fox.',
        timestamp: 0,
        interactiveCards: [card],
      },
      { fileAccess: imageAccess },
    );
    const section = bubble.querySelector('[data-card-kind="image.v1"]')!;
    expect(section.getAttribute('aria-label')).toBe('Generated image');
    expect(section.querySelectorAll('figure')).toHaveLength(2);
    expect(section.querySelector('[aria-label="Download Generated image 2"]')).not.toBeNull();
    await vi.waitFor(() =>
      expect(section.querySelectorAll('.sp-answer-image__open img')).toHaveLength(2),
    );
  });
});
