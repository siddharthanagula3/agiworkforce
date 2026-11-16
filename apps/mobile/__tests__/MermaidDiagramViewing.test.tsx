/* eslint-disable @typescript-eslint/no-require-imports */

type WebViewProps = {
  source: { html: string };
  style?: unknown;
  scrollEnabled?: boolean;
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
};

const mockWebViews: WebViewProps[] = [];

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    WebView: (props: WebViewProps) => {
      mockWebViews.push(props);
      return require('react').createElement(View, { testID: 'diagram-webview' });
    },
  };
});

jest.mock('../src/features/chat/components/mermaidRuntime', () => ({
  loadMermaidRuntime: () => Promise.resolve('window.mermaid = {};'),
}));

const mockCopyToClipboard = jest.fn();
jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => mockCopyToClipboard(...args),
}));

const mockTheme = { isDark: false, colors: {} as Record<string, string> };
jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    useTheme: () => mockTheme,
    useThemeColors: () => mockTheme.colors,
  };
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Share, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getColors } from '../src/ui/theme/tokens';
import { MermaidDiagramBlock } from '../src/features/chat/components/MermaidDiagramBlock';
import { MermaidDiagramView } from '../src/features/chat/components/MermaidDiagramView';

const FLOW = 'graph LR\n  A[Start] --> B[Finish]';

function latest(): WebViewProps {
  return mockWebViews[mockWebViews.length - 1]!;
}

function post(view: WebViewProps, message: object) {
  act(() => view.onMessage?.({ nativeEvent: { data: JSON.stringify(message) } }));
}

function renderBlock(source = FLOW) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 59, right: 0, bottom: 34, left: 0 },
      }}
    >
      <MermaidDiagramBlock
        source={source}
        colors={mockTheme.colors as never}
        sourceBlock={<Text>source card</Text>}
      />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockWebViews.length = 0;
  mockCopyToClipboard.mockReset().mockResolvedValue(true);
  mockTheme.isDark = false;
  mockTheme.colors = getColors('light', 'light', false);
});

describe('mermaid diagram viewing', () => {
  it('copies the exact diagram source from a direct control and confirms', async () => {
    renderBlock();

    fireEvent.press(screen.getByLabelText('Copy diagram source'));

    await waitFor(() => expect(screen.getByLabelText('Copied')).toBeTruthy());
    expect(mockCopyToClipboard).toHaveBeenCalledWith(FLOW);
  });

  it('shares the exact diagram source for a clipboard the system refuses', () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    renderBlock();

    fireEvent.press(screen.getByLabelText('Share diagram source'));

    expect(share).toHaveBeenCalledWith({ message: FLOW });
    share.mockRestore();
  });

  it('opens every drawn diagram full screen with Copy source and Close', async () => {
    renderBlock('graph TD\n  A --> B');
    await waitFor(() => expect(mockWebViews.length).toBeGreaterThan(0));
    const inlineCount = mockWebViews.length;

    fireEvent.press(screen.getByLabelText('Expand diagram'));

    await waitFor(() => expect(mockWebViews.length).toBeGreaterThan(inlineCount));
    expect(latest().scrollEnabled).toBe(true);
    expect(mockWebViews[inlineCount - 1]!.source.html).toContain('var fitWidth = false;');
    expect(latest().source.html).toContain('var fitWidth = true;');
    expect(screen.getByText('Diagram', { exact: true })).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Copy diagram source'));
    await waitFor(() => expect(mockCopyToClipboard).toHaveBeenCalledWith('graph TD\n  A --> B'));
    fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.queryByLabelText('Close')).toBeNull();
    expect(screen.getByLabelText('Expand diagram')).toBeTruthy();
  });

  it('keeps the drawn height when the diagram scrolls back into view', async () => {
    const source = 'graph LR\n  Cached --> Height';
    const first = renderBlock(source);
    await waitFor(() => expect(mockWebViews.length).toBeGreaterThan(0));
    post(latest(), { type: 'rendered', height: 312 });
    first.unmount();

    mockWebViews.length = 0;
    renderBlock(source);
    await waitFor(() => expect(mockWebViews.length).toBeGreaterThan(0));

    expect(StyleSheet.flatten(latest().style as never)).toMatchObject({ height: 312 });
  });
});

describe('mermaid diagram in the chat', () => {
  it('lays a tall diagram out at its drawn height and never scrolls it inside the answer', async () => {
    renderBlock('sequenceDiagram\n  A->>B: hello');
    await waitFor(() => expect(mockWebViews.length).toBeGreaterThan(0));
    post(latest(), { type: 'rendered', height: 1400, width: 300 });

    await waitFor(() =>
      expect(StyleSheet.flatten(latest().style as never)).toMatchObject({ height: 1400 }),
    );
    expect(latest().scrollEnabled).toBe(false);
  });

  it('leaves a short diagram unscrolled too', async () => {
    renderBlock();
    await waitFor(() => expect(mockWebViews.length).toBeGreaterThan(0));
    post(latest(), { type: 'rendered', height: 200, width: 300 });

    await waitFor(() =>
      expect(StyleSheet.flatten(latest().style as never)).toMatchObject({ height: 200 }),
    );
    expect(latest().scrollEnabled).toBe(false);
  });

  it('scrolls a wide diagram sideways in its frame, not the page inside it', async () => {
    renderBlock();
    await waitFor(() => expect(mockWebViews.length).toBeGreaterThan(0));
    fireEvent(screen.getByTestId('mermaid-diagram-scroll').parent!.parent!, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 200 } },
    });
    post(latest(), { type: 'rendered', height: 900, width: 700 });

    await waitFor(() =>
      expect(StyleSheet.flatten(latest().style as never)).toMatchObject({
        width: 700,
        height: 900,
      }),
    );
    expect(latest().scrollEnabled).toBe(false);
    expect(screen.getByTestId('mermaid-diagram-scroll').props.scrollEnabled).toBe(true);
  });
});

describe('mermaid diagram in an artifact preview', () => {
  it('draws in the dark diagram theme and background when the app is dark', async () => {
    mockTheme.isDark = true;
    mockTheme.colors = getColors('dark', 'dark', false);
    render(<MermaidDiagramView source={FLOW} />);

    await waitFor(() => expect(mockWebViews.length).toBeGreaterThan(0));
    expect(latest().source.html).toContain("theme: 'dark'");
    expect(latest().source.html).toContain(`background:${mockTheme.colors.surfaceBase}`);
  });

  it('shows the reason and the source when a diagram cannot be drawn', async () => {
    const onViewSource = jest.fn();
    render(<MermaidDiagramView source="graph ??" onViewSource={onViewSource} />);
    await waitFor(() => expect(mockWebViews.length).toBeGreaterThan(0));

    post(latest(), { type: 'failed', reason: 'Parse error on line 1' });

    expect(
      screen.getByText('This diagram could not be drawn: Parse error on line 1.'),
    ).toBeTruthy();
    expect(screen.getByText('graph ??')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Show the diagram source'));
    expect(onViewSource).toHaveBeenCalled();
  });
});
