/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockCreateConversation = jest.fn();
const mockSendMessage = jest.fn();

let capturedOnReady: (() => void) | undefined;
const mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
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

const mockModelState: { selectedModel: string | undefined; endConversationModel: jest.Mock } = {
  selectedModel: undefined,
  endConversationModel: jest.fn(),
};

jest.mock('../src/features/model-picker/store', () => ({
  useModelStore: Object.assign(
    <T,>(selector: (state: Record<string, unknown>) => T) => selector(mockModelState),
    { getState: () => mockModelState },
  ),
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
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

function twoCloudModelIds(): [string, string] {
  const first = requireMobileCloudModel().id;
  return [first, requireMobileCloudModel((model) => model.id !== first).id];
}

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
    mockSendMessage.mockResolvedValue(true);
    chatState.currentConversationId = null;
    chatState.createConversation = mockCreateConversation;
    chatState.sendMessage = mockSendMessage;
    mockModelState.selectedModel = undefined;
    mockModelState.endConversationModel.mockReset();
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

  it('sends a new chat with the new-chat model, not one shown only for a project', async () => {
    const [projectModel, ownModel] = twoCloudModelIds();
    mockModelState.selectedModel = projectModel;
    mockModelState.endConversationModel.mockImplementation(() => {
      mockModelState.selectedModel = ownModel;
    });
    mockCreateConversation.mockImplementation(async () => {
      expect(mockModelState.selectedModel).toBe(ownModel);
      return 'created-conversation';
    });

    await captureAndSend(render(<CameraScreen />));

    expect(mockModelState.endConversationModel).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith(
      'created-conversation',
      expect.any(String),
      ownModel,
      expect.any(Array),
    );
  });

  it('keeps the open conversation model when the capture goes into that conversation', async () => {
    const [conversationModel] = twoCloudModelIds();
    chatState.currentConversationId = 'open-conversation';
    mockModelState.selectedModel = conversationModel;

    await captureAndSend(render(<CameraScreen />));

    expect(mockModelState.endConversationModel).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(
      'open-conversation',
      expect.any(String),
      conversationModel,
      expect.any(Array),
    );
  });

  it('keeps the captured photo when the chat store refuses the send', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSendMessage.mockResolvedValue(false);
    try {
      const screen = render(<CameraScreen />);
      await captureAndSend(screen);

      expect(alert).toHaveBeenCalledWith(
        'Send failed',
        'The image could not be sent. Check your model and try again.',
      );
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Send to AI')).toBeTruthy();
    } finally {
      alert.mockRestore();
    }
  });
});
