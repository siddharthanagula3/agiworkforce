import { fireEvent, render as renderNative, screen } from '@testing-library/react-native';
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
          frame: { x: 0, y: 0, width: 320, height: 640 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

const userMessage: ChatMessage = {
  id: 'user-edit-refusal',
  role: 'user',
  content: 'The original question.',
  createdAt: '2026-11-10T00:00:00.000Z',
};

function openEditor(): void {
  const row = screen.getByRole('text', { name: 'Your message: The original question.' });
  fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'edit' } });
}

describe('editing a user message', () => {
  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('keeps the editor and the replacement text when the edit is refused', () => {
    const onEditMessage = jest.fn().mockReturnValue(false);
    render(<MessageBubble message={userMessage} onEditMessage={onEditMessage} />);

    openEditor();
    fireEvent.changeText(screen.getByLabelText('Edit message text'), 'A carefully written rewrite');
    fireEvent.press(screen.getByLabelText('Submit edit'));

    expect(onEditMessage).toHaveBeenCalledWith('user-edit-refusal', 'A carefully written rewrite');
    expect(screen.getByLabelText('Edit message text').props.value).toBe(
      'A carefully written rewrite',
    );
  });

  it('closes the editor once the same draft is accepted', () => {
    const onEditMessage = jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<MessageBubble message={userMessage} onEditMessage={onEditMessage} />);

    openEditor();
    fireEvent.changeText(screen.getByLabelText('Edit message text'), 'A carefully written rewrite');
    fireEvent.press(screen.getByLabelText('Submit edit'));
    fireEvent.press(screen.getByLabelText('Submit edit'));

    expect(onEditMessage).toHaveBeenCalledTimes(2);
    expect(onEditMessage).toHaveBeenLastCalledWith(
      'user-edit-refusal',
      'A carefully written rewrite',
    );
    expect(screen.queryByLabelText('Edit message text')).toBeNull();
  });
});
