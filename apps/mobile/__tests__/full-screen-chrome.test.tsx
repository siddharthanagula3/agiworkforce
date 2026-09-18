/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { BackHandler, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

let cameraProps: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    back: mockRouterBack,
    replace: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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

const mockRouterBack = jest.fn();

import CameraScreen from '../app/(app)/camera';
import { ComposerFullScreenEditor } from '../src/features/chat/components/ComposerFullScreenEditor';
import { MessageEditModal } from '../src/features/chat/components/MessageEditModal';
import {
  FULL_SCREEN_TOUCH_TARGET,
  useFullScreenChrome,
} from '../src/features/chat/chrome/fullScreenChrome';

function Probe({
  onBack,
  onClose,
  onCancel,
  interceptHardwareBack,
}: {
  onBack: () => void;
  onClose: () => void;
  onCancel?: () => void;
  interceptHardwareBack?: boolean;
}) {
  const chrome = useFullScreenChrome({
    surface: 'probe',
    back: { onPress: onBack, label: 'Go back' },
    close: { onPress: onClose, label: 'Close probe' },
    ...(onCancel ? { cancel: { onPress: onCancel, label: 'Discard draft' } } : {}),
    ...(interceptHardwareBack ? { interceptHardwareBack } : {}),
  });
  return (
    <>
      <Text {...chrome.back}>back</Text>
      <Text {...chrome.close}>close</Text>
      {chrome.cancel ? <Text {...chrome.cancel}>cancel</Text> : null}
    </>
  );
}

function pressHardwareBack(): boolean {
  const add = BackHandler.addEventListener as unknown as jest.Mock;
  const handler = add.mock.calls.at(-1)?.[1] as (() => boolean) | undefined;
  return handler ? handler() : false;
}

beforeEach(() => {
  jest.clearAllMocks();
  cameraProps = {};
});

describe('the full-screen chrome contract', () => {
  it('gives every intent a labelled control no smaller than the touch target', () => {
    const { getByTestId } = render(
      <Probe onBack={jest.fn()} onClose={jest.fn()} onCancel={jest.fn()} />,
    );

    for (const [intent, label] of [
      ['back', 'Go back'],
      ['close', 'Close probe'],
      ['cancel', 'Discard draft'],
    ]) {
      const control = getByTestId(`probe.${intent}`);
      expect(control.props.accessibilityRole).toBe('button');
      expect(control.props.accessibilityLabel).toBe(label);
      expect(control.props.style).toMatchObject({
        minWidth: FULL_SCREEN_TOUCH_TARGET,
        minHeight: FULL_SCREEN_TOUCH_TARGET,
      });
    }
  });

  it('routes the system dismissal to cancel when there is work to discard', () => {
    const onClose = jest.fn();
    const onCancel = jest.fn();
    jest.spyOn(BackHandler, 'addEventListener');

    render(
      <Probe onBack={jest.fn()} onClose={onClose} onCancel={onCancel} interceptHardwareBack />,
    );

    expect(pressHardwareBack()).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('routes the system dismissal to close when there is nothing to discard', () => {
    const onClose = jest.fn();
    jest.spyOn(BackHandler, 'addEventListener');

    render(<Probe onBack={jest.fn()} onClose={onClose} interceptHardwareBack />);

    expect(pressHardwareBack()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves the hardware back alone on a surface that does not ask for it', () => {
    const add = jest.spyOn(BackHandler, 'addEventListener');
    render(<Probe onBack={jest.fn()} onClose={jest.fn()} />);
    expect(add).not.toHaveBeenCalled();
  });
});

describe('the expanded composer', () => {
  function renderEditor(onClose = jest.fn()) {
    return {
      onClose,
      ...render(
        <ComposerFullScreenEditor
          visible
          value="draft"
          onChangeText={jest.fn()}
          sendState="idle"
          canSend
          onClose={onClose}
          onSend={jest.fn()}
        />,
      ),
    };
  }

  it('answers back and close with one collapse control', () => {
    const { getByTestId, onClose } = renderEditor();
    const back = getByTestId('chat.composer.fullscreen.back');
    expect(back.props.accessibilityLabel).toBe('Collapse editor');
    expect(back.props.style).toMatchObject({ minHeight: FULL_SCREEN_TOUCH_TARGET });
    fireEvent.press(back);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the message editor', () => {
  it('names cancel as the intent the system dismissal runs', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <MessageEditModal
        visible
        text="hello"
        onChangeText={jest.fn()}
        onClose={onClose}
        onSubmit={jest.fn()}
      />,
    );

    const cancel = getByTestId('chat.message.edit.cancel');
    expect(cancel.props.accessibilityLabel).toBe('Cancel edit');
    fireEvent.press(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the camera screen', () => {
  it('offers close and no cancel while there is nothing captured', () => {
    const { getByTestId, queryByTestId } = render(<CameraScreen />);
    expect(getByTestId('camera.close').props.accessibilityLabel).toBe('Close camera');
    expect(queryByTestId('camera.cancel')).toBeNull();
  });

  it('discards the capture on the hardware back rather than leaving the camera', async () => {
    jest.spyOn(BackHandler, 'addEventListener');
    const { getByLabelText, getByTestId, queryByTestId } = render(<CameraScreen />);

    act(() => {
      (cameraProps['onCameraReady'] as () => void)();
    });
    await act(async () => {
      fireEvent.press(getByLabelText('Take photo'));
    });
    expect(getByTestId('camera.cancel').props.accessibilityLabel).toBe('Retake photo');

    act(() => {
      expect(pressHardwareBack()).toBe(true);
    });
    expect(mockRouterBack).not.toHaveBeenCalled();
    expect(queryByTestId('camera.cancel')).toBeNull();
  });
});
