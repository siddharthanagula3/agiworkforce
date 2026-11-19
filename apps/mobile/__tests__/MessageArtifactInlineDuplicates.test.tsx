import { render as renderNative, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  EXPLICIT_ARTIFACT_MARKER_FOR,
  computeDerivedArtifactId,
  deriveArtifacts,
} from '@agiworkforce/artifacts';
import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useArtifactStore, deriveAndMapToMobileArtifacts } from '@/src/features/artifacts/store';
import {
  offersMessageArtifact,
  offersStreamingArtifact,
  withheldDerivedArtifactIds,
} from '@/stores/chat/derivedMessageArtifact';
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

const PYTHON = [
  'Here is the function.',
  '',
  '```python',
  'def reverse_string(text):',
  '    letters = list(text)',
  '    letters.reverse()',
  "    return ''.join(letters)",
  '```',
].join('\n');

const EMAIL = [
  '```email',
  'To: landlord@example.com',
  'Subject: Leaking tap',
  '',
  'Hi Sam,',
  'The kitchen tap is leaking.',
  'Thanks',
  '```',
].join('\n');

const MERMAID_CHART = [
  '```mermaid',
  'xychart-beta',
  '  title "Sales"',
  '  x-axis [Q1, Q2, Q3]',
  '  bar [1, 2, 3]',
  '```',
].join('\n');

const MARKED_HTML = [
  '```html',
  EXPLICIT_ARTIFACT_MARKER_FOR.html,
  '<!DOCTYPE html>',
  '<html><head><title>Counter</title></head>',
  '<body><div>0</div></body></html>',
  '```',
].join('\n');

const CONVERSATION = 'conv-artifacts';
const CREATED = '2026-11-15T00:00:00.000Z';

function assistant(id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    role: 'assistant',
    content,
    conversationId: CONVERSATION,
    createdAt: CREATED,
    ...extra,
  };
}

describe('which fences an answer also offers as an artifact card', () => {
  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useArtifactStore.setState({ artifacts: [] });
  });

  it('keeps code, drafts, diagrams and charts to the card drawn in the answer', () => {
    for (const scope of ['cloud', 'local'] as const) {
      expect(
        offersMessageArtifact({ language: 'python', content: 'def f():\n  return 1' }, scope),
      ).toBe(false);
      expect(offersMessageArtifact({ language: 'email', content: EMAIL }, scope)).toBe(false);
      expect(
        offersMessageArtifact({ language: 'mermaid', content: 'xychart-beta\n bar [1]' }, scope),
      ).toBe(false);
    }
  });

  it('offers what the web offers: a marked page in the cloud, any page on the device', () => {
    const marked = { language: 'html', content: MARKED_HTML.split('\n').slice(1, -1).join('\n') };
    const unmarked = { language: 'html', content: '<!DOCTYPE html>\n<html><body>x</body></html>' };

    expect(offersMessageArtifact(marked, 'cloud')).toBe(true);
    expect(offersMessageArtifact(unmarked, 'cloud')).toBe(false);
    expect(offersMessageArtifact(unmarked, 'local')).toBe(true);
  });

  it('shows no Generating artifact card while a code block is being written', () => {
    const open = ['```python', 'def a():', '  return 1', 'def b():', '  return 2'].join('\n');

    expect(offersStreamingArtifact(open, 'cloud')).toBe(false);
    expect(
      offersStreamingArtifact(
        ['```html', EXPLICIT_ARTIFACT_MARKER_FOR.html, '<div>'].join('\n'),
        'cloud',
      ),
    ).toBe(true);

    render(<MessageBubble message={assistant('streaming-python', open, { isStreaming: true })} />);

    expect(screen.queryByText(/Generating artifact/)).toBeNull();
  });

  it('draws a code answer once, even when an earlier build saved it as an artifact', () => {
    const id = 'answer-python';
    const legacy = deriveArtifacts(PYTHON, {
      conversationId: CONVERSATION,
      messageId: id,
      include: 'code',
      minCodeLines: 4,
    }).map((artifact) => ({
      id: artifact.id,
      type: 'code' as const,
      title: artifact.title,
      content: artifact.content,
      language: 'python',
    }));
    const [savedByEarlierBuild] = deriveAndMapToMobileArtifacts(
      MARKED_HTML,
      CONVERSATION,
      id,
      CREATED,
      'Chat',
      { scope: 'cloud', ownerId: 'owner-1' },
    );
    useArtifactStore.setState({
      artifacts: legacy.map((artifact) => ({
        ...savedByEarlierBuild!,
        id: artifact.id,
        kind: 'code' as const,
        title: artifact.title,
        content: artifact.content,
        language: 'python',
      })),
    });
    expect(useArtifactStore.getState().artifacts).toHaveLength(1);

    render(<MessageBubble message={assistant(id, PYTHON, { artifacts: legacy })} />);

    expect(screen.queryByLabelText(/^Code: /)).toBeNull();
  });

  it('adds no chip under an email draft or a chart, and keeps the card for a marked page', () => {
    const content = [EMAIL, '', MERMAID_CHART, '', MARKED_HTML].join('\n');
    const id = 'answer-mixed';
    const withheld = withheldDerivedArtifactIds(content, CONVERSATION, id, 'cloud');

    expect(withheld).toEqual(
      new Set([
        computeDerivedArtifactId(CONVERSATION, id, 0),
        computeDerivedArtifactId(CONVERSATION, id, 1),
      ]),
    );
    expect(withheld.has(computeDerivedArtifactId(CONVERSATION, id, 2))).toBe(false);
  });
});
