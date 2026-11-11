import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockSendMessage = jest.fn();
const mockCreateConversation = jest.fn();
const mockRecognizeText = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ imageUri: 'file:///scan.jpg' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: () => icon });
});

jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
  CameraView: () => null,
}));

jest.mock('@/src/features/image/services/ocr', () => ({
  recognizeText: (...args: unknown[]) => mockRecognizeText(...args),
}));

jest.mock('@/stores/chatStore', () => ({
  useChatMessageStore: (select: (value: Record<string, unknown>) => unknown) =>
    select({ createConversation: (...args: unknown[]) => mockCreateConversation(...args) }),
  useChatExecutionStore: (select: (value: Record<string, unknown>) => unknown) =>
    select({ sendMessage: (...args: unknown[]) => mockSendMessage(...args) }),
}));

jest.mock('@/src/features/model-picker/store', () => ({
  useModelStore: (select: (value: Record<string, unknown>) => unknown) =>
    select({ selectedModel: undefined }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));

import ScanScreen from '@/app/(app)/scan';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mockReplace.mockReset();
  mockSendMessage.mockReset();
  mockCreateConversation.mockReset();
  mockRecognizeText.mockReset().mockResolvedValue({ text: 'Read this', regions: [] });
});

describe('scan Retake while a Send is pending', () => {
  it('discards the scan instead of sending it when Retake lands before the conversation exists', async () => {
    const conversation = deferred<string>();
    mockCreateConversation.mockReturnValue(conversation.promise);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      const screen = render(<ScanScreen />);
      fireEvent.press(await screen.findByLabelText('Send to AI'));
      fireEvent.press(screen.getByLabelText('Retake'));

      await act(async () => {
        conversation.resolve('scan-conversation');
        await conversation.promise;
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(alert).not.toHaveBeenCalled();
    } finally {
      alert.mockRestore();
    }
  });

  it('keeps the newer view when an already admitted send settles after Retake', async () => {
    const sent = deferred<boolean>();
    mockCreateConversation.mockResolvedValue('scan-conversation');
    mockSendMessage.mockReturnValue(sent.promise);
    const screen = render(<ScanScreen />);
    fireEvent.press(await screen.findByLabelText('Send to AI'));
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByLabelText('Retake'));
    await act(async () => {
      sent.resolve(true);
      await sent.promise;
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('navigates to the conversation when no Retake intervened', async () => {
    mockCreateConversation.mockResolvedValue('scan-conversation');
    mockSendMessage.mockResolvedValue(true);
    const screen = render(<ScanScreen />);

    fireEvent.press(await screen.findByLabelText('Send to AI'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)/chat/scan-conversation'));
  });
});
