import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockSearchParams: Record<string, string> = {};
let mockPermission: { granted: boolean } | null = { granted: false };

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockSearchParams,
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
  useCameraPermissions: () => [mockPermission, jest.fn()],
  CameraView: () => null,
}));

jest.mock('@/src/features/image/services/ocr', () => ({
  recognizeText: jest.fn().mockResolvedValue({ text: 'Read this', regions: [] }),
}));

jest.mock('@/stores/chatStore', () => {
  const state = {
    createConversation: jest.fn(),
    sendMessage: jest.fn(),
    currentConversationId: null,
  };
  const select = (selector: (value: typeof state) => unknown) => selector(state);
  return { useChatStore: select, useChatMessageStore: select, useChatExecutionStore: select };
});

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

import CameraScreen from '@/app/(app)/camera';
import ScanScreen from '@/app/(app)/scan';

beforeEach(() => {
  delete mockSearchParams.imageUri;
  mockPermission = { granted: false };
});

describe.each([
  ['camera', CameraScreen],
  ['scan', ScanScreen],
] as const)('%s screen handed an image', (_name, Screen) => {
  it('shows the supplied image without asking for camera access', async () => {
    mockSearchParams.imageUri = 'file:///supplied.jpg';
    const screen = render(<Screen />);

    expect(await screen.findByLabelText('Send to AI')).toBeTruthy();
    expect(screen.queryByText('Camera access required')).toBeNull();
    expect(screen.queryByLabelText('Allow camera access')).toBeNull();
  });

  it('shows the supplied image while the permission state is still loading', async () => {
    mockSearchParams.imageUri = 'file:///supplied.jpg';
    mockPermission = null;
    const screen = render(<Screen />);

    expect(await screen.findByLabelText('Send to AI')).toBeTruthy();
  });

  it('asks for camera access when there is no image to show', () => {
    const screen = render(<Screen />);

    expect(screen.getByText('Camera access required')).toBeTruthy();
    expect(screen.getByLabelText('Allow camera access')).toBeTruthy();
  });

  it('asks for camera access only when the person retakes the supplied image', async () => {
    mockSearchParams.imageUri = 'file:///supplied.jpg';
    const screen = render(<Screen />);

    fireEvent.press(await screen.findByLabelText(/^Retake/));

    expect(await screen.findByText('Camera access required')).toBeTruthy();
  });
});
