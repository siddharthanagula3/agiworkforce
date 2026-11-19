import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ActionSheetIOS, Alert } from 'react-native';

const mockExpoImage = jest.fn();
const mockGetAuthHeaders = jest.fn();
const mockShareGeneratedImage = jest.fn();
const mockSaveGeneratedImage = jest.fn();
const mockCopyGeneratedImage = jest.fn();
jest.mock('../services/fileCreation', () => ({
  shareGeneratedImage: (...args: unknown[]) => mockShareGeneratedImage(...args),
  saveGeneratedImageToPhotos: (...args: unknown[]) => mockSaveGeneratedImage(...args),
  copyGeneratedImage: (...args: unknown[]) => mockCopyGeneratedImage(...args),
}));

function chooseFromImageMenu(label: string) {
  return jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation((options, callback) => {
      callback(options.options.indexOf(label));
    });
}

jest.mock('expo-image', () => {
  return {
    Image: (props: Record<string, unknown>) => {
      mockExpoImage(props);
      return null;
    },
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

jest.mock('../services/authSession', () => ({
  getAuthHeaders: (...args: unknown[]) => mockGetAuthHeaders(...args),
}));

import { API_URL } from '../lib/constants';
import { requireMediaSlotModel } from '../test-utils/modelFixtures';
import { GeneratedImage } from '../src/features/chat/components/GeneratedImage';

const durablePath = '/api/files/22222222-2222-4222-8222-222222222222';

describe('GeneratedImage authenticated media boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer short-lived-token' });
  });

  it('resolves a durable file path through AGI Cloud and injects the current Clerk token', async () => {
    render(<GeneratedImage imageUrl={durablePath} />);

    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
    expect(mockExpoImage.mock.calls.at(-1)?.[0]).toMatchObject({
      source: {
        uri: `${API_URL}${durablePath}`,
        headers: { Authorization: 'Bearer short-lived-token' },
      },
      cachePolicy: 'memory',
    });
  });

  it('sends every auth header the session needs, so the image request is not refused', async () => {
    mockGetAuthHeaders.mockResolvedValue({
      Authorization: 'Bearer short-lived-token',
      'x-fixture-surface-proof': 'surface-proof',
    });

    render(<GeneratedImage imageUrl={durablePath} />);

    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
    expect(mockExpoImage.mock.calls.at(-1)?.[0]).toMatchObject({
      source: {
        headers: {
          Authorization: 'Bearer short-lived-token',
          'x-fixture-surface-proof': 'surface-proof',
        },
      },
    });
  });

  it('does not request owner-scoped image bytes while signed out', async () => {
    mockGetAuthHeaders.mockResolvedValue({});

    const { getByText } = render(<GeneratedImage imageUrl={durablePath} />);

    await waitFor(() => expect(getByText('Sign in to view this generated image')).toBeTruthy());
    expect(mockExpoImage).not.toHaveBeenCalled();
  });

  it('fails closed for an external image URL without asking for a token', () => {
    const { getByText } = render(<GeneratedImage imageUrl="https://evil.example/tracker.png" />);

    expect(getByText('Generated image unavailable')).toBeTruthy();
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
    expect(mockExpoImage).not.toHaveBeenCalled();
  });
});

it('retires a recycled image share and ignores its stale load error', async () => {
  jest.clearAllMocks();
  mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer token' });
  let resolve!: () => void;
  mockShareGeneratedImage.mockReturnValueOnce(
    new Promise<void>((done) => {
      resolve = done;
    }),
  );
  chooseFromImageMenu('Share image');
  const view = render(<GeneratedImage imageUrl={durablePath} revisedPrompt="First image" />);
  await waitFor(() => expect(view.getByLabelText('First image')).toBeTruthy());
  const oldImage = mockExpoImage.mock.calls.at(-1)![0];
  fireEvent(view.getByLabelText('First image'), 'longPress');
  fireEvent(view.getByLabelText('First image'), 'longPress');
  expect(mockShareGeneratedImage).toHaveBeenCalledTimes(1);
  const isCurrent = mockShareGeneratedImage.mock.calls[0]![2].isCurrent;
  view.rerender(
    <GeneratedImage
      imageUrl="/api/files/33333333-3333-4333-8333-333333333333"
      revisedPrompt="Second image"
    />,
  );
  expect(isCurrent()).toBe(false);
  await act(async () => {
    oldImage.onError();
    resolve();
  });
  expect(view.queryByText('Failed to load image')).toBeNull();
});

describe('GeneratedImage frame, retry, actions and caption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer token' });
    mockCopyGeneratedImage.mockResolvedValue(undefined);
    mockSaveGeneratedImage.mockResolvedValue(undefined);
  });

  async function loaded(naturalWidth: number, naturalHeight: number) {
    const view = render(
      <GeneratedImage imageUrl={durablePath} revisedPrompt="A fox" width={300} />,
    );
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
    act(() => {
      mockExpoImage.mock.calls.at(-1)![0].onLoad({
        source: { width: naturalWidth, height: naturalHeight },
      });
    });
    return { view, props: mockExpoImage.mock.calls.at(-1)![0] };
  }

  it('shows a wide image uncropped at its own proportions', async () => {
    const { props } = await loaded(1600, 900);

    expect(props.contentFit).toBe('contain');
    expect(props.style.width).toBe(300);
    expect(props.style.height).toBeCloseTo(168.75);
  });

  it('shows a tall image uncropped at its own proportions', async () => {
    const { props } = await loaded(900, 1600);

    expect(props.style.height).toBe(512);
    expect(props.style.width).toBeCloseTo(288);
  });

  it('holds the requested shape while the picture is still loading, so the transcript does not jump', async () => {
    render(<GeneratedImage imageUrl={durablePath} width={300} aspectRatio="16:9" />);
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());

    const before = mockExpoImage.mock.calls.at(-1)![0];
    expect(before.style.width).toBe(300);
    expect(before.style.height).toBeCloseTo(168.75);
  });

  it('keeps a square placeholder when the requested shape is automatic', async () => {
    render(<GeneratedImage imageUrl={durablePath} width={300} aspectRatio="auto" />);
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());

    const before = mockExpoImage.mock.calls.at(-1)![0];
    expect(before.style.width).toBe(300);
    expect(before.style.height).toBe(300);
  });

  it('offers Retry after a failed load and loads the image again', async () => {
    const view = render(<GeneratedImage imageUrl={durablePath} />);
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
    act(() => mockExpoImage.mock.calls.at(-1)![0].onError());
    expect(view.getByText('Failed to load image')).toBeTruthy();
    mockExpoImage.mockClear();

    fireEvent.press(view.getByLabelText('Retry loading this image'));

    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
    expect(view.queryByText('Failed to load image')).toBeNull();
  });

  it('copies the image from the long-press menu', async () => {
    const menu = chooseFromImageMenu('Copy image');
    const { view } = await loaded(1024, 1024);

    await act(async () => {
      fireEvent(view.getByLabelText('A fox'), 'longPress');
    });

    expect(menu.mock.calls[0]![0].options).toEqual([
      'Save to Photos',
      'Copy image',
      'Share image',
      'Cancel',
    ]);
    expect(mockCopyGeneratedImage).toHaveBeenCalledWith(durablePath, {
      isCurrent: expect.any(Function),
    });
  });

  it('saves the image to Photos from the long-press menu', async () => {
    chooseFromImageMenu('Save to Photos');
    const { view } = await loaded(1024, 1024);

    await act(async () => {
      fireEvent(view.getByLabelText('A fox'), 'longPress');
    });

    expect(mockSaveGeneratedImage).toHaveBeenCalledWith(durablePath, undefined, {
      isCurrent: expect.any(Function),
    });
  });

  it('sends a denied Save to Photos to the Settings page instead of a dead end', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const denied = new Error('Allow AGI Workforce to add photos in Settings to save images.');
    denied.name = 'PhotosPermissionError';
    mockSaveGeneratedImage.mockRejectedValue(denied);
    chooseFromImageMenu('Save to Photos');
    const { view } = await loaded(1024, 1024);

    await act(async () => {
      fireEvent(view.getByLabelText('A fox'), 'longPress');
    });

    expect(alert).toHaveBeenCalledWith(
      'Allow Photos access',
      'Allow AGI Workforce to add photos in Settings to save images.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: expect.any(Function) },
      ],
    );
  });

  it('names the model and ratio that made the image', async () => {
    const model = requireMediaSlotModel('image');
    const view = render(
      <GeneratedImage imageUrl={durablePath} model={model.id} aspectRatio="16:9" />,
    );
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
    act(() => {
      mockExpoImage.mock.calls.at(-1)![0].onLoad({ source: { width: 16, height: 9 } });
    });

    expect(view.getByTestId('generated-image-caption')).toHaveTextContent(
      `Generated with ${model.name} · 16:9`,
    );
  });
});
