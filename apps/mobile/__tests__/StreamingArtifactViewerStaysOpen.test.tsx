import { fireEvent, render as renderNative, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EXPLICIT_ARTIFACT_MARKER_FOR } from '@agiworkforce/artifacts';
import type { Artifact, ChatMessage } from '@/types/chat';

jest.mock('@/src/features/chat/components/ArtifactFullScreen', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ArtifactFullScreen: ({ artifact, visible }: { artifact: Artifact | null; visible: boolean }) =>
      artifact && visible
        ? createElement(MockText, null, `Viewing ${artifact.content.split('\n').length} lines`)
        : null,
  };
});

import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useArtifactStore } from '@/src/features/artifacts/store';

const SAFE_AREA = {
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const PAGE_LINES = [
  EXPLICIT_ARTIFACT_MARKER_FOR.html,
  '<!DOCTYPE html>',
  '<html><head><title>Counter</title></head>',
  '<body><div>0</div></body></html>',
];

function answer(content: string, isStreaming: boolean): ChatMessage {
  return {
    id: 'answer-page',
    role: 'assistant',
    content,
    conversationId: 'conv-streaming-viewer',
    createdAt: '2026-11-15T00:00:00.000Z',
    isStreaming,
  };
}

function bubble(message: ChatMessage) {
  return (
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <MessageBubble message={message} />
    </SafeAreaProvider>
  );
}

describe('the artifact viewer opened while the page is written', () => {
  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useArtifactStore.setState({ artifacts: [] });
  });

  it('stays open when the page fence closes before the answer ends', () => {
    const writing = ['Here is the page.', '', '```html', ...PAGE_LINES].join('\n');
    const view = renderNative(bubble(answer(writing, true)));

    fireEvent.press(screen.getByLabelText(/^Generating artifact, HTML/));
    expect(screen.getByText(`Viewing ${PAGE_LINES.length} lines`)).toBeTruthy();

    view.rerender(bubble(answer(`${writing}\n\`\`\`\n\nIt counts taps.`, true)));

    expect(screen.getByText(`Viewing ${PAGE_LINES.length} lines`)).toBeTruthy();
  });

  it('shows no Generating artifact card while a code block is being written', () => {
    const code = ['```python', 'def a():', '  return 1', 'def b():', '  return 2'].join('\n');

    renderNative(bubble(answer(code, true)));

    expect(screen.queryByLabelText(/Generating artifact/)).toBeNull();
    expect(screen.queryByText(/Generating artifact/)).toBeNull();
  });
});
