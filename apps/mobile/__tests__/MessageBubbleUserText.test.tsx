import { render as renderNative, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import { renderMarkdownContent } from '@/src/features/chat/components/MessageContentRenderer';
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

  it('leaves text selection to Select Text, so a long press opens only the app menu', () => {
    const content = [
      '## Plan',
      'Plain **answer** text',
      '',
      '- first step',
      '',
      '```js',
      'const a = 1;',
      '```',
    ].join('\n');
    for (const role of ['user', 'assistant'] as const) {
      const view = render(<MessageBubble message={{ ...message(role), content }} />);
      const bubble = view.getByTestId('chat.message.content');

      expect(view.getAllByText(/first step|const a = 1/).length).toBeGreaterThan(0);
      expect(bubble.findAll((node) => node.props.selectable === true)).toHaveLength(0);
      view.unmount();
    }
  });

  it('keeps Markdown selectable where no long-press menu sits over it', () => {
    const view = render(<View>{renderMarkdownContent('Plain answer text')}</View>);

    expect(view.getByText('Plain answer text').props.selectable).toBe(true);
  });

  it('still renders Markdown and answer blocks in the assistant reply', () => {
    render(<MessageBubble message={message('assistant')} />);

    expect(screen.queryByTestId('user-message-text')).toBeNull();
    expect(screen.getByLabelText('Build: Passed')).toBeTruthy();
    expect(screen.getByText('this')).toHaveStyle({ fontWeight: '700' });
  });
});
