import React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { StyleSheet, TextInput } from 'react-native';

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

let mockImagesAvailable = true;
jest.mock('../src/features/chat/actions/mediaMode', () => ({
  ...jest.requireActual('../src/features/chat/actions/mediaMode'),
  canCreateImages: () => mockImagesAvailable,
}));

let mockCloudAccount: { ownerId: string; epoch: number } | null = {
  ownerId: 'images-owner',
  epoch: 1,
};
jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('../src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => mockCloudAccount,
}));

const mockStartImageCreation = jest.fn();
jest.mock('../src/features/image/startImageCreation', () => ({
  ...jest.requireActual('../src/features/image/startImageCreation'),
  startImageCreation: (...args: unknown[]) => mockStartImageCreation(...args),
}));

import { ImagesScreen, type ImagePromptTile } from '../src/features/image/ImagesScreen';
import { BOTTOM_SEARCH_BAR_MARGIN } from '../src/shared/components/BottomSearchBar';
import { spacing } from '../src/ui/theme/tokens';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useTierStore } from '../src/features/billing/store';
import { listMediaModels } from '../src/features/chat/actions/mediaMode';
import { useFreeQuotaCatalogueStore } from '../src/features/model-picker/freeQuotaCatalogue';
import type { FreeQuotaCatalogue } from '@agiworkforce/cloud-contracts';

const TEMPLATES: ImagePromptTile[] = [
  { id: 'poster', label: 'Poster', phrase: 'A poster of ', image: 1 },
  { id: 'logo', label: 'Logo', phrase: 'A logo for ', image: 2 },
];
const IDEAS: ImagePromptTile[] = [
  { id: 'garden', label: 'Moss garden', phrase: 'A moss garden at dusk', image: 3 },
];

function freeImageCatalogue(remainingToday: number | null): FreeQuotaCatalogue {
  const key = listMediaModels('image')[0]!;
  return {
    issuer: 'provider',
    observedOn: '2026-11-16',
    evidenceUrl: 'https://example.com/free',
    reportedEligible: 1,
    reportedUnavailable: 0,
    models:
      remainingToday === null
        ? []
        : [
            {
              key,
              displayName: 'Free image model',
              providerModelId: key,
              category: 'image',
              limit: null,
              unit: 'images',
              consumedApproximate: null,
              expiresOn: null,
              status: 'ready',
            },
          ],
    ...(remainingToday === null
      ? {}
      : {
          limitedOffer: [
            {
              category: 'image' as const,
              dailyCap: 3,
              remainingToday,
              resetsAt: '2026-11-17T00:00:00Z',
            },
          ],
        }),
  };
}

function freeAccount(remainingToday: number | null) {
  useTierStore.setState({ tier: 'free', grantedCapabilities: [] } as never);
  useFreeQuotaCatalogueStore.setState({
    account: { ownerId: 'images-owner', epoch: 1 },
    catalogue: freeImageCatalogue(remainingToday),
    loading: false,
    error: null,
  });
}

function signInToCloud() {
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useAuthStore.setState({
    isClerkLoaded: true,
    isClerkSignedIn: true,
    clerkUserId: 'images-owner',
  } as never);
}

describe('ImagesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockImagesAvailable = true;
    mockCloudAccount = { ownerId: 'images-owner', epoch: 1 };
    useTierStore.setState({ tier: 'pro', grantedCapabilities: ['canUseImages'] } as never);
    useFreeQuotaCatalogueStore.setState({
      account: null,
      catalogue: null,
      loading: false,
      error: null,
      refresh: jest.fn(async () => undefined),
    });
    signInToCloud();
  });

  it('shows the Cloud gate instead of the describe bar in Local Mode', () => {
    useChatAppModeStore.setState({ appMode: 'local' });

    const screen = render(<ImagesScreen />);

    expect(screen.getByText('Images are available in AGI Cloud')).toBeTruthy();
    expect(screen.getByText('Switch to AGI Cloud')).toBeTruthy();
    expect(screen.queryByTestId('images.describe-bar')).toBeNull();
    expect(screen.queryByLabelText('Describe an image')).toBeNull();
  });

  it('asks a signed-out person to sign in and shows no describe bar', () => {
    useAuthStore.setState({ isClerkSignedIn: false, clerkUserId: null } as never);

    const screen = render(<ImagesScreen />);

    expect(screen.getByText('Sign in to AGI Cloud')).toBeTruthy();
    expect(screen.queryByTestId('images.describe-bar')).toBeNull();
  });

  it('keeps send disabled until there is a description, and explains the empty page', () => {
    const screen = render(<ImagesScreen />);

    expect(screen.getByText('Create an image')).toBeTruthy();
    expect(screen.getByLabelText('Create image').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByLabelText('Describe an image'), '   ');
    expect(screen.getByLabelText('Create image').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByLabelText('Describe an image'), 'A red kite');
    expect(screen.getByLabelText('Create image').props.accessibilityState.disabled).toBe(false);
  });

  it('shows a spinner while sending, opens the chat and comes back to an empty bar', async () => {
    let finish: (value: unknown) => void = () => undefined;
    mockStartImageCreation.mockImplementation(
      ({ open }: { open: (id: string) => void }) =>
        new Promise((resolve) => {
          finish = (value) => {
            open('image-conversation');
            resolve(value);
          };
        }),
    );
    const screen = render(<ImagesScreen />);
    fireEvent.changeText(screen.getByLabelText('Describe an image'), 'A red kite');

    fireEvent.press(screen.getByLabelText('Create image'));

    expect(screen.getByLabelText('Creating image')).toBeTruthy();
    expect(screen.queryByLabelText('Create image')).toBeNull();
    expect(mockStartImageCreation).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'A red kite', isOnline: true }),
    );

    await act(async () => {
      finish({ status: 'started', conversationId: 'image-conversation' });
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: 'image-conversation' },
    });
    expect(screen.getByLabelText('Describe an image').props.value).toBe('');
    expect(screen.queryByTestId('images.error')).toBeNull();
  });

  it('brings the button back with the reason under the bar when sending fails, keeping the text', async () => {
    mockStartImageCreation.mockResolvedValue({
      status: 'blocked',
      message: 'Something went wrong. Please try again.',
    });
    const screen = render(<ImagesScreen />);
    fireEvent.changeText(screen.getByLabelText('Describe an image'), 'A red kite');

    fireEvent.press(screen.getByLabelText('Create image'));

    await waitFor(() =>
      expect(screen.getByTestId('images.error').props.children).toBe(
        'Something went wrong. Please try again.',
      ),
    );
    expect(screen.getByLabelText('Create image').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByLabelText('Describe an image').props.value).toBe('A red kite');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('recovers the button with a reason when starting the image throws', async () => {
    mockStartImageCreation.mockRejectedValue(new Error('unexpected'));
    const screen = render(<ImagesScreen />);
    fireEvent.changeText(screen.getByLabelText('Describe an image'), 'A red kite');

    fireEvent.press(screen.getByLabelText('Create image'));

    await waitFor(() =>
      expect(screen.getByTestId('images.error').props.children).toBe(
        'Image request could not be sent. Please try again.',
      ),
    );
    expect(screen.getByLabelText('Create image').props.accessibilityState.disabled).toBe(false);
  });

  it('starts one request for a double tap', async () => {
    mockStartImageCreation.mockImplementation(() => new Promise(() => undefined));
    const screen = render(<ImagesScreen />);
    fireEvent.changeText(screen.getByLabelText('Describe an image'), 'A red kite');
    const button = screen.getByLabelText('Create image');

    act(() => {
      fireEvent.press(button);
      fireEvent.press(button);
    });

    expect(mockStartImageCreation).toHaveBeenCalledTimes(1);
  });

  it('appends a tile phrase to the description and focuses the field', () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => undefined);
    try {
      const screen = render(<ImagesScreen templates={TEMPLATES} />);
      expect(screen.queryByText('Create an image')).toBeNull();

      fireEvent.press(screen.getByLabelText('Poster'));
      expect(screen.getByLabelText('Describe an image').props.value).toBe('A poster of ');

      fireEvent.changeText(screen.getByLabelText('Describe an image'), 'A red kite');
      fireEvent.press(screen.getByLabelText('Logo'));
      expect(screen.getByLabelText('Describe an image').props.value).toBe('A red kite A logo for ');
      expect(focus).toHaveBeenCalledTimes(2);
    } finally {
      focus.mockRestore();
    }
  });

  it('hides the Templates and Ideas switch until there are ideas', () => {
    const screen = render(<ImagesScreen templates={TEMPLATES} />);

    expect(screen.queryByTestId('images.switch')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Ideas' })).toBeNull();
  });

  it('switches between Templates and Ideas without losing the description', () => {
    const screen = render(<ImagesScreen templates={TEMPLATES} ideas={IDEAS} />);
    const templatesTab = () => screen.getByRole('tab', { name: 'Templates' });
    const ideasTab = () => screen.getByRole('tab', { name: 'Ideas' });

    expect(templatesTab().props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Poster')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Describe an image'), 'A red kite');

    fireEvent.press(ideasTab());

    expect(ideasTab().props.accessibilityState.selected).toBe(true);
    expect(screen.queryByLabelText('Poster')).toBeNull();
    expect(screen.getByLabelText('Moss garden')).toBeTruthy();
    expect(screen.getByLabelText('Describe an image').props.value).toBe('A red kite');
  });

  it('opens Library filtered to images from the header', () => {
    const screen = render(<ImagesScreen />);

    fireEvent.press(screen.getByLabelText('Your images'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/library',
      params: { filter: 'images' },
    });
  });

  it('shows why nothing can be created, with no describe bar, when no image model can run', () => {
    mockImagesAvailable = false;

    const screen = render(<ImagesScreen templates={TEMPLATES} />);

    expect(screen.getByText('Image creation is unavailable right now.')).toBeTruthy();
    expect(screen.queryByTestId('images.describe-bar')).toBeNull();
    expect(screen.queryByLabelText('Poster')).toBeNull();
  });

  it('shows no describe bar to a Free account that has no free image offer', () => {
    freeAccount(null);

    const screen = render(<ImagesScreen templates={TEMPLATES} />);

    expect(screen.getByText('Image creation is unavailable right now.')).toBeTruthy();
    expect(screen.queryByTestId('images.describe-bar')).toBeNull();
    expect(screen.queryByLabelText('Create image')).toBeNull();
  });

  it('shows no describe bar to a Free account that has used today’s free images', () => {
    freeAccount(0);

    const screen = render(<ImagesScreen templates={TEMPLATES} />);

    expect(screen.getByText('Image creation is unavailable right now.')).toBeTruthy();
    expect(screen.queryByTestId('images.describe-bar')).toBeNull();
  });

  it('lets a Free account with free images left today describe an image', () => {
    freeAccount(2);

    const screen = render(<ImagesScreen templates={TEMPLATES} />);

    expect(screen.getByTestId('images.describe-bar')).toBeTruthy();
    expect(screen.getByLabelText('Poster')).toBeTruthy();
  });

  it('checks the free image offer for a Free account before showing the bar', () => {
    useTierStore.setState({ tier: 'free', grantedCapabilities: [] } as never);
    const refresh = useFreeQuotaCatalogueStore.getState().refresh as jest.Mock;

    const screen = render(<ImagesScreen templates={TEMPLATES} />);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByTestId('images.describe-bar')).toBeNull();
    expect(screen.queryByText('Image creation is unavailable right now.')).toBeNull();

    act(() => {
      useFreeQuotaCatalogueStore.setState({
        account: { ownerId: 'images-owner', epoch: 1 },
        catalogue: freeImageCatalogue(1),
      });
    });

    expect(screen.getByTestId('images.describe-bar')).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ignores a free image offer that belongs to another account', () => {
    freeAccount(2);
    mockCloudAccount = { ownerId: 'images-owner', epoch: 2 };

    const screen = render(<ImagesScreen templates={TEMPLATES} />);

    expect(screen.queryByTestId('images.describe-bar')).toBeNull();
  });

  describe('the space under the describe bar', () => {
    const BAR_HEIGHT = 120;
    const barSpace = BAR_HEIGHT + BOTTOM_SEARCH_BAR_MARGIN + spacing.lg;

    function layOutBar(screen: ReturnType<typeof render>) {
      act(() => {
        screen.getByTestId('images.describe-bar').props.onLayout({
          nativeEvent: { layout: { x: 0, y: 0, width: 360, height: BAR_HEIGHT } },
        });
      });
      const scroll = screen.getByTestId('images.scroll');
      return {
        scroll,
        marginBottom: StyleSheet.flatten(scroll.props.style).marginBottom,
        paddingBottom: StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom,
      };
    }

    it('ends the empty page above the bar, so its text scrolls there and never runs under it', () => {
      const screen = render(<ImagesScreen />);

      const { scroll, marginBottom, paddingBottom } = layOutBar(screen);

      expect(marginBottom).toBe(barSpace);
      expect(paddingBottom).toBe(0);
      expect(
        within(scroll).getByText(
          'Describe it below. It opens in a new chat and is saved in Library.',
        ),
      ).toBeTruthy();
    });

    it('lets the template tiles scroll on under the floating bar', () => {
      const screen = render(<ImagesScreen templates={TEMPLATES} />);

      const { marginBottom, paddingBottom } = layOutBar(screen);

      expect(marginBottom).toBe(0);
      expect(paddingBottom).toBe(barSpace);
    });
  });
});
