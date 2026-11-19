import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockSendMessage = jest.fn();
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
    select({ createConversation: async () => 'scan-conversation' }),
  useChatExecutionStore: (select: (value: Record<string, unknown>) => unknown) =>
    select({ sendMessage: mockSendMessage }),
}));

const mockModelState: { selectedModel: string | undefined; endConversationModel: jest.Mock } = {
  selectedModel: undefined,
  endConversationModel: jest.fn(),
};

jest.mock('@/src/features/model-picker/store', () => ({
  useModelStore: Object.assign(
    (select: (value: Record<string, unknown>) => unknown) => select(mockModelState),
    { getState: () => mockModelState },
  ),
}));

const mockImpactAsync = jest.fn();
const mockNotificationAsync = jest.fn();

jest.mock('expo-haptics', () => ({
  impactAsync: (...args: unknown[]) => mockImpactAsync(...args),
  notificationAsync: (...args: unknown[]) => mockNotificationAsync(...args),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));

import ScanScreen from '@/app/(app)/scan';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';
import { useSettingsStore } from '@/stores/settingsStore';

beforeEach(() => {
  mockModelState.selectedModel = undefined;
  mockModelState.endConversationModel.mockReset();
  mockSendMessage.mockReset();
  mockImpactAsync.mockReset().mockResolvedValue(undefined);
  mockNotificationAsync.mockReset().mockResolvedValue(undefined);
  useSettingsStore.setState({ hapticsEnabled: true });
});

it('leaves the haptic engine alone after a scan and copy when Haptic Feedback is off', async () => {
  useSettingsStore.setState({ hapticsEnabled: false });
  mockRecognizeText.mockResolvedValue({ text: 'Read this', regions: [] });

  const screen = render(<ScanScreen />);
  fireEvent.press(await screen.findByLabelText('Copy extracted text'));

  await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy());
  expect(mockNotificationAsync).not.toHaveBeenCalled();
  expect(mockImpactAsync).not.toHaveBeenCalled();
});

it('plays the scan success haptic when Haptic Feedback is on', async () => {
  mockRecognizeText.mockResolvedValue({ text: 'Read this', regions: [] });

  const screen = render(<ScanScreen />);

  expect(await screen.findByLabelText('Copy extracted text')).toBeTruthy();
  expect(mockNotificationAsync).toHaveBeenCalledWith('success');
});

it('keeps the scanned image and question when the chat store refuses the send', async () => {
  mockRecognizeText.mockResolvedValue({ text: 'Read this', regions: [] });
  mockSendMessage.mockResolvedValue(false);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    const screen = render(<ScanScreen />);
    const send = await screen.findByLabelText('Send to AI');

    fireEvent.press(send);

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert).toHaveBeenCalledWith(
      'Send failed',
      'The scan could not be sent. Check your model and try again.',
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Send to AI')).toBeTruthy();
  } finally {
    alert.mockRestore();
  }
});

it('sends the scan with the new-chat model, not one shown only for a project', async () => {
  const projectModel = requireMobileCloudModel().id;
  const ownModel = requireMobileCloudModel((model) => model.id !== projectModel).id;
  mockModelState.selectedModel = projectModel;
  mockModelState.endConversationModel.mockImplementation(() => {
    mockModelState.selectedModel = ownModel;
  });
  mockRecognizeText.mockResolvedValue({ text: 'Read this', regions: [] });
  mockSendMessage.mockResolvedValue(true);

  const screen = render(<ScanScreen />);
  fireEvent.press(await screen.findByLabelText('Send to AI'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)/chat/scan-conversation'));
  expect(mockModelState.endConversationModel).toHaveBeenCalledTimes(1);
  expect(mockSendMessage).toHaveBeenCalledWith(
    'scan-conversation',
    expect.any(String),
    ownModel,
    expect.any(Array),
  );
});
