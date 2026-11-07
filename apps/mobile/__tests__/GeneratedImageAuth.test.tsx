import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockExpoImage = jest.fn();
const mockGetAuthHeaders = jest.fn();
const mockShareGeneratedImage = jest.fn();
jest.mock('../services/fileCreation', () => ({
  shareGeneratedImage: (...args: unknown[]) => mockShareGeneratedImage(...args),
}));

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
