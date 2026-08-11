import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modelsCatalog, type ModelMetadata } from '@agiworkforce/types';
import {
  OpenRouterVideoSubmissionOutcomeUnknownError,
  openRouterVideoContentRequest,
  pollOpenRouterVideo,
  submitOpenRouterVideo,
} from './openrouter-video-provider-service';

const TASK_ID = 'synthetic-task-1';

function catalogModel(): ModelMetadata {
  const candidates = Object.values(modelsCatalog.models).filter(
    (model) =>
      model.provider === 'open_router' &&
      model.modelType === 'video' &&
      model.videoGeneration?.pricing?.unit === 'video_tokens',
  );
  expect(candidates).toHaveLength(1);
  return candidates[0]!;
}

describe('OpenRouter video provider mechanics', () => {
  const fetchMock = vi.fn();
  const savedKey = process.env['OPENROUTER_API_KEY'];
  const savedBase = process.env['OPENROUTER_BASE_URL'];
  const savedAppUrl = process.env['NEXT_PUBLIC_APP_URL'];
  const savedSecret = process.env['OPENROUTER_WEBHOOK_SECRET'];

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env['OPENROUTER_API_KEY'] = 'synthetic-provider-key';
    delete process.env['OPENROUTER_BASE_URL'];
    delete process.env['NEXT_PUBLIC_APP_URL'];
    delete process.env['OPENROUTER_WEBHOOK_SECRET'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedKey === undefined) delete process.env['OPENROUTER_API_KEY'];
    else process.env['OPENROUTER_API_KEY'] = savedKey;
    if (savedBase === undefined) delete process.env['OPENROUTER_BASE_URL'];
    else process.env['OPENROUTER_BASE_URL'] = savedBase;
    if (savedAppUrl === undefined) delete process.env['NEXT_PUBLIC_APP_URL'];
    else process.env['NEXT_PUBLIC_APP_URL'] = savedAppUrl;
    if (savedSecret === undefined) delete process.env['OPENROUTER_WEBHOOK_SECRET'];
    else process.env['OPENROUTER_WEBHOOK_SECRET'] = savedSecret;
  });

  it('submits the catalog model with exact pixel dimensions and no unsigned callback', async () => {
    const model = catalogModel();
    const output = model.videoGeneration!.outputSizes[0]!;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ id: TASK_ID, polling_url: `/videos/${TASK_ID}`, status: 'pending' }),
        {
          status: 202,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await submitOpenRouterVideo({
      providerModelId: model.apiModelId ?? model.id,
      prompt: 'A synthetic test scene',
      durationSecs: model.videoGeneration!.durationSecs[0]!,
      width: output.width,
      height: output.height,
      generateAudio: true,
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: model.apiModelId,
      size: `${output.width}x${output.height}`,
      generate_audio: true,
    });
    expect(body).not.toHaveProperty('callback_url');
  });

  it('adds the callback only when an HTTPS app URL and signing secret are configured', async () => {
    const model = catalogModel();
    const output = model.videoGeneration!.outputSizes[0]!;
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://app.example.test';
    process.env['OPENROUTER_WEBHOOK_SECRET'] = 'synthetic-signing-secret';
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ id: TASK_ID, polling_url: `/videos/${TASK_ID}`, status: 'pending' }),
        {
          status: 202,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await submitOpenRouterVideo({
      providerModelId: model.apiModelId ?? model.id,
      prompt: 'A synthetic test scene',
      durationSecs: model.videoGeneration!.durationSecs[0]!,
      width: output.width,
      height: output.height,
      generateAudio: false,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body)) as Record<string, unknown>;
    expect(body['callback_url']).toBe(
      'https://app.example.test/api/media/video/openrouter-webhook',
    );
  });

  it('marks ambiguous create responses as outcome unknown instead of retrying', async () => {
    const model = catalogModel();
    const output = model.videoGeneration!.outputSizes[0]!;
    fetchMock.mockResolvedValue(new Response('upstream timeout', { status: 504 }));

    await expect(
      submitOpenRouterVideo({
        providerModelId: model.apiModelId ?? model.id,
        prompt: 'A synthetic test scene',
        durationSecs: model.videoGeneration!.durationSecs[0]!,
        width: output.width,
        height: output.height,
        generateAudio: true,
      }),
    ).rejects.toBeInstanceOf(OpenRouterVideoSubmissionOutcomeUnknownError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses provider usage for completed cost and ignores unsigned output URLs', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: TASK_ID,
          polling_url: `/videos/${TASK_ID}`,
          status: 'completed',
          unsigned_urls: ['https://untrusted.example/video.mp4'],
          usage: { cost: 1.234, is_byok: false },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(pollOpenRouterVideo(TASK_ID)).resolves.toEqual({
      status: 'completed',
      contentIndex: 0,
      actualCostCents: 124,
    });
  });

  it.each([{ usage: undefined }, { usage: { cost: Number.MAX_VALUE } }])(
    'fails closed when completed provider usage cannot be durably billed: $usage',
    async ({ usage }) => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            id: TASK_ID,
            status: 'completed',
            ...(usage === undefined ? {} : { usage }),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

      await expect(pollOpenRouterVideo(TASK_ID)).rejects.toMatchObject({
        name: 'OpenRouterVideoPollError',
      });
    },
  );

  it('builds only an authenticated provider content request', () => {
    const request = openRouterVideoContentRequest(TASK_ID, 0);
    expect(request.url).toContain(`/videos/${TASK_ID}/content?index=0`);
    expect(request.headers).toEqual({ Authorization: 'Bearer synthetic-provider-key' });
  });
});
