jest.mock('../lib/mmkv', () => ({
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn(),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

jest.mock('../services/api', () => ({
  api: { get: jest.fn() },
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  MANAGED_MEDIA_AVAILABILITY_PATH,
  supportsManagedMediaImageEdit,
  type ManagedMediaModelAvailabilityReply,
} from '@agiworkforce/cloud-contracts';
import { api } from '../services/api';
import { fetchImageEditModelIds, useImageEditModelIds } from '../stores/chat/imageEditAdmissions';
import { hasEditableImage, serverEditsImages } from '../stores/chat/imageEditSupport';
import { requireCatalogModel } from '../test-utils/modelFixtures';
import type { ChatMessage } from '../types/chat';

const mockGet = api.get as jest.MockedFunction<typeof api.get>;

const EDITING_IMAGE_MODEL = requireCatalogModel(
  (model) => model.modelType === 'image' && supportsManagedMediaImageEdit(model.imageApi),
  'image model that edits images',
).id;

function admission(
  modelId: string,
  overrides: Partial<ManagedMediaModelAvailabilityReply['models'][number]> = {},
): ManagedMediaModelAvailabilityReply['models'][number] {
  return {
    model_id: modelId,
    name: modelId,
    kind: 'image',
    provider: 'provider',
    state: 'enabled',
    supports_edit: true,
    ...overrides,
  };
}

function availability(
  models: ManagedMediaModelAvailabilityReply['models'],
): ManagedMediaModelAvailabilityReply {
  return {
    catalog_version: 'catalog-1',
    image_storage_configured: true,
    video_storage_configured: true,
    checked_at: '2026-11-15T00:00:00.000Z',
    models,
  };
}

function image(model: string): ChatMessage {
  return {
    id: `image-${model}`,
    role: 'assistant',
    content: 'Generated image',
    createdAt: '2026-11-15T00:00:00.000Z',
    type: 'image',
    model,
    imageUrl: '/api/files/image',
  } as ChatMessage;
}

beforeEach(() => {
  mockGet.mockReset();
});

describe('which image models the server lets a person edit with', () => {
  it('keeps only enabled image models that report supports_edit', async () => {
    mockGet.mockResolvedValueOnce(
      availability([
        admission('editor'),
        admission('no-edit', { supports_edit: false }),
        admission('unreported', { supports_edit: undefined }),
        admission('not-configured', { state: 'provider_not_configured' }),
        admission('video-model', { kind: 'video' }),
      ]) as never,
    );

    const modelIds = await fetchImageEditModelIds();

    expect(mockGet).toHaveBeenCalledWith(MANAGED_MEDIA_AVAILABILITY_PATH);
    expect([...modelIds]).toEqual(['editor']);
  });

  it('refuses a reply that does not match the contract', async () => {
    mockGet.mockResolvedValueOnce({ models: [{ model_id: 'editor' }] } as never);

    await expect(fetchImageEditModelIds()).rejects.toThrow('managed-media contract');
  });
});

describe('useImageEditModelIds', () => {
  it('asks nothing while editing is not possible in the chat', () => {
    const { result } = renderHook(() => useImageEditModelIds(null));

    expect(result.current.size).toBe(0);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("reads the account's editing models once and reuses them", async () => {
    mockGet.mockResolvedValue(availability([admission(EDITING_IMAGE_MODEL)]) as never);

    const first = renderHook(() => useImageEditModelIds('owner-reuse'));
    await waitFor(() => expect(first.result.current.has(EDITING_IMAGE_MODEL)).toBe(true));
    const second = renderHook(() => useImageEditModelIds('owner-reuse'));
    await waitFor(() => expect(second.result.current.has(EDITING_IMAGE_MODEL)).toBe(true));

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('offers no editing when the check fails, and asks again next time', async () => {
    mockGet.mockRejectedValueOnce(new Error('HTTP 503'));
    const failed = renderHook(() => useImageEditModelIds('owner-failure'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(failed.result.current.size).toBe(0);

    mockGet.mockResolvedValueOnce(availability([admission(EDITING_IMAGE_MODEL)]) as never);
    const retried = renderHook(() => useImageEditModelIds('owner-failure'));
    await waitFor(() => expect(retried.result.current.has(EDITING_IMAGE_MODEL)).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("never shows one account's answer to another", async () => {
    mockGet.mockResolvedValueOnce(availability([admission(EDITING_IMAGE_MODEL)]) as never);
    const { result, rerender } = renderHook(
      ({ ownerId }: { ownerId: string | null }) => useImageEditModelIds(ownerId),
      { initialProps: { ownerId: 'owner-a' } },
    );
    await waitFor(() => expect(result.current.has(EDITING_IMAGE_MODEL)).toBe(true));

    mockGet.mockResolvedValueOnce(availability([]) as never);
    rerender({ ownerId: 'owner-b' });

    expect(result.current.has(EDITING_IMAGE_MODEL)).toBe(false);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(result.current.has(EDITING_IMAGE_MODEL)).toBe(false);
  });
});

describe('an image the server will not edit', () => {
  it('is not editable even when the catalog says its model edits images', () => {
    expect(serverEditsImages(EDITING_IMAGE_MODEL, new Set())).toBe(false);
    expect(serverEditsImages(EDITING_IMAGE_MODEL, new Set([EDITING_IMAGE_MODEL]))).toBe(true);
    expect(hasEditableImage([image(EDITING_IMAGE_MODEL)], new Set())).toBe(false);
    expect(hasEditableImage([image(EDITING_IMAGE_MODEL)], new Set([EDITING_IMAGE_MODEL]))).toBe(
      true,
    );
  });

  it('is not editable when only the server lists its model', () => {
    expect(serverEditsImages('server-only-model', new Set(['server-only-model']))).toBe(false);
  });
});
