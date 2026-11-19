import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReadGeneratedImageBase64 = jest.fn();
jest.mock('@/services/fileCreation', () => ({
  readGeneratedImageBase64: (...args: unknown[]) => mockReadGeneratedImageBase64(...args),
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@react-native-community/slider', () => () => null);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { ImageAreaEditor } from '../src/features/image/components/ImageAreaEditor';

const onePixelPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function paint(view: ReturnType<typeof render>, x: number, y: number) {
  const touch = {
    touchActive: true,
    startPageX: x,
    startPageY: y,
    startTimeStamp: 1,
    currentPageX: x,
    currentPageY: y,
    currentTimeStamp: 1,
    previousPageX: x,
    previousPageY: y,
    previousTimeStamp: 1,
  };
  const touchHistory = {
    touchBank: [touch],
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: 1,
  };
  fireEvent(view.getByLabelText('Paint over the area to change'), 'responderGrant', {
    nativeEvent: { locationX: x, locationY: y, touches: [], changedTouches: [] },
    touchHistory,
  });
  fireEvent(view.getByLabelText('Paint over the area to change'), 'responderRelease', {
    nativeEvent: { locationX: x, locationY: y, touches: [], changedTouches: [] },
    touchHistory,
  });
}

describe('ImageAreaEditor Clear selection', () => {
  beforeEach(() => {
    mockReadGeneratedImageBase64.mockResolvedValue({
      base64: onePixelPng,
      contentType: 'image/png',
    });
  });

  it('empties the painted area in one tap and Redo brings it back', async () => {
    const view = render(
      <ImageAreaEditor
        imagePath="/api/files/22222222-2222-4222-8222-222222222222"
        visible
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    await waitFor(() => expect(view.getByLabelText('Paint over the area to change')).toBeTruthy());
    expect(view.getByLabelText('Clear selection')).toBeDisabled();

    act(() => paint(view, 10, 10));
    act(() => paint(view, 40, 40));
    expect(view.getByLabelText('Clear selection')).toBeEnabled();

    fireEvent.press(view.getByLabelText('Clear selection'));

    expect(view.getByLabelText('Undo')).toBeDisabled();
    expect(view.getByLabelText('Clear selection')).toBeDisabled();
    fireEvent.press(view.getByLabelText('Redo'));
    fireEvent.press(view.getByLabelText('Redo'));
    expect(view.getByLabelText('Redo')).toBeDisabled();
    expect(view.getByLabelText('Clear selection')).toBeEnabled();
  });
});
