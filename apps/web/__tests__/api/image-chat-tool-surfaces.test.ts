import { beforeEach, describe, expect, it, vi } from 'vitest';

type ProviderModule = typeof import('@/app/api/media/image/lib/image-generation-provider');
type StorageModule = typeof import('@/lib/server/media-storage');

vi.mock('server-only', () => ({}));

const storage = vi.hoisted(() => ({ configured: true }));

vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<StorageModule>()),
  isImageStorageConfigured: () => storage.configured,
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

const { imageChatToolOffer } = await import('@/app/api/media/image/lib/image-chat-tools');

describe('image chat tool surfaces', () => {
  beforeEach(() => {
    storage.configured = true;
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
});
