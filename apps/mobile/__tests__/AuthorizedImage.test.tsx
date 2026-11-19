import { act, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

const mockExpoImage = jest.fn();
const mockGetAuthHeaders = jest.fn();

jest.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => {
    mockExpoImage(props);
    return null;
  },
}));

jest.mock('../services/authSession', () => ({
  getAuthHeaders: (...args: unknown[]) => mockGetAuthHeaders(...args),
}));

import { API_URL } from '../lib/constants';
import { AuthorizedImage } from '../src/features/image/components/AuthorizedImage';
import { lightColors } from '../src/ui/theme';
import { typeScale } from '../src/ui/theme/tokens';

const storedPath = '/api/files/33333333-3333-4333-8333-333333333333';
const size = { width: 72, height: 72 };

describe('an image attached to a chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthHeaders.mockResolvedValue({
      Authorization: 'Bearer session-token',
      'x-fixture-surface-proof': 'surface-proof',
    });
  });

  it('requests a file kept in AGI Cloud with the session headers, so it is not refused', async () => {
    render(<AuthorizedImage uri={storedPath} style={size} />);

    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
    expect(mockExpoImage.mock.calls.at(-1)?.[0]).toMatchObject({
      source: {
        uri: `${API_URL}${storedPath}`,
        headers: {
          Authorization: 'Bearer session-token',
          'x-fixture-surface-proof': 'surface-proof',
        },
      },
    });
  });

  it('draws nothing for a stored file while signed out', async () => {
    mockGetAuthHeaders.mockResolvedValue({});

    render(<AuthorizedImage uri={storedPath} style={size} />);

    await waitFor(() => expect(mockGetAuthHeaders).toHaveBeenCalled());
    expect(mockExpoImage).not.toHaveBeenCalled();
  });

  it('reads a file still on the device from its own path, with no account headers', () => {
    render(<AuthorizedImage uri="file:///tmp/photo.jpg" style={size} />);

    expect(mockExpoImage.mock.calls.at(-1)?.[0]).toMatchObject({
      source: { uri: 'file:///tmp/photo.jpg' },
    });
    expect(mockExpoImage.mock.calls.at(-1)?.[0].source.headers).toBeUndefined();
  });
});

describe('an attached image that is loading or cannot load', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer session-token' });
  });

  it('shows a tinted tile while the picture loads, then clears it', () => {
    const { getByTestId } = render(<AuthorizedImage uri="file:///tmp/photo.jpg" style={size} />);
    const tile = () => StyleSheet.flatten(getByTestId('authorized-image').props.style);

    expect(tile().backgroundColor).toBe(lightColors.surfaceElevated);
    act(() => mockExpoImage.mock.calls.at(-1)![0].onLoad());
    expect(tile().backgroundColor).toBeUndefined();
  });

  it('shows the file name and an unavailable icon when the picture fails', () => {
    const { getByLabelText, getByText } = render(
      <AuthorizedImage uri="file:///tmp/photo.jpg" style={size} name="beach.jpg" />,
    );

    act(() => mockExpoImage.mock.calls.at(-1)![0].onError());

    expect(getByLabelText('beach.jpg, image unavailable')).toBeTruthy();
    expect(getByText('beach.jpg')).toBeTruthy();
  });

  it('says a stored file is unavailable while signed out', async () => {
    mockGetAuthHeaders.mockResolvedValue({});

    const { findByLabelText } = render(
      <AuthorizedImage uri={storedPath} style={size} name="receipt.png" />,
    );

    expect(await findByLabelText('receipt.png, image unavailable')).toBeTruthy();
    expect(mockExpoImage).not.toHaveBeenCalled();
  });

  it('says in words that the picture is unavailable, in the muted caption size, on one line', () => {
    const { getByText } = render(
      <AuthorizedImage uri="file:///tmp/photo.jpg" style={size} name="beach.jpg" />,
    );

    act(() => mockExpoImage.mock.calls.at(-1)![0].onError());

    const caption = getByText('Unavailable');
    expect(caption.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(caption.props.style)).toMatchObject({
      fontSize: typeScale.caption,
      color: lightColors.textMuted,
    });
  });

  it('keeps both caption lines inside a compact tile at the largest text size', () => {
    const { getByText, getByLabelText } = render(
      <AuthorizedImage uri="file:///tmp/photo.jpg" style={size} name="beach.jpg" />,
    );

    act(() => mockExpoImage.mock.calls.at(-1)![0].onError());

    expect(getByText('beach.jpg').props.maxFontSizeMultiplier).toBe(1);
    expect(getByText('Unavailable').props.maxFontSizeMultiplier).toBe(1);
    expect(
      StyleSheet.flatten(getByLabelText('beach.jpg, image unavailable').props.style),
    ).not.toHaveProperty('padding');
  });

  it('captions an unavailable picture even when it has no name', () => {
    const { getByText, getByLabelText } = render(
      <AuthorizedImage uri="file:///tmp/photo.jpg" style={size} />,
    );

    act(() => mockExpoImage.mock.calls.at(-1)![0].onError());

    expect(getByText('Unavailable')).toBeTruthy();
    expect(getByLabelText('Image unavailable')).toBeTruthy();
  });

  it('shows no caption while the picture loads or once it has loaded', () => {
    const { queryByText } = render(
      <AuthorizedImage uri="file:///tmp/photo.jpg" style={size} name="beach.jpg" />,
    );
    expect(queryByText('Unavailable')).toBeNull();

    act(() => mockExpoImage.mock.calls.at(-1)![0].onLoad());
    expect(queryByText('Unavailable')).toBeNull();
  });

  it('tells its owner when the picture becomes unavailable', () => {
    const onUnavailableChange = jest.fn();
    render(
      <AuthorizedImage
        uri="file:///tmp/photo.jpg"
        style={size}
        name="beach.jpg"
        onUnavailableChange={onUnavailableChange}
      />,
    );
    expect(onUnavailableChange).toHaveBeenLastCalledWith(false);

    act(() => mockExpoImage.mock.calls.at(-1)![0].onError());

    expect(onUnavailableChange).toHaveBeenLastCalledWith(true);
  });
});
