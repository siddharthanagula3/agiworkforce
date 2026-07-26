import { render, waitFor } from '@testing-library/react-native';

const mockExpoImage = jest.fn();
const mockGetAuthHeaders = jest.fn();

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
