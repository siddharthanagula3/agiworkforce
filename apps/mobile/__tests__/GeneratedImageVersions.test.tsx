import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockExpoImage = jest.fn();
jest.mock('../services/fileCreation', () => ({
  shareGeneratedImage: jest.fn(),
  saveGeneratedImageToPhotos: jest.fn(),
  copyGeneratedImage: jest.fn(),
}));
jest.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => {
    mockExpoImage(props);
    return null;
  },
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('../services/authSession', () => ({
  getAuthHeaders: jest.fn().mockResolvedValue({ Authorization: 'Bearer token' }),
}));

import { API_URL } from '../lib/constants';
import { requireMediaSlotModel } from '../test-utils/modelFixtures';
import { GeneratedImage } from '../src/features/chat/components/GeneratedImage';
import { imageVersionsFromMetadata } from '../src/features/image/imageVersions';

const latest = '/api/files/33333333-3333-4333-8333-333333333333';
const first = '/api/files/11111111-1111-4111-8111-111111111111';
const second = '/api/files/22222222-2222-4222-8222-222222222222';

function lastSourceUri(): string | undefined {
  return mockExpoImage.mock.calls.at(-1)?.[0]?.source?.uri;
}

describe('GeneratedImage earlier versions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('draws no stepper when the image was never revised', async () => {
    const view = render(<GeneratedImage imageUrl={latest} previousVersions={[]} />);
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());

    expect(view.queryByTestId('generated-image-version-label')).toBeNull();
  });

  it('steps back to earlier versions, shows their own prompt and model, and returns to the newest', async () => {
    const model = requireMediaSlotModel('image');
    const view = render(
      <GeneratedImage
        imageUrl={latest}
        revisedPrompt="A red fox with a moon"
        previousVersions={[
          { imageUrl: first, prompt: 'A red fox', model: model.id, aspect: '1:1' },
          { imageUrl: second, prompt: 'A red fox in snow' },
        ]}
      />,
    );
    await waitFor(() => expect(lastSourceUri()).toBe(`${API_URL}${latest}`));
    expect(view.getByTestId('generated-image-version-label')).toHaveTextContent('3 of 3');
    expect(view.getByTestId('generated-image-next-version').props.accessibilityState).toMatchObject(
      { disabled: true },
    );

    fireEvent.press(view.getByTestId('generated-image-previous-version'));
    await waitFor(() => expect(lastSourceUri()).toBe(`${API_URL}${second}`));
    expect(view.getByTestId('generated-image-version-label')).toHaveTextContent('2 of 3');
    expect(view.getByLabelText('A red fox in snow')).toBeTruthy();

    fireEvent.press(view.getByTestId('generated-image-previous-version'));
    await waitFor(() => expect(lastSourceUri()).toBe(`${API_URL}${first}`));
    expect(view.getByTestId('generated-image-version-label')).toHaveTextContent('1 of 3');
    expect(
      view.getByTestId('generated-image-previous-version').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    act(() => {
      mockExpoImage.mock.calls.at(-1)![0].onLoad({ source: { width: 1, height: 1 } });
    });
    expect(view.getByTestId('generated-image-caption')).toHaveTextContent(
      `Generated with ${model.name} · 1:1`,
    );

    fireEvent.press(view.getByTestId('generated-image-next-version'));
    fireEvent.press(view.getByTestId('generated-image-next-version'));
    await waitFor(() => expect(lastSourceUri()).toBe(`${API_URL}${latest}`));
    expect(view.getByTestId('generated-image-version-label')).toHaveTextContent('3 of 3');
    expect(view.getByLabelText('A red fox with a moon')).toBeTruthy();
  });

  it('opens the viewer on the version that is showing', async () => {
    const onPress = jest.fn();
    const view = render(
      <GeneratedImage
        imageUrl={latest}
        onPress={onPress}
        previousVersions={[{ imageUrl: first, prompt: 'A red fox' }]}
      />,
    );
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
    fireEvent.press(view.getByLabelText('Generated image'));
    expect(onPress).toHaveBeenLastCalledWith(latest);

    fireEvent.press(view.getByTestId('generated-image-previous-version'));
    await waitFor(() => expect(lastSourceUri()).toBe(`${API_URL}${first}`));
    fireEvent.press(view.getByLabelText('A red fox'));
    expect(onPress).toHaveBeenLastCalledWith(first);
  });

  it('does not load an earlier version from outside AGI Cloud', () => {
    const view = render(
      <GeneratedImage
        imageUrl={latest}
        previousVersions={[{ imageUrl: 'https://evil.example/tracker.png' }]}
      />,
    );
    fireEvent.press(view.getByTestId('generated-image-previous-version'));

    expect(view.getByText('Generated image unavailable')).toBeTruthy();
    expect(
      mockExpoImage.mock.calls.every(
        ([props]) => props.source.uri !== 'https://evil.example/tracker.png',
      ),
    ).toBe(true);
  });
});

describe('imageVersionsFromMetadata', () => {
  it('keeps well formed versions in order and drops the rest', () => {
    expect(
      imageVersionsFromMetadata({
        imageVersions: [
          { imageUrl: first, prompt: ' A fox ', aspect: '1:1', model: 'm', extra: 1 },
          { imageUrl: '' },
          null,
          'text',
          { imageUrl: 42 },
          { imageUrl: second },
        ],
      }),
    ).toEqual([
      { imageUrl: first, prompt: 'A fox', aspect: '1:1', model: 'm' },
      { imageUrl: second },
    ]);
  });

  it('returns nothing when the metadata has no list', () => {
    expect(imageVersionsFromMetadata(undefined)).toEqual([]);
    expect(imageVersionsFromMetadata({ imageVersions: 'x' })).toEqual([]);
  });

  it('bounds the list to the newest fifty and drops oversized fields', () => {
    const many = Array.from({ length: 60 }, (_, index) => ({ imageUrl: `/api/files/${index}` }));
    const parsed = imageVersionsFromMetadata({ imageVersions: many });
    expect(parsed).toHaveLength(50);
    expect(parsed[0]!.imageUrl).toBe('/api/files/10');
    expect(
      imageVersionsFromMetadata({ imageVersions: [{ imageUrl: first, prompt: 'x'.repeat(5000) }] }),
    ).toEqual([{ imageUrl: first }]);
  });
});
