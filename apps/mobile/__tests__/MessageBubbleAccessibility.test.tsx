import { Modal } from 'react-native';
import { act, fireEvent, render as renderNative, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import type { ReactTestInstance } from 'react-test-renderer';
import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useArtifactStore } from '@/src/features/artifacts/store';
import type { ChatMessage } from '@/types/chat';
import type {
  VoiceOutputHandle,
  VoiceOutputOutcome,
  VoiceOutputOwner,
} from '@/src/features/voice/services/voiceOutput';

const CONTENT =
  '# Readable heading\n\nA paragraph after the heading.\n\n```email\nTo: reader@example.com\nSubject: Review\n\nAn editable message.\n```';

function render(ui: React.ReactElement) {
  return renderNative(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, bottom: 0, left: 0, right: 0 },
          frame: { x: 0, y: 0, width: 320, height: 640 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

function assistant(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-accessibility',
    role: 'assistant',
    content: CONTENT,
    createdAt: '2026-10-31T00:00:00.000Z',
    ...overrides,
  };
}

function expectUngroupedAncestors(element: ReactTestInstance): void {
  for (let parent = element.parent; parent; parent = parent.parent) {
    if (typeof parent.type !== 'string') continue;
    expect(parent.props.accessible).not.toBe(true);
    expect(parent.props.focusable).not.toBe(true);
    expect(parent.props.importantForAccessibility).not.toBe('no-hide-descendants');
    expect(parent.props.accessibilityElementsHidden).not.toBe(true);
  }
}

describe('whole native message accessibility structure', () => {
  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
    useArtifactStore.setState({ artifacts: [] });
  });

  it.each([false, true])('does not group headings or editors while streaming=%s', (isStreaming) => {
    render(<MessageBubble message={assistant({ isStreaming })} />);

    expectUngroupedAncestors(screen.getByRole('header', { name: 'Readable heading' }));
    expectUngroupedAncestors(screen.getByLabelText('Message'));
    expectUngroupedAncestors(screen.getByRole('button', { name: 'Copy email' }));
    const more = screen.getByRole('button', { name: /^More message actions for / });
    expect(more).toHaveStyle({ width: 44, height: 44 });
    expect(more.props.accessibilityActions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'copy' })]),
    );
  });

  it('retains the full export/share sheet through More', async () => {
    render(<MessageBubble message={assistant()} />);
    fireEvent.press(screen.getByRole('button', { name: /^More message actions for / }));
    const menuModal = screen
      .UNSAFE_getAllByType(Modal)
      .find((modal) => modal.props.visible && modal.props.onDismiss);
    expect(menuModal).toBeDefined();
    fireEvent.press(screen.getByTestId('message-action-export'));
    act(() => menuModal!.props.onDismiss());

    expect(screen.getByRole('button', { name: 'Share...' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Copy to Clipboard' })).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy to Clipboard' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(CONTENT);
  });

  it('keeps touch long-press and custom message actions on a reachable control', () => {
    const onRetryMessage = jest.fn();
    render(<MessageBubble message={assistant()} onRetryMessage={onRetryMessage} />);
    const more = screen.getByRole('button', { name: /^More message actions for / });
    fireEvent(more, 'accessibilityAction', { nativeEvent: { actionName: 'retry' } });
    expect(onRetryMessage).toHaveBeenCalledWith('assistant-accessibility');

    const content = screen.getByTestId('chat.message.content');
    expect(content.props.accessible).toBe(false);
    expect(content.props.focusable).toBe(false);
    expect(content.props.importantForAccessibility).toBe('no');
    expect(content.props.accessibilityLabel).toBeUndefined();
    fireEvent(content, 'longPress');
    expect(screen.getByTestId('message-action-copy')).toBeOnTheScreen();
  });

  it('keeps user-bubble grouping and edit actions', () => {
    const onEditMessage = jest.fn();
    render(
      <MessageBubble
        message={assistant({ id: 'user-accessibility', role: 'user', content: 'A user message.' })}
        onEditMessage={onEditMessage}
      />,
    );
    const user = screen.getByRole('text', { name: 'Your message: A user message.' });
    expect(user.props.accessible).toBe(true);
    expect(user.props.accessibilityActions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'edit' })]),
    );
  });

  it('bounds recycled-row speech handlers and cleanup to their exact operation', async () => {
    const playback: Array<{
      handle: VoiceOutputHandle;
      resolve: (outcome: VoiceOutputOutcome) => void;
    }> = [];
    const start = jest.fn((_text: string): VoiceOutputHandle => {
      let resolve!: (outcome: VoiceOutputOutcome) => void;
      const done = new Promise<VoiceOutputOutcome>((accept) => {
        resolve = accept;
      });
      const handle = { done, stop: jest.fn().mockResolvedValue(undefined) };
      playback.push({ handle, resolve });
      return handle;
    });
    const owner: VoiceOutputOwner = {
      source: { scope: 'local' },
      isCurrent: () => true,
      start,
      stop: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn().mockResolvedValue(undefined),
    };
    const rowA = assistant({ id: 'row-a', content: 'Response A.' });
    const rowB = assistant({ id: 'row-b', content: 'Response B.' });
    const view = render(<MessageBubble message={rowA} speechOwner={owner} />);
    const retainedRowAPress = screen.getByLabelText('Read aloud').props.onPress;
    fireEvent.press(screen.getByLabelText('Read aloud'));
    expect(start).toHaveBeenCalledTimes(1);

    view.rerender(<MessageBubble message={rowB} speechOwner={owner} />);
    expect(playback[0].handle.stop).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Read aloud'));
    act(() => retainedRowAPress());
    expect(start).toHaveBeenCalledTimes(2);
    expect(playback[1].handle.stop).not.toHaveBeenCalled();
    await act(async () => {
      playback[0].resolve({ status: 'done' });
    });
    expect(screen.getByLabelText('Stop reading aloud')).toBeOnTheScreen();

    view.rerender(<MessageBubble message={rowA} speechOwner={owner} />);
    expect(playback[1].handle.stop).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Read aloud'));
    act(() => retainedRowAPress());
    expect(start).toHaveBeenCalledTimes(3);
    expect(playback[2].handle.stop).not.toHaveBeenCalled();
    expect(start.mock.calls.map(([text]) => text)).toEqual([
      'Response A.',
      'Response B.',
      'Response A.',
    ]);
    view.unmount();
    expect(playback[2].handle.stop).toHaveBeenCalledTimes(1);
    expect(owner.stop).not.toHaveBeenCalled();
  });
});
