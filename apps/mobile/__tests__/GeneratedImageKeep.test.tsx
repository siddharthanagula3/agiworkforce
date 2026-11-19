import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import {
  actionMenuLabels,
  actionMenuTitle,
  cancelActionMenu,
  chooseActionMenuItem,
  isActionMenuOpen,
} from '@/test-utils/actionMenu';
import { MANAGED_MEDIA_KEEP_PATH } from '@agiworkforce/cloud-contracts';

const mockApiPost = jest.fn();
jest.mock('../services/api', () => ({
  api: { post: (...args: unknown[]) => mockApiPost(...args), get: jest.fn() },
}));

const mockShowToast = jest.fn();
jest.mock('@/src/shared/components/Toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

jest.mock('../services/fileCreation', () => ({
  shareGeneratedImage: jest.fn(),
  saveGeneratedImageToPhotos: jest.fn(),
  copyGeneratedImage: jest.fn(),
}));

jest.mock('expo-image', () => ({
  Image: () => null,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

jest.mock('../services/authSession', () => ({
  getAuthHeaders: jest.fn().mockResolvedValue({ Authorization: 'Bearer token' }),
}));

import { ApiHttpError } from '../services/apiErrors';
import {
  copyGeneratedImage,
  saveGeneratedImageToPhotos,
  shareGeneratedImage,
} from '../services/fileCreation';
import { GeneratedImage } from '../src/features/chat/components/GeneratedImage';
import {
  KEEP_IMAGE_FAILURE_TITLE,
  KEEP_IMAGE_LABEL,
  KEPT_IMAGE_MESSAGE,
  keepableImageId,
} from '../src/features/image/services/keepMedia';

const stored = '/api/files/22222222-2222-4222-8222-222222222222';

function menuLabels(): string[] {
  const sheet = ActionSheetIOS.showActionSheetWithOptions as jest.Mock;
  return sheet.mock.calls.at(-1)![0].options;
}

function chooseFromMenu(label: string) {
  return jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation((options, callback) => callback(options.options.indexOf(label)));
}

describe('keepableImageId', () => {
  it('reads the id of a stored AGI Cloud image only', () => {
    expect(keepableImageId(stored)).toBe('22222222-2222-4222-8222-222222222222');
    expect(
      keepableImageId('https://example.com/api/files/22222222-2222-4222-8222-222222222222'),
    ).toBe(null);
    expect(keepableImageId('file:///var/mobile/photo.png')).toBeNull();
    expect(keepableImageId('/api/files/not-an-id')).toBeNull();
  });
});

describe('GeneratedImage Save to Library', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mockApiPost.mockResolvedValue({ kept: true });
  });

  it('offers Save to Library in a temporary chat, keeping the picture past the chat', async () => {
    chooseFromMenu(KEEP_IMAGE_LABEL);
    const view = render(<GeneratedImage imageUrl={stored} revisedPrompt="A fox" inTemporaryChat />);

    fireEvent(await view.findByLabelText('A fox'), 'longPress');

    expect(menuLabels()).toContain(KEEP_IMAGE_LABEL);
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(KEPT_IMAGE_MESSAGE));
    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockApiPost).toHaveBeenCalledWith(MANAGED_MEDIA_KEEP_PATH, {
      id: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('stops offering it once the picture is kept', async () => {
    chooseFromMenu(KEEP_IMAGE_LABEL);
    const view = render(<GeneratedImage imageUrl={stored} revisedPrompt="A fox" inTemporaryChat />);
    fireEvent(await view.findByLabelText('A fox'), 'longPress');
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());

    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => {});
    await act(async () => {
      fireEvent(await view.findByLabelText('A fox'), 'longPress');
    });

    expect(sheet.mock.calls.at(-1)![0].options).not.toContain(KEEP_IMAGE_LABEL);
  });

  it('does not offer it in an ordinary chat', async () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => {});
    const view = render(<GeneratedImage imageUrl={stored} revisedPrompt="A fox" />);

    fireEvent(await view.findByLabelText('A fox'), 'longPress');

    expect(sheet.mock.calls.at(-1)![0].options).not.toContain(KEEP_IMAGE_LABEL);
  });

  it('says why when the service refuses', async () => {
    mockApiPost.mockRejectedValue(
      new ApiHttpError('That file is no longer waiting to be kept', 404),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    chooseFromMenu(KEEP_IMAGE_LABEL);
    const view = render(<GeneratedImage imageUrl={stored} revisedPrompt="A fox" inTemporaryChat />);

    fireEvent(await view.findByLabelText('A fox'), 'longPress');

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(KEEP_IMAGE_FAILURE_TITLE, 'That is no longer available.'),
    );
    expect(mockShowToast).not.toHaveBeenCalled();
  });
});

describe('GeneratedImage long-press menu on Android', () => {
  const PHONE: Metrics = {
    frame: { x: 0, y: 0, width: 393, height: 852 },
    insets: { top: 24, right: 0, bottom: 16, left: 0 },
  };
  let platform: jest.ReplaceProperty<typeof Platform.OS>;
  let alert: jest.SpyInstance;
  let sheet: jest.SpyInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useFakeTimers();
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    mockApiPost.mockResolvedValue({ kept: true });
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
  });

  afterEach(() => {
    platform.restore();
    jest.useRealTimers();
  });

  async function openMenu() {
    const view = render(
      <SafeAreaProvider initialMetrics={PHONE}>
        <GeneratedImage imageUrl={stored} revisedPrompt="A fox" inTemporaryChat />
      </SafeAreaProvider>,
    );
    fireEvent(await view.findByLabelText('A fox'), 'longPress');
    return view;
  }

  it('lists every image action in the app sheet instead of a three-button alert', async () => {
    await openMenu();

    expect(alert).not.toHaveBeenCalled();
    expect(sheet).not.toHaveBeenCalled();
    expect(actionMenuTitle()).toBe('Image');
    expect(actionMenuLabels()).toEqual([
      'Save to Photos',
      'Copy image',
      'Share image',
      KEEP_IMAGE_LABEL,
    ]);
  });

  it('runs each image action it lists', async () => {
    await openMenu();
    chooseActionMenuItem('Share image');
    await act(async () => {});
    expect(jest.mocked(shareGeneratedImage)).toHaveBeenCalledWith(
      stored,
      undefined,
      expect.anything(),
    );

    fireEvent(screen.getByLabelText('A fox'), 'longPress');
    chooseActionMenuItem('Save to Photos');
    await act(async () => {});
    expect(jest.mocked(saveGeneratedImageToPhotos)).toHaveBeenCalledWith(
      stored,
      undefined,
      expect.anything(),
    );

    fireEvent(screen.getByLabelText('A fox'), 'longPress');
    chooseActionMenuItem('Copy image');
    await act(async () => {});
    expect(jest.mocked(copyGeneratedImage)).toHaveBeenCalledWith(stored, expect.anything());

    fireEvent(screen.getByLabelText('A fox'), 'longPress');
    chooseActionMenuItem(KEEP_IMAGE_LABEL);
    await act(async () => {});
    expect(mockApiPost).toHaveBeenCalledWith(MANAGED_MEDIA_KEEP_PATH, {
      id: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('closes on Cancel without running an action', async () => {
    await openMenu();
    cancelActionMenu();

    expect(isActionMenuOpen()).toBe(false);
    expect(jest.mocked(shareGeneratedImage)).not.toHaveBeenCalled();
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});
