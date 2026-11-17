import {
  act,
  fireEvent,
  getDefaultNormalizer,
  render,
  waitFor,
} from '@testing-library/react-native';
import { Alert, StyleSheet, type AlertButton } from 'react-native';
import { actionMenuLabels, actionMenuTitle, chooseActionMenuItem } from '@/test-utils/actionMenu';

const mockMermaidView = jest.fn();
const mockPreviewMount = jest.fn();
const mockPreviewProps = jest.fn();
const mockMermaidMount = jest.fn();
const mockArtifactViewer = jest.fn();
const mockExportSourceFile = jest.fn();
const mockExportToMarkdown = jest.fn();
const mockShareFile = jest.fn();
const mockDownloadGeneratedFile = jest.fn();

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

const mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => mockInsets,
  };
});

jest.mock('react-native-webview', () => ({ WebView: () => null }));

jest.mock('@/services/fileCreation', () => {
  const actual = jest.requireActual('@/services/fileCreation');
  return {
    FileDownloadError: actual.FileDownloadError,
    downloadFailureMessage: actual.downloadFailureMessage,
    shareFile: (...args: unknown[]) => mockShareFile(...args),
    exportSourceFile: (...args: unknown[]) => mockExportSourceFile(...args),
    exportToMarkdown: (...args: unknown[]) => mockExportToMarkdown(...args),
    exportToText: jest.fn(),
    exportToPDF: jest.fn(),
    exportHtmlToPDF: jest.fn(),
    exportToDocx: jest.fn(),
    downloadGeneratedFile: (...args: unknown[]) => mockDownloadGeneratedFile(...args),
  };
});

jest.mock('../MessageContentRenderer', () => ({ renderMarkdownContent: () => null }));

jest.mock('../GeneratedFileCard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { GeneratedFileCard: () => <View testID="generated-file-card" /> };
});

jest.mock('../SafeArtifactPreview', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    SafeArtifactPreview: (props: unknown) => {
      mockPreviewProps(props);
      useEffect(() => {
        mockPreviewMount();
      }, []);
      return <View testID="safe-artifact-preview" />;
    },
  };
});

jest.mock('../MermaidDiagramView', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    MermaidDiagramView: (props: Record<string, unknown>) => {
      mockMermaidView(props);
      useEffect(() => {
        mockMermaidMount();
      }, []);
      return <View testID="mermaid-diagram-view" />;
    },
  };
});

jest.mock('../artifact-viewers/ArtifactViewer', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    ...jest.requireActual('../artifact-viewers/ArtifactViewer'),
    ArtifactViewer: (props: Record<string, unknown>) => {
      mockArtifactViewer(props);
      return <View testID="artifact-viewer" />;
    },
  };
});

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('@/src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => null,
}));

import { NavigationContext } from 'expo-router/react-navigation';
import { ArtifactFullScreen } from '../ArtifactFullScreen';
import { FULL_SCREEN_TOUCH_TARGET } from '../../chrome/fullScreenChrome';
import { READING_COLUMN_MAX_WIDTH } from '@/src/shared/layout/contentColumn';
import { spaceAbove, tapTarget } from '@/test-utils/viewerChrome';
import { copyToClipboard } from '@/lib/clipboard';
import { FileDownloadError } from '@/services/fileCreation';
import { useArtifactStore } from '@/src/features/artifacts/store';
import { useComposerPrefillStore } from '@/src/features/chat/store/composerPrefillStore';
import { useCodePreferences } from '@/src/features/settings/code/store';
import type { MobileArtifact } from '@/src/features/artifacts/types';
import type { Artifact } from '@/types/chat';

const HTML = '<main><h1>Launch</h1></main>';
const MERMAID = 'graph TD\n  A --> B';
const DRAWN_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>';

const htmlArtifact: Artifact = {
  id: 'artifact-html',
  type: 'code',
  title: 'landing.html',
  content: HTML,
  language: 'html',
};

const mermaidArtifact: Artifact = {
  id: 'artifact-mermaid',
  type: 'code',
  title: 'Flow',
  content: MERMAID,
  language: 'mermaid',
};

const DOC_V1 = '# Plan\n\nShip on Friday.';
const DOC_V2 = '# Plan\n\nShip on Monday.';

const documentArtifact: Artifact = {
  id: 'artifact-doc',
  type: 'document',
  title: 'Plan',
  content: DOC_V1,
};

function storedDocument(content: string): MobileArtifact {
  return {
    id: documentArtifact.id,
    messageId: 'message-doc',
    title: documentArtifact.title,
    kind: 'document',
    content,
    ageLabel: 'just now',
    sourceLabel: 'Local chat',
    accentColor: '#21808d',
    previewLines: [content],
    provenance: { scope: 'local' },
  };
}

function lastAlert(alert: jest.SpyInstance) {
  const call = alert.mock.calls[alert.mock.calls.length - 1] ?? [];
  return {
    title: call[0] as string,
    message: call[1] as string | undefined,
    buttons: (call[2] ?? []) as AlertButton[],
  };
}

function press(buttons: AlertButton[], text: string) {
  const button = buttons.find((candidate) => candidate.text === text);
  expect(button).toBeDefined();
  act(() => button?.onPress?.());
}

let alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useArtifactStore.setState({
    artifacts: [],
    versionsById: {},
    cloudArtifacts: [],
    cloudArtifactsOwnerId: null,
  });
  mockShareFile.mockResolvedValue(undefined);
  mockExportSourceFile.mockImplementation(async (_body: string, title: string, ext: string) => ({
    uri: `file:///exports/${title}.${ext}`,
  }));
});

afterEach(() => alert.mockRestore());

describe('the artifact viewer on a wide window', () => {
  it('holds a document to the reading column and keeps its padding', () => {
    const screen = render(
      <ArtifactFullScreen artifact={documentArtifact} visible onClose={() => undefined} />,
    );

    const style = StyleSheet.flatten(
      screen.getByTestId('artifact-fullscreen-document').props.contentContainerStyle,
    );
    expect(style).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
      padding: 16,
    });
  });
});

describe('the artifact viewer header', () => {
  afterEach(() => {
    mockInsets.top = 0;
  });

  it('lays Close out under the status bar as a 44 point target, and the system back closes too', () => {
    mockInsets.top = 59;
    const onClose = jest.fn();
    const screen = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={onClose} />);

    const close = screen.getByTestId('chat.artifact.fullscreen.close');
    expect(spaceAbove(close)).toBeGreaterThanOrEqual(59);
    expect(tapTarget(close).width).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);
    expect(tapTarget(close).height).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);
    fireEvent.press(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('opening a previewable artifact', () => {
  it('shows the running preview first and switches to the source on Source', () => {
    const screen = render(
      <ArtifactFullScreen artifact={htmlArtifact} visible onClose={jest.fn()} />,
    );

    expect(screen.getByTestId('safe-artifact-preview')).toBeTruthy();
    expect(screen.getByLabelText('Preview').props.accessibilityState).toEqual({ selected: true });
    expect(screen.queryByText(HTML)).toBeNull();

    fireEvent.press(screen.getByLabelText('Source'));

    expect(screen.queryByTestId('safe-artifact-preview')).toBeNull();
    expect(screen.getByText(HTML)).toBeTruthy();
    expect(screen.getByLabelText('Source').props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(screen.getByLabelText('Preview'));
    expect(screen.getByTestId('safe-artifact-preview')).toBeTruthy();
  });

  it.each([undefined, 'xml', 'text'])(
    'previews an svg picture written in a fence labelled %s',
    (language) => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4" cx="5" cy="5"/></svg>';
      const screen = render(
        <ArtifactFullScreen
          artifact={{
            id: `artifact-bare-svg-${language ?? 'none'}`,
            type: 'code',
            title: 'Dot',
            content: svg,
            ...(language ? { language } : {}),
          }}
          visible
          onClose={jest.fn()}
        />,
      );

      expect(screen.getByTestId('safe-artifact-preview')).toBeTruthy();
      const props = mockPreviewProps.mock.calls[mockPreviewProps.mock.calls.length - 1]?.[0] as {
        kind: string;
      };
      expect(props.kind).toBe('svg');
    },
  );

  it('keeps plain text that only mentions svg on its source', () => {
    const screen = render(
      <ArtifactFullScreen
        artifact={{
          id: 'artifact-svg-notes',
          type: 'code',
          title: 'Notes',
          content: 'Use an <svg> element for icons.',
          language: 'text',
        }}
        visible
        onClose={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('safe-artifact-preview')).toBeNull();
  });

  it.each(['jsx', 'tsx', 'react'])(
    'runs a %s artifact in the sandboxed React preview, which can go back to the source',
    (language) => {
      const source = 'export default function App() { return <p>Hi</p>; }';
      const screen = render(
        <ArtifactFullScreen
          artifact={{
            id: `artifact-${language}`,
            type: 'code',
            title: 'App',
            content: source,
            language,
          }}
          visible
          onClose={jest.fn()}
        />,
      );

      expect(screen.getByTestId('safe-artifact-preview')).toBeTruthy();
      expect(screen.getByLabelText('Preview').props.accessibilityState).toEqual({ selected: true });
      const props = mockPreviewProps.mock.calls[mockPreviewProps.mock.calls.length - 1]?.[0] as {
        kind: string;
        content: string;
        onViewSource: () => void;
      };
      expect(props.kind).toBe('react');
      expect(props.content).toBe(source);
      expect(screen.queryByText('Live preview isn’t available for this type')).toBeNull();

      act(() => props.onViewSource());
      expect(screen.queryByTestId('safe-artifact-preview')).toBeNull();
      expect(screen.getByText(source)).toBeTruthy();
    },
  );

  it('draws a mermaid artifact with the themed diagram view, which can go back to the source', () => {
    const screen = render(
      <ArtifactFullScreen artifact={mermaidArtifact} visible onClose={jest.fn()} />,
    );

    expect(screen.getByTestId('mermaid-diagram-view')).toBeTruthy();
    const props = mockMermaidView.mock.calls[mockMermaidView.mock.calls.length - 1]?.[0] as {
      source: string;
      onViewSource: () => void;
    };
    expect(props.source).toBe(MERMAID);

    act(() => props.onViewSource());
    expect(screen.queryByTestId('mermaid-diagram-view')).toBeNull();
    expect(screen.getByText(MERMAID)).toBeTruthy();
  });

  it('offers the drawn diagram as an SVG file and saves exactly the drawing', async () => {
    const screen = render(
      <ArtifactFullScreen artifact={mermaidArtifact} visible onClose={jest.fn()} />,
    );
    const props = mockMermaidView.mock.calls[mockMermaidView.mock.calls.length - 1]?.[0] as {
      onDrawn: (svg: string | null) => void;
    };
    act(() => props.onDrawn(DRAWN_SVG));

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Download artifact'));
    });
    const menu = lastAlert(alert);
    expect(menu.buttons.map((button) => button.text)).toEqual(['SVG image', 'MMD file', 'Cancel']);

    press(menu.buttons, 'SVG image');
    await waitFor(() => expect(mockShareFile).toHaveBeenCalledWith('file:///exports/Flow.svg'));
    expect(mockExportSourceFile).toHaveBeenCalledWith(DRAWN_SVG, 'Flow', 'svg');

    press(menu.buttons, 'MMD file');
    await waitFor(() => expect(mockShareFile).toHaveBeenCalledWith('file:///exports/Flow.mmd'));
    expect(mockExportSourceFile).toHaveBeenCalledWith(MERMAID, 'Flow', 'mmd');
  });

  it('saves the source straight away while no drawing has been made', async () => {
    const screen = render(
      <ArtifactFullScreen artifact={mermaidArtifact} visible onClose={jest.fn()} />,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Download artifact'));
    });

    expect(alert).not.toHaveBeenCalled();
    expect(mockExportSourceFile).toHaveBeenCalledWith(MERMAID, 'Flow', 'mmd');
    expect(mockShareFile).toHaveBeenCalledWith('file:///exports/Flow.mmd');
  });
});

describe('artifacts the app has a viewer for', () => {
  it("opens a quiz document on the study view, whose follow-up goes to this chat's composer", () => {
    const quiz = JSON.stringify({
      title: 'Cells',
      questions: [
        {
          type: 'multiple_choice',
          question: 'Which organelle makes ATP?',
          options: ['Nucleus', 'Mitochondrion'],
          answer: 1,
          explanation: 'Mitochondria run cellular respiration.',
        },
      ],
    });
    const content = ['# Cells practice', '', '~~~quiz', quiz, '~~~'].join('\n');
    const onClose = jest.fn();
    useComposerPrefillStore.setState({ pending: {} });
    const screen = render(
      <ArtifactFullScreen
        artifact={{ id: 'study-1', type: 'document', title: 'Cells practice', content }}
        visible
        onClose={onClose}
        conversationId="conv-study"
      />,
    );

    expect(screen.getByTestId('artifact-fullscreen-study')).toBeTruthy();
    expect(screen.getByLabelText('Preview').props.accessibilityState).toEqual({ selected: true });
    const props = mockArtifactViewer.mock.calls.at(-1)?.[0] as {
      source: unknown;
      renderMarkdown?: unknown;
      onAsk?: (prompt: string) => void;
    };
    expect(props.source).toEqual({ origin: 'inline', title: 'Cells practice', content });
    expect(typeof props.renderMarkdown).toBe('function');

    act(() => props.onAsk?.('Explain what I missed'));
    expect(useComposerPrefillStore.getState().pending['conv-study']).toBe('Explain what I missed');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers no study follow-up outside a chat', () => {
    const content = [
      '~~~flashcards',
      JSON.stringify({ title: 'Words', cards: [{ front: 'a', back: 'b' }] }),
      '~~~',
    ].join('\n');
    const screen = render(
      <ArtifactFullScreen
        artifact={{ id: 'study-2', type: 'document', title: 'Words', content }}
        visible
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('artifact-fullscreen-study')).toBeTruthy();
    const props = mockArtifactViewer.mock.calls.at(-1)?.[0] as { onAsk?: unknown };
    expect(props.onAsk).toBeUndefined();
  });

  it('opens a CSV artifact on its grid and keeps the source one tab away', () => {
    const csv = 'name,score\nAda,3\n';
    const screen = render(
      <ArtifactFullScreen
        artifact={{ id: 'csv-1', type: 'code', title: 'scores.csv', content: csv, language: 'csv' }}
        visible
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('artifact-fullscreen-table')).toBeTruthy();
    expect(mockArtifactViewer).toHaveBeenLastCalledWith({
      source: { origin: 'inline', title: 'scores.csv', content: csv, language: 'csv' },
    });

    fireEvent.press(screen.getByLabelText('Source'));
    expect(screen.queryByTestId('artifact-fullscreen-table')).toBeNull();
    expect(screen.getByText(csv)).toBeTruthy();
  });

  it('opens a Markdown deck on its slides and keeps the whole deck one tab away', () => {
    const deck = '<!-- deck -->\n# Launch plan\nWhy now\n\n---\n\n## Steps\nShip it';
    const screen = render(
      <ArtifactFullScreen
        artifact={{ id: 'deck-1', type: 'document', title: 'Launch plan', content: deck }}
        visible
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('artifact-fullscreen-deck')).toBeTruthy();
    const props = mockArtifactViewer.mock.calls[mockArtifactViewer.mock.calls.length - 1]?.[0];
    expect(props.source).toEqual({ origin: 'inline', title: 'Launch plan', content: deck });
    expect(typeof props.renderMarkdown).toBe('function');

    fireEvent.press(screen.getByLabelText('Source'));
    expect(screen.queryByTestId('artifact-fullscreen-deck')).toBeNull();
    expect(screen.getByTestId('artifact-fullscreen-markdown')).toBeTruthy();
  });

  it('lets a saved deck in a chat be asked about and edited slide by slide, saving each edit as a version', () => {
    const deck = '<!-- deck -->\n# Launch plan\nWhy now\n\n---\n\n## Steps\nShip it';
    const edited = '<!-- deck -->\n\n# A\n';
    useArtifactStore.getState().addArtifacts([{ ...storedDocument(deck), id: 'deck-saved' }]);
    render(
      <ArtifactFullScreen
        artifact={{ id: 'deck-saved', type: 'document', title: 'Plan', content: deck }}
        visible
        onClose={jest.fn()}
        conversationId="conv-deck"
      />,
    );

    const props = mockArtifactViewer.mock.calls.at(-1)?.[0] as {
      onAsk?: unknown;
      onSave?: (content: string) => void;
      handEdited?: boolean;
    };
    expect(typeof props.onAsk).toBe('function');
    expect(typeof props.onSave).toBe('function');
    expect(props.handEdited).toBe(false);

    act(() => props.onSave?.(edited));

    const stored = useArtifactStore.getState();
    expect(stored.artifacts.find((item) => item.id === 'deck-saved')?.content).toBe(edited);
    expect(stored.getArtifactVersions('deck-saved').map((version) => version.content)).toEqual([
      deck,
      edited,
    ]);
    const after = mockArtifactViewer.mock.calls.at(-1)?.[0] as { handEdited?: boolean };
    expect(after.handEdited).toBe(true);
  });

  it('offers no slide editing for a deck that is not saved', () => {
    const deck = '<!-- deck -->\n# Launch plan\nWhy now\n\n---\n\n## Steps\nShip it';
    render(
      <ArtifactFullScreen
        artifact={{ id: 'deck-unsaved', type: 'document', title: 'Launch plan', content: deck }}
        visible
        onClose={jest.fn()}
        conversationId="conv-deck"
      />,
    );

    const props = mockArtifactViewer.mock.calls.at(-1)?.[0] as { onSave?: unknown };
    expect(props.onSave).toBeUndefined();
  });

  it('draws a generated PDF in the file viewer under its own name', () => {
    const screen = render(
      <ArtifactFullScreen
        artifact={{
          id: 'generated-pdf',
          type: 'document',
          title: 'Quarterly report',
          content: '',
          generatedFile: {
            id: 'file-report',
            computeSessionId: '',
            ownerUserId: '',
            sourceSurface: 'mobile',
            privacyMode: 'managed',
            providerMode: 'ManagedGateway',
            kind: 'pdf',
            fileName: 'report.pdf',
            mimeType: 'application/pdf',
            uri: 'https://agiworkforce.com/api/files/gf-1',
            byteCount: 2048,
            checksumSha256: 'abcdef1234567890',
            previewDerivatives: [],
            createdAt: '2026-08-13T00:00:00.000Z',
          },
        }}
        visible
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('artifact-fullscreen-file-viewer')).toBeTruthy();
    expect(screen.queryByTestId('generated-file-card')).toBeNull();
    expect(mockArtifactViewer).toHaveBeenLastCalledWith({
      source: {
        origin: 'file',
        title: 'Quarterly report',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        url: 'https://agiworkforce.com/api/files/gf-1',
        byteCount: 2048,
      },
    });
  });
});

describe('the source view', () => {
  const codeArtifact: Artifact = {
    id: 'artifact-code',
    type: 'code',
    language: 'python',
    title: 'add.py',
    content: 'def add(a, b):\n    return a + b',
  };

  afterEach(() => useCodePreferences.setState({ wrapLongLines: false }));

  it('scrolls long lines sideways while Wrap long lines is off', () => {
    useCodePreferences.setState({ wrapLongLines: false });
    const screen = render(
      <ArtifactFullScreen artifact={codeArtifact} visible onClose={jest.fn()} />,
    );

    expect(screen.getByTestId('artifact-fullscreen-source').props.horizontal).toBe(true);
  });

  it('wraps long lines when the person turned Wrap long lines on', () => {
    useCodePreferences.setState({ wrapLongLines: true });
    const screen = render(
      <ArtifactFullScreen artifact={codeArtifact} visible onClose={jest.fn()} />,
    );

    expect(screen.getByTestId('artifact-fullscreen-source').props.horizontal).toBeUndefined();
    expect(screen.getByText(/return a \+ b/)).toBeTruthy();
  });

  const threeLines: Artifact = {
    id: 'artifact-three',
    type: 'code',
    language: 'python',
    title: 'count.py',
    content: 'a = 1\nb = 2\nprint(a + b)',
  };

  it('numbers each source line in a gutter that screen readers skip', () => {
    useCodePreferences.setState({ wrapLongLines: false });
    const screen = render(<ArtifactFullScreen artifact={threeLines} visible onClose={jest.fn()} />);

    const gutter = screen.getByTestId('artifact-source-line-numbers', {
      includeHiddenElements: true,
    });
    expect(gutter.props.children).toBe('1\n2\n3');
    expect(gutter.props.selectable).toBe(false);
    expect(gutter.props.accessibilityElementsHidden).toBe(true);
    expect(gutter.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('keeps each number beside its own line when long lines wrap', () => {
    useCodePreferences.setState({ wrapLongLines: true });
    const screen = render(<ArtifactFullScreen artifact={threeLines} visible onClose={jest.fn()} />);

    expect(
      screen
        .getAllByTestId('artifact-source-line-numbers', { includeHiddenElements: true })
        .map((row) => row.props.children),
    ).toEqual(['1', '2', '3']);
    expect(screen.getByText(/print\(a \+ b\)/)).toBeTruthy();
  });

  it('copies the source without the line numbers', async () => {
    const screen = render(<ArtifactFullScreen artifact={threeLines} visible onClose={jest.fn()} />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Copy content'));
    });

    expect(copyToClipboard).toHaveBeenCalledWith('a = 1\nb = 2\nprint(a + b)');
  });

  const tabbedGo: Artifact = {
    id: 'artifact-go',
    type: 'code',
    language: 'go',
    title: 'main.go',
    content: 'func main() {\n\tx := 1\n}',
  };

  it('lines up tab-indented code four columns wide and copies the tabs as written', async () => {
    useCodePreferences.setState({ wrapLongLines: true });
    const screen = render(<ArtifactFullScreen artifact={tabbedGo} visible onClose={jest.fn()} />);

    const asWritten = {
      normalizer: getDefaultNormalizer({ trim: false, collapseWhitespace: false }),
    };
    expect(screen.getByText('    x := 1', asWritten)).toBeTruthy();
    expect(screen.queryByText(/\t/, asWritten)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Copy content'));
    });

    expect(copyToClipboard).toHaveBeenCalledWith('func main() {\n\tx := 1\n}');
  });
});

describe('refreshing a live preview', () => {
  it('offers Refresh preview in More and starts the preview again from the beginning', () => {
    const screen = render(
      <ArtifactFullScreen artifact={htmlArtifact} visible onClose={jest.fn()} />,
    );
    expect(mockPreviewMount).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('More artifact actions'));
    chooseActionMenuItem('Refresh preview');

    expect(mockPreviewMount).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('safe-artifact-preview')).toBeTruthy();
  });

  it('draws the diagram again when a mermaid preview is refreshed', () => {
    const screen = render(
      <ArtifactFullScreen artifact={mermaidArtifact} visible onClose={jest.fn()} />,
    );
    expect(mockMermaidMount).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('More artifact actions'));
    chooseActionMenuItem('Refresh preview');

    expect(mockMermaidMount).toHaveBeenCalledTimes(2);
    expect(mockMermaidView.mock.calls[mockMermaidView.mock.calls.length - 1]?.[0]).toMatchObject({
      source: MERMAID,
    });
  });

  it('leaves Refresh preview out while the source is shown', () => {
    const screen = render(
      <ArtifactFullScreen artifact={htmlArtifact} visible onClose={jest.fn()} />,
    );
    fireEvent.press(screen.getByLabelText('Source'));

    fireEvent.press(screen.getByLabelText('More artifact actions'));

    expect(actionMenuLabels()).not.toContain('Refresh preview');
  });
});

describe('a chart artifact', () => {
  it('says why invalid JSON cannot be plotted and keeps the raw content', () => {
    const screen = render(
      <ArtifactFullScreen
        artifact={{ id: 'chart-1', type: 'chart', title: 'Revenue', content: '{"type": "bar",' }}
        visible
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('artifact-fullscreen-chart')).toBeTruthy();
    expect(screen.getByTestId('chart-artifact-fallback')).toBeTruthy();
    expect(screen.getByText('This chart is not valid JSON, so it cannot be plotted.')).toBeTruthy();
    expect(screen.getByText('{"type": "bar",')).toBeTruthy();
  });
});

describe('header controls', () => {
  it('draws bare icon controls, each with a 44 point tap area', () => {
    const screen = render(
      <ArtifactFullScreen artifact={htmlArtifact} visible onClose={jest.fn()} />,
    );

    for (const label of [
      'Publish artifact to a public link',
      'Download artifact',
      'Copy content',
      'More artifact actions',
    ]) {
      const style = StyleSheet.flatten(screen.getByLabelText(label).props.style);
      expect(style).toMatchObject({ width: 44, height: 44 });
      expect(style.backgroundColor).toBeUndefined();
      expect(style.borderWidth).toBeUndefined();
    }
    expect(
      StyleSheet.flatten(screen.getByTestId('chat.artifact.fullscreen.close').props.style)
        .backgroundColor,
    ).toBeUndefined();
  });

  it('puts Regenerate in the More menu and closes the artifact when it runs', () => {
    const onRegenerate = jest.fn();
    const onClose = jest.fn();
    const screen = render(
      <ArtifactFullScreen
        artifact={htmlArtifact}
        visible
        onClose={onClose}
        onRegenerate={onRegenerate}
      />,
    );

    expect(screen.queryByLabelText('Regenerate artifact')).toBeNull();
    fireEvent.press(screen.getByLabelText('More artifact actions'));
    expect(actionMenuTitle()).toBe('landing.html');
    chooseActionMenuItem('Regenerate');

    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('says a deleted generated file no longer exists instead of asking to try again', async () => {
    mockDownloadGeneratedFile.mockRejectedValue(new FileDownloadError(404));
    const screen = render(
      <ArtifactFullScreen
        artifact={{
          id: 'generated-1',
          type: 'document',
          title: 'report.pdf',
          content: '',
          generatedFile: {
            id: 'file-report',
            computeSessionId: '',
            ownerUserId: '',
            sourceSurface: 'mobile',
            privacyMode: 'managed',
            providerMode: 'ManagedGateway',
            kind: 'pdf',
            fileName: 'report.pdf',
            mimeType: 'application/pdf',
            uri: 'https://agiworkforce.com/api/files/gf-1',
            byteCount: 2048,
            checksumSha256: 'abcdef1234567890',
            previewDerivatives: [],
            createdAt: '2026-08-13T00:00:00.000Z',
          },
        }}
        visible
        onClose={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Download artifact'));
    });

    expect(alert).toHaveBeenCalledWith('Download failed', 'This file no longer exists.');
  });
});

describe('editing a document artifact', () => {
  function openEditor() {
    useArtifactStore.getState().addArtifacts([storedDocument(DOC_V1)]);
    const screen = render(
      <ArtifactFullScreen artifact={documentArtifact} visible onClose={jest.fn()} />,
    );
    fireEvent.press(screen.getByLabelText('More artifact actions'));
    chooseActionMenuItem('Edit source');
    return screen;
  }

  it('closes at once on Cancel when nothing was changed', () => {
    const screen = openEditor();
    expect(screen.getByLabelText('Artifact source').props.value).toBe(DOC_V1);
    alert.mockClear();

    fireEvent.press(screen.getByLabelText('Cancel editing'));

    expect(alert).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Artifact source')).toBeNull();
  });

  it('asks before Cancel throws changed text away, and naming the loss', () => {
    const screen = openEditor();
    fireEvent.changeText(screen.getByLabelText('Artifact source'), 'Something new');
    alert.mockClear();

    fireEvent.press(screen.getByLabelText('Cancel editing'));

    const ask = lastAlert(alert);
    expect(ask.title).toBe('Discard your edits?');
    expect(ask.message).toBe('Your changes to “Plan” will be lost.');
    press(ask.buttons, 'Keep editing');
    expect(screen.getByLabelText('Artifact source').props.value).toBe('Something new');

    fireEvent.press(screen.getByLabelText('Cancel editing'));
    press(lastAlert(alert).buttons, 'Discard');
    expect(screen.queryByLabelText('Artifact source')).toBeNull();
    expect(useArtifactStore.getState().artifacts[0]?.content).toBe(DOC_V1);
  });

  it('says a newer version arrived and asks before Save puts the edit over it', () => {
    const screen = openEditor();
    fireEvent.changeText(screen.getByLabelText('Artifact source'), 'My own words');
    expect(screen.queryByTestId('artifact-edit-stale')).toBeNull();

    act(() => useArtifactStore.getState().addArtifacts([storedDocument(DOC_V2)]));

    expect(screen.getByTestId('artifact-edit-stale')).toBeTruthy();
    expect(screen.getByLabelText('Artifact source').props.value).toBe('My own words');
    alert.mockClear();

    fireEvent.press(screen.getByLabelText('Save as a new version'));
    const ask = lastAlert(alert);
    expect(ask.title).toBe('Save over the newer version?');
    expect(useArtifactStore.getState().artifacts[0]?.content).toBe(DOC_V2);

    press(ask.buttons, 'Save anyway');
    expect(useArtifactStore.getState().artifacts[0]?.content).toBe('My own words');
    expect(
      useArtifactStore
        .getState()
        .getArtifactVersions(documentArtifact.id)
        .map((version) => version.content),
    ).toEqual([DOC_V1, DOC_V2, 'My own words']);
  });
});

describe('the artifact marker', () => {
  const marked: Artifact = {
    id: 'artifact-marked',
    type: 'code',
    title: 'landing',
    content: '<!-- @artifact -->\n<main>Hi</main>',
    language: 'html',
  };

  it('never shows the marker in the source and leaves it out of the saved file', async () => {
    const screen = render(<ArtifactFullScreen artifact={marked} visible onClose={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Source'));

    expect(screen.getByText('<main>Hi</main>')).toBeTruthy();
    expect(screen.queryByText(/@artifact/)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Download artifact'));
    });
    expect(mockExportSourceFile).toHaveBeenCalledWith('<main>Hi</main>', 'landing', 'html');
    expect(mockShareFile).toHaveBeenCalledWith('file:///exports/landing.html');
  });
});

describe('leaving the screen under the artifact', () => {
  it('closes the artifact when a link opens another route', () => {
    const listeners: Record<string, () => void> = {};
    const navigation = {
      addListener: jest.fn((event: string, listener: () => void) => {
        listeners[event] = listener;
        return () => delete listeners[event];
      }),
    };
    const onClose = jest.fn();
    render(
      <NavigationContext.Provider value={navigation as never}>
        <ArtifactFullScreen artifact={htmlArtifact} visible onClose={onClose} />
      </NavigationContext.Provider>,
    );

    act(() => listeners.blur?.());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not listen while the artifact is closed', () => {
    const navigation = { addListener: jest.fn(() => () => undefined) };
    render(
      <NavigationContext.Provider value={navigation as never}>
        <ArtifactFullScreen artifact={htmlArtifact} visible={false} onClose={jest.fn()} />
      </NavigationContext.Provider>,
    );

    expect(navigation.addListener).not.toHaveBeenCalled();
  });
});
