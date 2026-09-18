/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

let cameraProps: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: () => icon });
});

jest.mock('expo-camera', () => {
  const React = require('react') as typeof import('react');
  return {
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
    CameraView: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      cameraProps = props;
      React.useImperativeHandle(ref, () => ({
        takePictureAsync: async () => ({ uri: 'file:///capture.jpg' }),
      }));
      return null;
    }),
  };
});

jest.mock('../stores/chatStore', () => ({
  useChatStore: <T,>(selector: (state: Record<string, unknown>) => T) =>
    selector({
      currentConversationId: null,
      createConversation: jest.fn(),
      sendMessage: jest.fn(),
    }),
}));

jest.mock('../src/features/model-picker/store', () => ({
  useModelStore: <T,>(selector: (state: Record<string, unknown>) => T) =>
    selector({ selectedModel: undefined }),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback: () => void) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

import CameraScreen from '../app/(app)/camera';

describe('camera torch and facing', () => {
  beforeEach(() => {
    cameraProps = {};
    jest.clearAllMocks();
  });

  it('drives the continuous torch, not the per-shot flash', () => {
    const screen = render(<CameraScreen />);

    expect(cameraProps['enableTorch']).toBe(false);
    expect(cameraProps['flash']).toBe('off');

    act(() => {
      fireEvent.press(screen.getByTestId('camera-torch-toggle'));
    });

    expect(cameraProps['enableTorch']).toBe(true);
    expect(cameraProps['flash']).toBe('off');
    expect(screen.getByLabelText('Turn torch off')).toBeTruthy();

    act(() => {
      fireEvent.press(screen.getByTestId('camera-torch-toggle'));
    });
    expect(cameraProps['enableTorch']).toBe(false);
  });

  it('keeps the per-shot flash toggle independent of the torch', () => {
    const screen = render(<CameraScreen />);

    act(() => {
      fireEvent.press(screen.getByLabelText('Turn flash on'));
    });

    expect(cameraProps['flash']).toBe('on');
    expect(cameraProps['enableTorch']).toBe(false);
  });

  it('puts the torch out when the front camera takes over', () => {
    const screen = render(<CameraScreen />);

    act(() => {
      fireEvent.press(screen.getByTestId('camera-torch-toggle'));
    });
    expect(cameraProps['enableTorch']).toBe(true);

    act(() => {
      fireEvent.press(screen.getByTestId('camera-facing-toggle'));
    });

    expect(cameraProps['facing']).toBe('front');
    expect(cameraProps['enableTorch']).toBe(false);
    expect(screen.queryByTestId('camera-torch-toggle')).toBeNull();

    act(() => {
      fireEvent.press(screen.getByTestId('camera-facing-toggle'));
    });
    expect(cameraProps['facing']).toBe('back');
    expect(cameraProps['enableTorch']).toBe(false);
  });
});
