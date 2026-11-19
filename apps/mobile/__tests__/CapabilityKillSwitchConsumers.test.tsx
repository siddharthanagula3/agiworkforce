/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

let cameraMounted = false;

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
    CameraView: React.forwardRef((_props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      cameraMounted = true;
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
import { useTierStore } from '../src/features/billing/store';
import { CapabilityUnavailable, useRemoteCapabilityStore } from '../src/lib/Capabilities';

const DOCUMENT_SOURCES = {
  model: 'models.json@test',
  tier: 'tier:free',
  surface: 'surface:mobile',
  settings: 'settings:none-configured',
};

describe('a mobile capability closed from the server', () => {
  beforeEach(() => {
    cameraMounted = false;
    useRemoteCapabilityStore.setState({ switchedOff: {}, loadedAt: null });
    useTierStore.setState({ capabilityDocument: null });
    jest.clearAllMocks();
  });

  it('opens the camera while the server switches nothing off', () => {
    const screen = render(<CameraScreen />);

    expect(cameraMounted).toBe(true);
    expect(screen.queryByTestId('capability.unavailable')).toBeNull();
  });

  it('never opens the camera once the server has switched it off', () => {
    useRemoteCapabilityStore.setState({
      switchedOff: { canUseCamera: true },
      loadedAt: new Date().toISOString(),
    });

    const screen = render(<CameraScreen />);

    expect(cameraMounted).toBe(false);
    expect(screen.getByTestId('capability.unavailable')).toBeTruthy();
    expect(screen.getByText('The camera is unavailable right now')).toBeTruthy();
  });

  it('leaves the other capabilities open when one is switched off', () => {
    useRemoteCapabilityStore.setState({
      switchedOff: { canUseVoice: true },
      loadedAt: new Date().toISOString(),
    });

    render(<CameraScreen />);

    expect(cameraMounted).toBe(true);
  });

  it('names the plan, not an outage, when the account plan leaves the capability out', () => {
    useTierStore.setState({
      capabilityDocument: {
        granted: [],
        deniedBy: { canUseCamera: ['tier'] },
        sources: DOCUMENT_SOURCES,
      },
    });

    const screen = render(<CameraScreen />);

    expect(cameraMounted).toBe(false);
    expect(screen.getByText('Not on your plan')).toBeTruthy();
    expect(screen.getByText('Your current plan does not include this.')).toBeTruthy();
    expect(screen.queryByText(/unavailable right now/)).toBeNull();
  });

  it('still reads as a pause when the account document reports the operator switch', () => {
    useTierStore.setState({
      capabilityDocument: {
        granted: [],
        deniedBy: { canUseCamera: ['settings'] },
        denialReasons: { canUseCamera: 'temporarily_unavailable' },
        sources: DOCUMENT_SOURCES,
      },
    });

    const screen = render(<CameraScreen />);

    expect(screen.getByText('The camera is unavailable right now')).toBeTruthy();
  });
});

describe('the closed-capability notice', () => {
  it('offers no purchase step for a plan limit in a build that sells nothing', () => {
    const screen = render(<CapabilityUnavailable label="Connectors" reason="requires_upgrade" />);

    expect(screen.getByText('Not on your plan')).toBeTruthy();
    expect(screen.queryByText(/upgrade/i)).toBeNull();
  });

  it('keeps the next step for a reason that is not a purchase', () => {
    const screen = render(
      <CapabilityUnavailable label="Connectors" reason="feature_coming_soon" />,
    );

    expect(screen.getByText('Coming soon')).toBeTruthy();
    expect(
      screen.getByText(
        'This has not launched yet, on any plan. It will turn on here when it launches; there is nothing to change.',
      ),
    ).toBeTruthy();
  });
});
