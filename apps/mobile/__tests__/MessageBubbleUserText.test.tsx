import { render as renderNative, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import type { ChatMessage } from '@/types/chat';

function render(ui: React.ReactElement) {
  return renderNative(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, bottom: 0, left: 0, right: 0 },
          frame: { x: 0, y: 0, width: 390, height: 844 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

const typed = ['Please keep **this** literal.', '', '```status', 'Build | Passed', '```'].join(
  '\n',
);

function message(role: ChatMessage['role']): ChatMessage {
  return { id: `${role}-text`, role, content: typed, createdAt: '2026-11-11T00:00:00.000Z' };
}

describe('what a user message shows', () => {
  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('shows exactly what the user typed, as web and the leading apps do', () => {
    render(<MessageBubble message={message('user')} />);

    expect(screen.getByTestId('user-message-text').props.children).toBe(typed);
    expect(screen.queryByLabelText('Build: Passed')).toBeNull();
  });

  it('still renders Markdown and answer blocks in the assistant reply', () => {
    render(<MessageBubble message={message('assistant')} />);

    expect(screen.queryByTestId('user-message-text')).toBeNull();
    expect(screen.getByLabelText('Build: Passed')).toBeTruthy();
    expect(screen.getByText('this')).toHaveStyle({ fontWeight: '700' });
  });
});
