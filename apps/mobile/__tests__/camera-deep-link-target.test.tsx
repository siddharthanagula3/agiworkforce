/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockCreateConversation = jest.fn();
const mockSendMessage = jest.fn();

let capturedOnReady: (() => void) | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
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
    CameraView: React.forwardRef(
      (props: { onCameraReady?: () => void }, ref: React.Ref<unknown>) => {
        capturedOnReady = props.onCameraReady;
        React.useImperativeHandle(ref, () => ({
          takePictureAsync: async () => ({ uri: 'file:///capture.jpg' }),
        }));
        return null;
      },
    ),
  };
});

const chatState: Record<string, unknown> = {};

jest.mock('../stores/chatStore', () => ({
  useChatStore: <T,>(selector: (state: Record<string, unknown>) => T) => selector(chatState),
}));

jest.mock('../src/features/model-picker/store', () => ({
  useModelStore: <T,>(selector: (state: Record<string, unknown>) => T) =>
    selector({ selectedModel: undefined }),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback: () => void) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

import CameraScreen from '../app/(app)/camera';

async function captureAndSend(screen: ReturnType<typeof render>) {
  act(() => capturedOnReady?.());
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Take photo'));
  });
  await waitFor(() => expect(screen.getByLabelText('Send to AI')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Send to AI'));
  });
}

describe('deep-link camera target conversation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnReady = undefined;
    mockCanGoBack.mockReturnValue(true);
    mockCreateConversation.mockResolvedValue('created-conversation');
    mockSendMessage.mockResolvedValue(undefined);
    chatState.currentConversationId = null;
    chatState.createConversation = mockCreateConversation;
    chatState.sendMessage = mockSendMessage;
  });

  it('sends the capture into the conversation that is already open', async () => {
    chatState.currentConversationId = 'open-conversation';

    await captureAndSend(render(<CameraScreen />));

    expect(mockCreateConversation).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(
      'open-conversation',
      'What do you see in this image?',
      undefined,
      [expect.objectContaining({ uri: 'file:///capture.jpg', mimeType: 'image/jpeg' })],
    );
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('starts a conversation when the deep link arrives with no chat open', async () => {
    await captureAndSend(render(<CameraScreen />));

    expect(mockCreateConversation).toHaveBeenCalledWith('Vision Analysis');
    expect(mockSendMessage).toHaveBeenCalledWith(
      'created-conversation',
      expect.any(String),
      undefined,
      expect.any(Array),
    );
    expect(mockReplace).toHaveBeenCalledWith('/(app)/chat/created-conversation');
    expect(mockBack).not.toHaveBeenCalled();
  });
});
