/* eslint-disable @typescript-eslint/no-require-imports */

type WebViewProps = {
  source: { html: string };
  style?: unknown;
  scrollEnabled?: boolean;
  bounces?: boolean;
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
  onContentProcessDidTerminate?: () => void;
  onRenderProcessGone?: () => void;
};

const mockWebViews: WebViewProps[] = [];
let mockMounts = 0;

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  const { useEffect } = require('react');
  return {
    __esModule: true,
    WebView: (props: WebViewProps) => {
      mockWebViews.push(props);
      useEffect(() => {
        mockMounts += 1;
      }, []);
      return require('react').createElement(View, { testID: 'diagram-webview' });
    },
  };
});

jest.mock('../src/features/chat/components/mermaidRuntime', () => ({
  loadMermaidRuntime: () => Promise.resolve('window.mermaid = {};'),
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
import { StyleSheet, Text } from 'react-native';
import { getColors } from '../src/ui/theme/tokens';
import { MermaidDiagramBlock } from '../src/features/chat/components/MermaidDiagramBlock';
import { MermaidDiagramView } from '../src/features/chat/components/MermaidDiagramView';
import { SafeArtifactPreview } from '../src/features/chat/components/SafeArtifactPreview';

const FLOW = 'graph LR\n  A[Start] --> B[Finish]';

function latest(): WebViewProps {
  return mockWebViews[mockWebViews.length - 1]!;
}

function post(message: object) {
  act(() => latest().onMessage?.({ nativeEvent: { data: JSON.stringify(message) } }));
}

async function mounted() {
  await waitFor(() => expect(mockWebViews.length).toBeGreaterThan(0));
}

beforeEach(() => {
  mockWebViews.length = 0;
  mockMounts = 0;
  mockTheme.isDark = false;
  mockTheme.colors = getColors('light', 'light', false);
});

describe('a diagram wider than its frame', () => {
  function renderBlock(source: string) {
    return render(
      <MermaidDiagramBlock
        source={source}
        colors={mockTheme.colors as never}
        sourceBlock={<Text>source card</Text>}
      />,
    );
  }

  function frame(width: number) {
    fireEvent(screen.getByLabelText('Expand diagram').parent!.parent!.parent!, 'layout', {
      nativeEvent: { layout: { width, height: 300, x: 0, y: 0 } },
    });
  }

  it('scrolls sideways inline once the drawing reports a width beyond the frame', async () => {
    renderBlock('graph LR\n  Wide --> Diagram');
    await mounted();
    frame(342);
    expect(screen.getByTestId('mermaid-diagram-scroll').props.scrollEnabled).toBe(false);

    post({ type: 'rendered', height: 120, width: 900, svg: '<svg></svg>' });

    expect(screen.getByTestId('mermaid-diagram-scroll').props.scrollEnabled).toBe(true);
    expect(StyleSheet.flatten(latest().style as never)).toMatchObject({ width: 900 });
    expect(latest().scrollEnabled).toBe(false);
  });

  it('keeps a diagram that fits as a still picture', async () => {
    renderBlock('graph LR\n  Narrow --> Diagram');
    await mounted();
    frame(342);

    post({ type: 'rendered', height: 120, width: 300, svg: '<svg></svg>' });

    expect(latest().scrollEnabled).toBe(false);
  });

  it('leaves the vertical scroll to the chat list', async () => {
    renderBlock('graph LR\n  Bounce --> Diagram');
    await mounted();

    expect(latest().bounces).toBe(false);
  });

  it('explains a diagram that loads content from another site and keeps its source', async () => {
    renderBlock('graph LR\n  Remote --> Image');
    await mounted();

    post({ type: 'failed', reason: 'it loads content from another site' });

    expect(
      screen.getByText(
        'This diagram could not be drawn: it loads content from another site. Its source is kept below.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('source card')).toBeTruthy();
  });
});

describe('a preview the system reclaimed', () => {
  it('draws the diagram again after the web content process ends', async () => {
    render(<SafeArtifactPreview content={FLOW} kind="mermaid" onDiagramFailed={jest.fn()} />);
    await mounted();
    expect(mockMounts).toBe(1);

    act(() => latest().onContentProcessDidTerminate?.());

    expect(mockMounts).toBe(2);
  });

  it('draws the preview again after the Android render process is gone', async () => {
    render(<SafeArtifactPreview content="<p>hi</p>" kind="html" />);
    expect(mockMounts).toBe(1);

    act(() => latest().onRenderProcessGone?.());

    expect(mockMounts).toBe(2);
  });

  it('says so instead of drawing forever when the system keeps reclaiming a diagram', async () => {
    const onFailed = jest.fn();
    render(<SafeArtifactPreview content={FLOW} kind="mermaid" onDiagramFailed={onFailed} />);
    await mounted();

    for (let reclaimed = 0; reclaimed < 3; reclaimed += 1) {
      act(() => latest().onContentProcessDidTerminate?.());
    }
    expect(onFailed).not.toHaveBeenCalled();
    act(() => latest().onContentProcessDidTerminate?.());

    expect(onFailed).toHaveBeenCalledWith('the system stopped it to free memory');
  });

  it('shows a retry for a preview the system keeps reclaiming', () => {
    render(<SafeArtifactPreview content="<p>hi</p>" kind="html" />);

    for (let reclaimed = 0; reclaimed < 4; reclaimed += 1) {
      act(() => latest().onContentProcessDidTerminate?.());
    }

    expect(screen.getByText('the system stopped it to free memory')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Run the preview again'));
    expect(screen.queryByText('the system stopped it to free memory')).toBeNull();
  });
});

describe('the drawing of a diagram artifact', () => {
  it('hands the drawn svg to the screen that can save it', async () => {
    const onDrawn = jest.fn();
    render(<MermaidDiagramView source={FLOW} onDrawn={onDrawn} />);
    await mounted();

    post({ type: 'rendered', height: 120, width: 300, svg: '<svg id="drawn"></svg>' });

    expect(onDrawn).toHaveBeenLastCalledWith('<svg id="drawn"></svg>');
  });

  it('withdraws the drawing when the page later refuses it', async () => {
    const onDrawn = jest.fn();
    render(<MermaidDiagramView source={FLOW} onDrawn={onDrawn} />);
    await mounted();
    post({ type: 'rendered', height: 120, width: 300, svg: '<svg></svg>' });

    post({ type: 'failed', reason: 'it loads content from another site' });

    expect(onDrawn).toHaveBeenLastCalledWith(null);
    expect(
      screen.getByText('This diagram could not be drawn: it loads content from another site.'),
    ).toBeTruthy();
  });
});

describe('a diagram the page never finishes drawing', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports a failure once the bound passes instead of drawing forever', async () => {
    jest.useFakeTimers();
    const onFailed = jest.fn();
    render(<SafeArtifactPreview content={FLOW} kind="mermaid" onDiagramFailed={onFailed} />);
    await mounted();

    act(() => {
      jest.advanceTimersByTime(19_999);
    });
    expect(onFailed).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(onFailed).toHaveBeenCalledWith('it took too long to load');
  });

  it('stays quiet once the page has answered', async () => {
    jest.useFakeTimers();
    const onFailed = jest.fn();
    render(<SafeArtifactPreview content={FLOW} kind="mermaid" onDiagramFailed={onFailed} />);
    await mounted();
    post({ type: 'rendered', height: 120, width: 300, svg: '<svg></svg>' });

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(onFailed).not.toHaveBeenCalled();
  });
});
