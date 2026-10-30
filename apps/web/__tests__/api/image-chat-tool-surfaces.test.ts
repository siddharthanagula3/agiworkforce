import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { EDIT_IMAGE_TOOL_NAME, GENERATE_IMAGE_TOOL_NAME } from '@agiworkforce/types';

type ProviderModule = typeof import('@/app/api/media/image/lib/image-generation-provider');
type StorageModule = typeof import('@/lib/server/media-storage');

type OriginalManagedImageGenerationModule =
  typeof import('@/app/api/media/image/lib/managed-image-generation');
type OriginalMediaAssetsModule = typeof import('@/lib/server/media-assets');

vi.mock('server-only', () => ({}));

const storage = vi.hoisted(() => ({ configured: true }));
const pipeline = vi.hoisted(() => ({ generate: vi.fn() }));
const imageSources = vi.hoisted(() => ({ latest: vi.fn(), byId: vi.fn() }));

vi.mock('@/app/api/media/image/lib/managed-image-generation', async (importOriginal) => ({
  ...(await importOriginal<OriginalManagedImageGenerationModule>()),
  generateManagedImage: pipeline.generate,
}));

vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<StorageModule>()),
  isImageStorageConfigured: () => storage.configured,
}));
vi.mock('@/lib/server/media-assets', async (importOriginal) => ({
  ...(await importOriginal<OriginalMediaAssetsModule>()),
  latestConversationImageAssetId: imageSources.latest,
  getActiveWorkspaceMediaAssetById: imageSources.byId,
}));

vi.mock('@/app/api/media/image/lib/image-generation-provider', async (importOriginal) => {
  const actual = await importOriginal<ProviderModule>();
  return {
    ...actual,
    getDefaultProvider: () => 'openai' as const,
    isProviderAvailable: () => false,
    resolveImageCatalogModel: () =>
      ({ id: 'fixture-image-model', imageApi: 'openai' }) as ReturnType<
        ProviderModule['resolveImageCatalogModel']
      >,
  };
});

const { executeImageChatTool, imageChatToolOffer } =
  await import('@/app/api/media/image/lib/image-chat-tools');

describe('image chat tool surfaces', () => {
  beforeEach(() => {
    storage.configured = true;
    pipeline.generate.mockReset();
    imageSources.latest.mockReset().mockResolvedValue(null);
    imageSources.byId.mockReset().mockResolvedValue(null);
    pipeline.generate.mockImplementation(async () =>
      Response.json({
        success: true,
        images: [{ url: '/api/files/00000000-0000-4000-8000-000000000001' }],
      }),
    );
  });

  it.each(['web', 'desktop', 'mobile', 'chrome'])(
    'offers image creation to a paid plan on %s',
    (surface) => {
      expect(imageChatToolOffer('pro', surface)).not.toBeNull();
    },
  );

  it.each(['vscode', 'cli', 'api', 'unknown'])('offers nothing on %s', (surface) => {
    expect(imageChatToolOffer('pro', surface)).toBeNull();
  });

  it('offers nothing to the Free plan on the extension', () => {
    expect(imageChatToolOffer('free', 'chrome')).toBeNull();
  });

  it.each([
    'Write an email requesting leave tomorrow.',
    'Prepare seven independent reusable prompts in separate copyable blocks.',
    'Create a document about digital illustration.',
    'Render a code snippet that prints a greeting.',
    'Show a complete UI gallery inline in this chat.',
    'Render a form with text and select fields.',
    'Create cards and a carousel.',
    'Visualize these numbers as a line chart: 2, 4, 8.',
    'Draw a sequence diagram for sign-in.',
    'Typeset an equation with a worked example.',
    'Calculate 19 * 27.',
    'Please craft a concise formal notification of leave.',
    'Could you arrange the supplied content into a polished comparison?',
  ])('never starts either image pipeline for %s', async (userMessage) => {
    for (const toolName of [GENERATE_IMAGE_TOOL_NAME, EDIT_IMAGE_TOOL_NAME]) {
      const result = await executeImageChatTool(
        toolName,
        { prompt: 'A polished screenshot' },
        {
          toolCallId: 'fixture-image-call',
          requestId: 'fixture-image-request',
          userId: 'fixture-user',
          organizationId: null,
          db: {} as DatabaseAdapter,
          surface: 'web',
          conversationId: null,
          latestAttachedImage: () => 'fixture-image-bytes',
          userMessage,
        },
      );
      expect(result.ok).toBe(false);
      expect(result.content).toContain('No image was generated');
    }
    expect(pipeline.generate).not.toHaveBeenCalled();
  });

  it('preserves an explicit image request through the pipeline with a deterministic stub', async () => {
    const result = await executeImageChatTool(
      GENERATE_IMAGE_TOOL_NAME,
      { prompt: 'A fox in snow' },
      {
        toolCallId: 'fixture-image-call',
        requestId: 'fixture-image-request',
        userId: 'fixture-user',
        organizationId: null,
        db: {} as DatabaseAdapter,
        surface: 'web',
        conversationId: null,
        latestAttachedImage: () => null,
        userMessage: 'Generate an image of a fox in snow.',
      },
    );
    expect(result.ok).toBe(true);
    expect(pipeline.generate).toHaveBeenCalledTimes(1);
  });
  it.each([
    [GENERATE_IMAGE_TOOL_NAME, 'another one', true, false, true],
    [GENERATE_IMAGE_TOOL_NAME, 'another one', false, false, false],
    [GENERATE_IMAGE_TOOL_NAME, 'another one', false, true, true],
    [EDIT_IMAGE_TOOL_NAME, 'Make it warmer.', true, false, true],
    [EDIT_IMAGE_TOOL_NAME, 'Make it warmer.', false, true, true],
    [EDIT_IMAGE_TOOL_NAME, 'Make it warmer.', false, false, false],
    [GENERATE_IMAGE_TOOL_NAME, 'Make it warmer.', true, false, false],
  ] as const)(
    'requires verified source context for %s / %s (attached %s, prior %s)',
    async (toolName, userMessage, attached, prior, allowed) => {
      imageSources.latest.mockResolvedValue(prior ? '00000000-0000-4000-8000-000000000002' : null);
      const result = await executeImageChatTool(
        toolName,
        { prompt: 'A warmer fox portrait' },
        {
          toolCallId: 'fixture-followup-call',
          requestId: crypto.randomUUID(),
          userId: 'fixture-user',
          organizationId: null,
          db: {} as DatabaseAdapter,
          surface: 'web',
          conversationId: '00000000-0000-4000-8000-000000000003',
          latestAttachedImage: () => (attached ? 'fixture-image-bytes' : null),
          userMessage,
        },
      );
      expect(result.ok).toBe(allowed);
      expect(pipeline.generate).toHaveBeenCalledTimes(allowed ? 1 : 0);
    },
  );

  it('does not accept an unverified model-supplied image asset as source context', async () => {
    const result = await executeImageChatTool(
      EDIT_IMAGE_TOOL_NAME,
      { prompt: 'Make the image warmer', image_asset_id: '00000000-0000-4000-8000-000000000002' },
      {
        toolCallId: 'fixture-unowned-call',
        requestId: crypto.randomUUID(),
        userId: 'fixture-user',
        organizationId: null,
        db: {} as DatabaseAdapter,
        surface: 'web',
        conversationId: '00000000-0000-4000-8000-000000000003',
        latestAttachedImage: () => null,
        userMessage: 'Edit the attached photo to make it warmer.',
      },
    );
    expect(result.ok).toBe(false);
    expect(imageSources.byId).toHaveBeenCalledTimes(1);
    expect(pipeline.generate).not.toHaveBeenCalled();
  });

  it('rejects a model-selected owned asset B when image A is attached', async () => {
    imageSources.byId.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000002',
      kind: 'image',
      userId: 'fixture-user',
    });
    const result = await executeImageChatTool(
      EDIT_IMAGE_TOOL_NAME,
      {
        prompt: 'Make the attached image warmer',
        image_asset_id: '00000000-0000-4000-8000-000000000002',
      },
      {
        toolCallId: 'fixture-source-substitution',
        requestId: crypto.randomUUID(),
        userId: 'fixture-user',
        organizationId: null,
        db: {} as DatabaseAdapter,
        surface: 'web',
        conversationId: '00000000-0000-4000-8000-000000000003',
        latestAttachedImage: () => 'verified-attached-image-A',
        userMessage: 'Edit the attached photo to make it warmer.',
      },
    );
    expect(result.ok).toBe(false);
    expect(imageSources.byId).not.toHaveBeenCalled();
    expect(pipeline.generate).not.toHaveBeenCalled();
  });

  it('binds an explicit older image to the current conversation before editing', async () => {
    imageSources.byId.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000002',
      kind: 'image',
      userId: 'fixture-user',
    });
    const db = {} as DatabaseAdapter;
    const result = await executeImageChatTool(
      EDIT_IMAGE_TOOL_NAME,
      {
        prompt: 'Make the earlier image warmer',
        image_asset_id: '00000000-0000-4000-8000-000000000002',
      },
      {
        toolCallId: 'fixture-source-prior',
        requestId: crypto.randomUUID(),
        userId: 'fixture-user',
        organizationId: null,
        db,
        surface: 'web',
        conversationId: '00000000-0000-4000-8000-000000000003',
        latestAttachedImage: () => null,
        userMessage: 'Edit the earlier photo to make it warmer.',
      },
    );
    expect(result.ok).toBe(true);
    expect(imageSources.byId).toHaveBeenCalledWith(
      'fixture-user',
      '00000000-0000-4000-8000-000000000002',
      db,
      { conversationId: '00000000-0000-4000-8000-000000000003' },
    );
    expect(pipeline.generate).toHaveBeenCalledTimes(1);
    const payload = await pipeline.generate.mock.calls[0]?.[0]?.readBody();
    expect(payload).toMatchObject({
      source_image: { asset_id: '00000000-0000-4000-8000-000000000002' },
    });
  });
});
