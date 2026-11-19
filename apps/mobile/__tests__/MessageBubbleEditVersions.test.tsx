import { Alert, type AlertButton } from 'react-native';
import { act, fireEvent, render as renderNative, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

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

const CONV_ID = 'edit-versions-chat';

function row(id: string, role: 'user' | 'assistant', content: string): ChatMessage {
  return {
    id,
    conversationId: CONV_ID,
    role,
    content,
    createdAt: '2026-11-15T10:00:00.000Z',
  };
}

const TURNS = [
  row('q1', 'user', 'The original question.'),
  row('a1', 'assistant', 'The first answer.'),
  row('q2', 'user', 'A follow-up.'),
  row('a2', 'assistant', 'The second answer.'),
];

function conversation(patch: Partial<ConversationSummary>): ConversationSummary {
  return {
    id: CONV_ID,
    title: 'Versions',
    createdAt: '2026-11-15T10:00:00.000Z',
    updatedAt: '2026-11-15T10:00:00.000Z',
    messageCount: TURNS.length,
    pinned: false,
    ...patch,
  };
}

function seedCloudWithoutVersions(): void {
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatCloudMessageStore.setState({
    conversations: [conversation({ executionMode: 'cloud', provider: 'cloud_managed' })],
    messages: { [CONV_ID]: TURNS },
  });
}

function seedLocal(): void {
  useChatCloudMessageStore.setState({ conversations: [], messages: {} });
  useChatMessageStore.setState({
    conversations: [conversation({ executionMode: 'local', provider: 'local' })],
    messages: { [CONV_ID]: TURNS },
  });
}

function submitRewrite(): void {
  const bubble = screen.getByRole('text', { name: 'Your message: The original question.' });
  fireEvent(bubble, 'accessibilityAction', { nativeEvent: { actionName: 'edit' } });
  fireEvent.changeText(screen.getByLabelText('Edit message text'), 'A sharper question');
  fireEvent.press(screen.getByLabelText('Submit edit'));
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  useChatAppModeStore.setState({ appMode: 'cloud' });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

function alertButton(label: string): AlertButton {
  const buttons = (alertSpy.mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
  const button = buttons.find((candidate) => candidate.text === label);
  if (!button) throw new Error(`no ${label} button`);
  return button;
}

describe('editing an earlier question in a chat that cannot keep versions', () => {
  beforeEach(seedCloudWithoutVersions);

  it('asks before the turns after it are removed, with the editor still open', () => {
    const onEditMessage = jest.fn().mockReturnValue(true);
    render(<MessageBubble message={TURNS[0]!} onEditMessage={onEditMessage} />);

    submitRewrite();

    expect(alertSpy).toHaveBeenCalledWith(
      'Edit and resend?',
      "This removes the 3 messages after this one. They can't be recovered.",
      expect.any(Array),
    );
    expect(alertButton('Edit and resend').style).toBe('destructive');
    expect(onEditMessage).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Edit message text').props.value).toBe('A sharper question');
  });

  it('keeps the draft and sends nothing when the person cancels', () => {
    const onEditMessage = jest.fn().mockReturnValue(true);
    render(<MessageBubble message={TURNS[0]!} onEditMessage={onEditMessage} />);

    submitRewrite();
    act(() => alertButton('Cancel').onPress?.());

    expect(onEditMessage).not.toHaveBeenCalled();
    expect(useChatCloudMessageStore.getState().messages[CONV_ID]).toEqual(TURNS);
    expect(screen.getByLabelText('Edit message text').props.value).toBe('A sharper question');
  });

  it('sends the edit and closes the editor once the person confirms', () => {
    const onEditMessage = jest.fn().mockReturnValue(true);
    render(<MessageBubble message={TURNS[0]!} onEditMessage={onEditMessage} />);

    submitRewrite();
    act(() => alertButton('Edit and resend').onPress?.());

    expect(onEditMessage).toHaveBeenCalledWith('q1', 'A sharper question');
    expect(screen.queryByLabelText('Edit message text')).toBeNull();
  });
});

describe('editing an earlier question in a Local chat', () => {
  beforeEach(seedLocal);

  it('sends the edit without asking, because the original stays as a version', () => {
    const onEditMessage = jest.fn().mockReturnValue(true);
    render(<MessageBubble message={TURNS[0]!} onEditMessage={onEditMessage} />);

    submitRewrite();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(onEditMessage).toHaveBeenCalledWith('q1', 'A sharper question');
  });
});
