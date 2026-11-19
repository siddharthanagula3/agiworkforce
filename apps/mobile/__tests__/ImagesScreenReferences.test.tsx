import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { supportsManagedMediaImageEdit } from '@agiworkforce/cloud-contracts';
import { getModelMetadataById } from '@agiworkforce/types';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true, isReconnecting: false, queueSize: 0 }),
}));

let mockImageModels: string[] | null = null;
jest.mock('../src/features/chat/actions/mediaMode', () => {
  const actual = jest.requireActual('../src/features/chat/actions/mediaMode');
  return {
    ...actual,
    canCreateImages: () => true,
    listMediaModels: (kind: 'image' | 'video') =>
      kind === 'image' && mockImageModels ? mockImageModels : actual.listMediaModels(kind),
  };
});

jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('../src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => ({ ownerId: 'images-owner', epoch: 1 }),
  isCloudAccountEpochCurrent: () => true,
}));

const mockStartImageCreation = jest.fn();
jest.mock('../src/features/image/startImageCreation', () => ({
  ...jest.requireActual('../src/features/image/startImageCreation'),
  startImageCreation: (...args: unknown[]) => mockStartImageCreation(...args),
}));

const mockStartImageReferenceCreation = jest.fn();
jest.mock('../src/features/image/startImageReferenceCreation', () => ({
  startImageReferenceCreation: (...args: unknown[]) => mockStartImageReferenceCreation(...args),
}));

const mockPickPhotos = jest.fn();
jest.mock('../src/features/media/photo-picker', () => ({
  ...jest.requireActual('../src/features/media/photo-picker'),
  pickImageAssetsFromLibrary: (...args: unknown[]) => mockPickPhotos(...args),
  imageAssetsToChatAttachments: (assets: { uri: string; assetId?: string }[]) =>
    assets.map((asset) => ({
      id: asset.uri,
      uri: asset.uri,
      mimeType: 'image/jpeg',
      fileName: `${asset.uri.split('/').pop()}.jpg`,
      ...(asset.assetId ? { pickerAssetId: asset.assetId } : {}),
    })),
}));

import { ImagesScreen } from '../src/features/image/ImagesScreen';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useTierStore } from '../src/features/billing/store';
import { listMediaModels } from '../src/features/chat/actions/mediaMode';
import { useFreeQuotaCatalogueStore } from '../src/features/model-picker/freeQuotaCatalogue';
import { useChatViewStore } from '../stores/chat/chatViewStore';
import { PictureMetadataError } from '../src/features/media/image-metadata';
import { IMAGE_REFERENCES_UNAVAILABLE } from '../src/features/image/imageReferenceModel';
import {
  IMAGE_REFERENCE_DUPLICATE,
  IMAGE_REFERENCE_LIMIT,
  IMAGE_REFERENCE_LIMIT_REACHED,
  IMAGE_REFERENCE_PICK_FAILED,
} from '../src/features/image/useImageReferences';

const canEdit = (id: string) => supportsManagedMediaImageEdit(getModelMetadataById(id)?.provider);
const editingModels = listMediaModels('image').filter(canEdit);
const textOnlyModels = listMediaModels('image').filter((id) => !canEdit(id));

const asset = (name: string, assetId?: string) => ({
  uri: `file:///cache/${name}`,
  ...(assetId ? { assetId } : {}),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function attach(screen: ReturnType<typeof render>, names: string[]) {
  mockPickPhotos.mockResolvedValueOnce(names.map((name) => asset(name)));
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Attach photos'));
  });
}

describe('ImagesScreen photo references', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockImageModels = null;
    useTierStore.setState({ tier: 'pro', grantedCapabilities: ['canUseImages'] } as never);
    useFreeQuotaCatalogueStore.setState({
      account: null,
      catalogue: null,
      loading: false,
      error: null,
      refresh: jest.fn(async () => undefined),
    });
    useChatViewStore.setState({ selectedMediaModel: { image: editingModels[0]! } });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'images-owner',
    } as never);
  });

  it('has an editing model and a text-only model in the catalog to test with', () => {
    expect(editingModels.length).toBeGreaterThan(0);
    expect(textOnlyModels.length).toBeGreaterThan(0);
  });

  it('puts a paperclip at the left of the describe bar and no thumbnails or notes before any photo', () => {
    const screen = render(<ImagesScreen />);

    expect(screen.getByLabelText('Attach photos').props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByTestId('images.references')).toBeNull();
    expect(screen.queryByTestId('images.reference-note')).toBeNull();
  });

  it('opens the photo picker for up to four photos in the order they were chosen', async () => {
    const screen = render(<ImagesScreen />);

    await attach(screen, ['one', 'two']);

    expect(mockPickPhotos).toHaveBeenCalledWith(
      expect.objectContaining({
        allowsMultipleSelection: true,
        orderedSelection: true,
        selectionLimit: IMAGE_REFERENCE_LIMIT,
      }),
    );
    expect(IMAGE_REFERENCE_LIMIT).toBe(4);
    expect(screen.getByLabelText('Remove one.jpg')).toBeTruthy();
    expect(screen.getByLabelText('Remove two.jpg')).toBeTruthy();
  });

  it('asks the picker only for the places that are left', async () => {
    const screen = render(<ImagesScreen />);
    await attach(screen, ['one', 'two']);

    await attach(screen, ['three']);

    expect(mockPickPhotos).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectionLimit: IMAGE_REFERENCE_LIMIT - 2 }),
    );
  });

  it('removes a photo from the strip', async () => {
    const screen = render(<ImagesScreen />);
    await attach(screen, ['one', 'two']);

    fireEvent.press(screen.getByLabelText('Remove one.jpg'));

    expect(screen.queryByLabelText('Remove one.jpg')).toBeNull();
    expect(screen.getByLabelText('Remove two.jpg')).toBeTruthy();
  });

  it('explains the limit instead of opening the picker once four photos are added', async () => {
    const screen = render(<ImagesScreen />);
    await attach(screen, ['one', 'two', 'three', 'four']);
    mockPickPhotos.mockClear();

    expect(screen.getByLabelText('Attach photos').props.accessibilityState.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Attach photos'));
    });

    expect(mockPickPhotos).not.toHaveBeenCalled();
    expect(screen.getByTestId('images.error').props.children).toBe(IMAGE_REFERENCE_LIMIT_REACHED);
  });

  it('says so when a picker returns more photos than the places left', async () => {
    const screen = render(<ImagesScreen />);

    await attach(screen, ['one', 'two', 'three', 'four', 'five', 'six']);

    expect(screen.getAllByLabelText(/^Remove /)).toHaveLength(IMAGE_REFERENCE_LIMIT);
    expect(screen.queryByLabelText('Remove five.jpg')).toBeNull();
    expect(screen.getByTestId('images.error').props.children).toBe(IMAGE_REFERENCE_LIMIT_REACHED);
  });

  it('adds a photo only once', async () => {
    const screen = render(<ImagesScreen />);
    await attach(screen, ['one']);

    await attach(screen, ['one']);

    expect(screen.getAllByLabelText('Remove one.jpg')).toHaveLength(1);
    expect(screen.getByTestId('images.error').props.children).toBe(IMAGE_REFERENCE_DUPLICATE);
  });

  it('disables the paperclip and says why when no image model can take photos', async () => {
    mockImageModels = textOnlyModels;
    useChatViewStore.setState({ selectedMediaModel: { image: textOnlyModels[0]! } });
    const screen = render(<ImagesScreen />);
    const paperclip = screen.getByLabelText('Attach photos');

    expect(paperclip.props.accessibilityState.disabled).toBe(true);
    expect(paperclip.props.accessibilityHint).toBe(IMAGE_REFERENCES_UNAVAILABLE);
    await act(async () => {
      fireEvent.press(paperclip);
    });

    expect(mockPickPhotos).not.toHaveBeenCalled();
    expect(screen.getByTestId('images.error').props.children).toBe(IMAGE_REFERENCES_UNAVAILABLE);
    expect(IMAGE_REFERENCES_UNAVAILABLE).toBe(
      'Photos can’t be used with image creation right now.',
    );
  });

  it('disables the paperclip for a Free account, whose free images cannot take photos', async () => {
    useTierStore.setState({ tier: 'free', grantedCapabilities: [] } as never);
    useFreeQuotaCatalogueStore.setState({
      account: { ownerId: 'images-owner', epoch: 1 },
      catalogue: {
        issuer: 'provider',
        observedOn: '2026-11-16',
        evidenceUrl: 'https://example.com/free',
        reportedEligible: 1,
        reportedUnavailable: 0,
        models: [
          {
            key: listMediaModels('image')[0]!,
            displayName: 'Free image model',
            providerModelId: listMediaModels('image')[0]!,
            category: 'image',
            limit: null,
            unit: 'images',
            consumedApproximate: null,
            expiresOn: null,
            status: 'ready',
          },
        ],
        limitedOffer: [
          {
            category: 'image',
            dailyCap: 3,
            remainingToday: 2,
            resetsAt: '2026-11-17T00:00:00Z',
          },
        ],
      } as never,
      loading: false,
      error: null,
    });
    const screen = render(<ImagesScreen />);

    expect(screen.getByTestId('images.describe-bar')).toBeTruthy();
    expect(screen.getByLabelText('Attach photos').props.accessibilityState.disabled).toBe(true);
  });

  it('names the editing model in one line when the default image model cannot take photos', async () => {
    useChatViewStore.setState({ selectedMediaModel: { image: textOnlyModels[0]! } });
    const screen = render(<ImagesScreen />);
    expect(screen.queryByTestId('images.reference-note')).toBeNull();

    await attach(screen, ['one']);

    const name = getModelMetadataById(editingModels[0]!)?.name;
    expect(name).toBeTruthy();
    expect(screen.getByTestId('images.reference-note').props.children).toBe(
      `Using ${name}, which can work with photos.`,
    );

    fireEvent.press(screen.getByLabelText('Remove one.jpg'));
    expect(screen.queryByTestId('images.reference-note')).toBeNull();
  });

  it('shows no note when the image model already takes photos', async () => {
    const screen = render(<ImagesScreen />);

    await attach(screen, ['one']);

    expect(screen.queryByTestId('images.reference-note')).toBeNull();
  });

  it('sends the photos with the prompt, then clears both and opens the chat', async () => {
    mockStartImageReferenceCreation.mockImplementation(
      async ({ open }: { open: (id: string) => void }) => {
        open('image-conversation');
        return { status: 'started', conversationId: 'image-conversation' };
      },
    );
    const screen = render(<ImagesScreen />);
    await attach(screen, ['one', 'two']);
    fireEvent.changeText(screen.getByLabelText('Describe an image'), 'Make it snow');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Create image'));
    });

    expect(mockStartImageCreation).not.toHaveBeenCalled();
    expect(mockStartImageReferenceCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Make it snow',
        isOnline: true,
        references: [
          expect.objectContaining({ uri: 'file:///cache/one' }),
          expect.objectContaining({ uri: 'file:///cache/two' }),
        ],
      }),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: 'image-conversation' },
    });
    expect(screen.getByLabelText('Describe an image').props.value).toBe('');
    expect(screen.queryByLabelText('Remove one.jpg')).toBeNull();
    expect(screen.queryByTestId('images.references')).toBeNull();
  });

  it('keeps the photos and the text, and says why, when the request is refused', async () => {
    mockStartImageReferenceCreation.mockResolvedValue({
      status: 'blocked',
      message: 'Something went wrong. Please try again.',
    });
    const screen = render(<ImagesScreen />);
    await attach(screen, ['one']);
    fireEvent.changeText(screen.getByLabelText('Describe an image'), 'Make it snow');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Create image'));
    });

    expect(screen.getByTestId('images.error').props.children).toBe(
      'Something went wrong. Please try again.',
    );
    expect(screen.getByLabelText('Remove one.jpg')).toBeTruthy();
    expect(screen.getByLabelText('Describe an image').props.value).toBe('Make it snow');
  });

  it('sends a prompt without photos through the plain image path', async () => {
    mockStartImageCreation.mockResolvedValue({ status: 'blocked', message: 'No.' });
    const screen = render(<ImagesScreen />);
    fireEvent.changeText(screen.getByLabelText('Describe an image'), 'A red kite');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Create image'));
    });

    expect(mockStartImageCreation).toHaveBeenCalledTimes(1);
    expect(mockStartImageReferenceCreation).not.toHaveBeenCalled();
  });

  it('shows a placeholder while photos are being added and holds the send button until they are in', async () => {
    const picked = deferred<ReturnType<typeof asset>[]>();
    mockPickPhotos.mockReturnValueOnce(picked.promise);
    const screen = render(<ImagesScreen />);
    fireEvent.changeText(screen.getByLabelText('Describe an image'), 'Make it snow');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Attach photos'));
    });

    expect(screen.getByLabelText('Adding attachment')).toBeTruthy();
    expect(screen.getByLabelText('Create image').props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      picked.resolve([asset('one')]);
    });

    expect(screen.queryByLabelText('Adding attachment')).toBeNull();
    expect(screen.getByLabelText('Remove one.jpg')).toBeTruthy();
    expect(screen.getByLabelText('Create image').props.accessibilityState.disabled).toBe(false);
  });

  it('shows the not-added error on the thumbnail, and lets it be dismissed, when the picker fails', async () => {
    mockPickPhotos.mockRejectedValueOnce(new Error('picker'));
    const screen = render(<ImagesScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Attach photos'));
    });

    expect(screen.getByText('Not added')).toBeTruthy();
    expect(screen.getByTestId('images.error').props.children).toBe(IMAGE_REFERENCE_PICK_FAILED);

    fireEvent.press(screen.getByLabelText('Remove the attachment that could not be added'));
    expect(screen.queryByText('Not added')).toBeNull();
  });

  it('gives the recovery advice when a photo’s location data cannot be removed', async () => {
    mockPickPhotos.mockRejectedValueOnce(new PictureMetadataError('IMG_0001.jpg'));
    const screen = render(<ImagesScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Attach photos'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('images.error').props.children).toContain('location data'),
    );
  });

  it('adds nothing when the person closes the picker without choosing', async () => {
    mockPickPhotos.mockResolvedValueOnce([]);
    const screen = render(<ImagesScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Attach photos'));
    });

    expect(screen.queryByTestId('images.references')).toBeNull();
    expect(screen.queryByTestId('images.error')).toBeNull();
  });
});
