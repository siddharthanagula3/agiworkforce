import { fireEvent, render as renderNative, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  EXPLICIT_ARTIFACT_DERIVATION_POLICY,
  EXPLICIT_ARTIFACT_MARKER_FOR,
} from '@agiworkforce/artifacts';
import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import { InlineArtifactCard } from '@/src/features/chat/components/InlineArtifactCard';
import { renderMarkdownContent } from '@/src/features/chat/components/MessageContentRenderer';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useArtifactStore, deriveAndMapToMobileArtifacts } from '@/src/features/artifacts/store';
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

const CONVERSATION = 'conv-drawn-once';
const CREATED = '2026-11-15T00:00:00.000Z';
const CARD_LABEL = /^(Code|Email|Document|Content|Chart|Research): /;
const CODE_BLOCK_LABEL = /code block$/;

const SHORT_CODE = [
  'Here is the function.',
  '',
  '```python',
  'def reverse_string(text):',
  '    return text[::-1]',
  '```',
].join('\n');

const PAGE_LINES = [
  EXPLICIT_ARTIFACT_MARKER_FOR.html,
  '<!DOCTYPE html>',
  '<html><head><title>Click Counter</title></head>',
  '<body><button id="count">0</button></body>',
  '</html>',
];
const MARKED_PAGE = [
  'Here is the page.',
  '',
  '```html',
  ...PAGE_LINES,
  '```',
  '',
  'Tap to count.',
].join('\n');
const MARKED_PAGE_STREAMING = ['Here is the page.', '', '```html', ...PAGE_LINES].join('\n');

const MARKED_DOCUMENT = [
  '```markdown',
  EXPLICIT_ARTIFACT_MARKER_FOR.markdown,
  '# Launch plan',
  '',
  'Ship the beta in March.',
  'Collect feedback in April.',
  '```',
].join('\n');

const NESTED_DOCUMENT_LINES = [
  '```markdown',
  EXPLICIT_ARTIFACT_MARKER_FOR.markdown,
  '# Setup guide',
  '```bash',
  'npm install thing',
  '```',
  'Then run it.',
];
const NESTED_DOCUMENT = [...NESTED_DOCUMENT_LINES, '```', '', 'Follow it in order.'].join('\n');
const NESTED_DOCUMENT_STREAMING = NESTED_DOCUMENT_LINES.join('\n');

const SVG_LINES = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">',
  '<title>Red dot</title>',
  '<circle cx="5" cy="5" r="4" fill="red"/>',
  '</svg>',
];
const MARKED_SVG = ['```svg', EXPLICIT_ARTIFACT_MARKER_FOR.svg, ...SVG_LINES, '```'].join('\n');
const PLAIN_SVG = ['```svg', ...SVG_LINES, '```'].join('\n');

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

const XY_CHART = [
  '```mermaid',
  'xychart-beta',
  '  title "Sales"',
  '  x-axis [Q1, Q2, Q3]',
  '  y-axis "Units" 0 --> 10',
  '  bar [1, 2, 3]',
  '```',
].join('\n');

const QUIZ_JSON = JSON.stringify(
  {
    title: 'Cell parts',
    questions: [
      {
        type: 'multiple_choice',
        question: 'Which organelle makes ATP?',
        options: ['Nucleus', 'Mitochondrion'],
        answer: 1,
        explanation: 'Mitochondria run cellular respiration.',
      },
    ],
  },
  null,
  2,
);
const CARDS_JSON = JSON.stringify(
  { title: 'Cell terms', cards: [{ front: 'Osmosis', back: 'Water crossing a membrane' }] },
  null,
  2,
);
const QUIZ_QUESTION = 'Which organelle makes ATP?';

const STORED_TILDE_FORM = [
  'Try this question.',
  '',
  '```markdown',
  EXPLICIT_ARTIFACT_MARKER_FOR.markdown,
  '~~~quiz',
  QUIZ_JSON,
  '~~~',
  '```',
  '',
].join('\n');

const THREE_BACKTICK_WRAPPED_FORM = [
  '```markdown',
  EXPLICIT_ARTIFACT_MARKER_FOR.markdown,
  '```quiz',
  QUIZ_JSON,
  '```',
  '',
  '```flashcards',
  CARDS_JSON,
  '```',
  '```',
].join('\n');

function answer(id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    role: 'assistant',
    content,
    conversationId: CONVERSATION,
    createdAt: CREATED,
    ...extra,
  };
}

function saveDerivedArtifacts(id: string, content: string) {
  useArtifactStore.setState({
    artifacts: deriveAndMapToMobileArtifacts(content, CONVERSATION, id, CREATED, 'Chat', {
      scope: 'cloud',
      ownerId: 'owner-1',
    }),
  });
}

function renderSettled(id: string, content: string) {
  saveDerivedArtifacts(id, content);
  return render(
    <MessageBubble
      message={answer(id, content, {
        metadata: { artifactDerivation: EXPLICIT_ARTIFACT_DERIVATION_POLICY },
      })}
    />,
  );
}

function treeText(view: ReturnType<typeof render>): string {
  return JSON.stringify(view.toJSON());
}

function expectStudyOnly(view: ReturnType<typeof render>) {
  expect(screen.getByText(QUIZ_QUESTION)).toBeTruthy();
  expect(screen.queryAllByLabelText(CODE_BLOCK_LABEL).length).toBe(0);
  expect(screen.queryAllByTestId('markdown-surface-unfinished').length).toBe(0);
  expect(screen.queryAllByTestId('study-segment-unreadable').length).toBe(0);
  const tree = treeText(view);
  expect(tree).not.toContain('@artifact');
  expect(tree).not.toMatch(/[~`]{3}/);
  expect(tree).not.toContain('"questions"');
  expect(tree).not.toContain('Mitochondria run cellular respiration.');
}

describe('an answer draws each piece of content once', () => {
  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useArtifactStore.setState({ artifacts: [] });
  });

  it('shows a short code block as the inline code card only', () => {
    renderSettled('short-code', SHORT_CODE);

    expect(screen.getAllByLabelText(CODE_BLOCK_LABEL)).toHaveLength(1);
    expect(screen.queryAllByLabelText(CARD_LABEL).length).toBe(0);
  });

  it('shows a marked page as its artifact card only, without its source above it', () => {
    const view = renderSettled('marked-page', MARKED_PAGE);

    expect(screen.getByLabelText(/: Click Counter$/)).toBeTruthy();
    expect(screen.queryAllByLabelText(CODE_BLOCK_LABEL).length).toBe(0);
    expect(screen.getByText('Tap to count.')).toBeTruthy();
    expect(treeText(view)).not.toContain('@artifact');
    expect(treeText(view)).not.toContain('</html>');
  });

  it('shows a marked page being written as the Generating artifact card only', () => {
    const view = render(
      <MessageBubble
        message={answer('marked-page-live', MARKED_PAGE_STREAMING, { isStreaming: true })}
      />,
    );

    expect(screen.getByText(/Generating artifact/)).toBeTruthy();
    expect(screen.queryAllByLabelText(CODE_BLOCK_LABEL).length).toBe(0);
    expect(screen.queryAllByTestId('markdown-surface-pending').length).toBe(0);
    expect(treeText(view)).not.toContain('@artifact');
    expect(screen.getByText('Here is the page.')).toBeTruthy();
  });

  it('keeps the page source out of the answer when the page closes mid-stream and after', () => {
    const id = 'marked-page-closing';
    const view = render(
      <MessageBubble message={answer(id, MARKED_PAGE_STREAMING, { isStreaming: true })} />,
    );
    saveDerivedArtifacts(id, MARKED_PAGE);
    view.rerender(<MessageBubble message={answer(id, MARKED_PAGE)} />);

    expect(screen.getByLabelText(/: Click Counter$/)).toBeTruthy();
    expect(screen.queryAllByLabelText(CODE_BLOCK_LABEL).length).toBe(0);
    expect(screen.queryAllByText(/Generating artifact/).length).toBe(0);
  });

  it('shows a page that closed mid-stream as its card before the turn ends', () => {
    const view = render(
      <MessageBubble
        message={answer('marked-page-closed-live', MARKED_PAGE, { isStreaming: true })}
      />,
    );

    expect(screen.getByLabelText(/: Click Counter$/)).toBeTruthy();
    expect(screen.queryAllByLabelText(CODE_BLOCK_LABEL).length).toBe(0);
    expect(screen.queryAllByText(/Generating artifact/).length).toBe(0);
    expect(treeText(view)).not.toContain('@artifact');
    expect(screen.getByText('Tap to count.')).toBeTruthy();
  });

  it('keeps a page with Windows line endings out of the answer', () => {
    const view = renderSettled('marked-page-crlf', MARKED_PAGE.replace(/\n/g, '\r\n'));

    expect(screen.getByLabelText(/: Click Counter$/)).toBeTruthy();
    expect(screen.queryAllByLabelText(CODE_BLOCK_LABEL).length).toBe(0);
    expect(treeText(view)).not.toContain('@artifact');
  });

  it('shows a marked document holding a code block as its card only, live and settled', () => {
    const live = render(
      <MessageBubble
        message={answer('nested-document-live', NESTED_DOCUMENT_STREAMING, { isStreaming: true })}
      />,
    );
    expect(screen.getByText(/Generating artifact/)).toBeTruthy();
    expect(screen.queryAllByLabelText(CODE_BLOCK_LABEL).length).toBe(0);
    expect(treeText(live)).not.toContain('@artifact');
    live.unmount();

    const settled = renderSettled('nested-document', NESTED_DOCUMENT);
    expect(screen.getByLabelText('Document: Setup guide')).toBeTruthy();
    expect(screen.queryAllByLabelText(CODE_BLOCK_LABEL).length).toBe(0);
    expect(screen.queryAllByText('Then run it.').length).toBe(0);
    expect(screen.getByText('Follow it in order.')).toBeTruthy();
    const tree = treeText(settled);
    expect(tree).not.toContain('@artifact');
    expect(tree.split('npm install thing').length).toBeLessThanOrEqual(2);
  });

  it('shows a marked picture as its card only and an unmarked one inline only', () => {
    const marked = renderSettled('marked-svg', MARKED_SVG);
    expect(screen.getByLabelText(/: Red dot$/)).toBeTruthy();
    expect(screen.queryAllByTestId('svg-gallery').length).toBe(0);
    expect(treeText(marked)).not.toContain('@artifact');
    marked.unmount();

    renderSettled('plain-svg', PLAIN_SVG);
    expect(screen.getByTestId('svg-gallery')).toBeTruthy();
    expect(screen.queryAllByLabelText(CARD_LABEL).length).toBe(0);
  });

  it('shows a marked document as its card only', () => {
    const view = renderSettled('marked-document', MARKED_DOCUMENT);

    expect(screen.getByLabelText('Document: Launch plan')).toBeTruthy();
    expect(treeText(view).split('Ship the beta in March.')).toHaveLength(2);
    expect(screen.queryAllByLabelText(CODE_BLOCK_LABEL).length).toBe(0);
  });

  it('shows an email draft as the draft card only, with no To chip', () => {
    renderSettled('email-draft', EMAIL);

    expect(screen.queryAllByLabelText(CARD_LABEL).length).toBe(0);
    expect(screen.queryAllByText('To: landlord@example.com').length).toBe(0);
    expect(screen.queryAllByLabelText(CODE_BLOCK_LABEL).length).toBe(0);
    expect(screen.getByTestId('answer-surface-email')).toBeTruthy();
    expect(screen.getAllByDisplayValue('Leaking tap')).toHaveLength(1);
  });

  it('shows an inline chart with no extra card holding its source', () => {
    const view = renderSettled('xy-chart', XY_CHART);

    expect(screen.getByTestId('report-chart')).toBeTruthy();
    expect(screen.queryAllByLabelText(CARD_LABEL).length).toBe(0);
    expect(treeText(view)).not.toContain('xychart-beta');
  });

  it('shows no Generating artifact card while a wrapped study document is written', () => {
    const studyStreaming = [
      '```markdown',
      EXPLICIT_ARTIFACT_MARKER_FOR.markdown,
      '# Cell parts',
      'Read the notes first.',
      'Then try the question.',
      '```quiz',
      '{',
    ].join('\n');
    render(<MessageBubble message={answer('study-live', studyStreaming, { isStreaming: true })} />);

    expect(screen.queryAllByText(/Generating artifact/).length).toBe(0);
    expect(screen.queryAllByLabelText(CARD_LABEL).length).toBe(0);
  });

  it.each([
    ['the tilde form the simulator stored', STORED_TILDE_FORM],
    ['a three-backtick wrapped study document', THREE_BACKTICK_WRAPPED_FORM],
  ])('shows %s as the interactive quiz only, live and reopened', (_form, content) => {
    const id = `study-${content.length}`;
    const live = render(<MessageBubble message={answer(id, content)} />);
    expectStudyOnly(live);
    expect(screen.queryAllByLabelText(CARD_LABEL).length).toBe(0);
    live.unmount();

    const reopened = renderSettled(id, content);
    expectStudyOnly(reopened);
    expect(screen.queryAllByLabelText(CARD_LABEL).length).toBe(0);
  });

  it('draws no empty code block for the fence a wrapped study document leaves open', () => {
    const view = render(<>{renderMarkdownContent(THREE_BACKTICK_WRAPPED_FORM)}</>);

    expect(screen.queryAllByLabelText(/code block$/).length).toBe(0);
    expect(screen.getByText('Osmosis')).toBeTruthy();
    expect(treeText(view)).not.toContain('Water crossing a membrane');
  });
});

describe('the artifact card preview', () => {
  it.each([
    [
      'jsx',
      [
        EXPLICIT_ARTIFACT_MARKER_FOR.react,
        '// @title: Tiny Counter',
        'function App() {',
        '  return <button>0</button>;',
        '}',
      ],
      'function App() {\n  return <button>0</button>;',
    ],
    ['html', PAGE_LINES, '<!DOCTYPE html>\n<html><head><title>Click Counter</title></head>'],
  ])('leaves out the %s marker and title lines', (language, lines, preview) => {
    const view = render(
      <InlineArtifactCard
        artifact={{
          id: `preview-${language}`,
          type: 'code',
          title: 'Tiny Counter',
          content: lines.join('\n'),
          language,
        }}
        onExpand={jest.fn()}
      />,
    );

    expect(screen.getByText(preview)).toBeTruthy();
    expect(treeText(view)).not.toContain('@artifact');
    expect(treeText(view)).not.toContain('@title');
  });

  it('leaves out the marker on a page the gallery keeps as a document', () => {
    const view = render(
      <InlineArtifactCard
        artifact={{
          id: 'preview-page-document',
          type: 'document',
          title: 'Click Counter',
          content: PAGE_LINES.join('\n'),
          language: 'html',
        }}
        onExpand={jest.fn()}
      />,
    );

    expect(screen.getByText(/^<!DOCTYPE html>/)).toBeTruthy();
    expect(treeText(view)).not.toContain('@artifact');
  });

  it('names a study card by its set and opens the viewer under that name', () => {
    const onExpand = jest.fn();
    render(
      <InlineArtifactCard
        artifact={{
          id: 'study-card',
          type: 'document',
          title: '~~~quiz',
          content: `~~~quiz\n${QUIZ_JSON}\n~~~`,
          language: 'markdown',
        }}
        onExpand={onExpand}
      />,
    );

    expect(screen.queryAllByText('~~~quiz').length).toBe(0);
    fireEvent.press(screen.getByLabelText('Document: Cell parts'));
    expect(onExpand).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cell parts' }));
  });
});
