import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeArtifactPreview } from '../src/features/chat/components/SafeArtifactPreview';
import { isRenderableSvg } from '../src/features/chat/components/sandboxedArtifactHtml';

type WebViewProps = {
  source: { html: string };
  javaScriptEnabled?: boolean;
  accessibilityLabel?: string;
  onLoadEnd?: () => void;
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
};

let mounts = 0;
let latest: WebViewProps | undefined;

jest.mock('react-native-webview', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    __esModule: true,
    WebView: (props: WebViewProps) => {
      latest = props;
      useEffect(() => {
        mounts += 1;
      }, []);
      return null;
    },
  };
});

const LOAD_TIMEOUT_MS = 20_000;

beforeEach(() => {
  mounts = 0;
  latest = undefined;
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('a preview with nothing in it', () => {
  it.each(['html', 'svg'] as const)('says so for an empty %s artifact', (kind) => {
    render(<SafeArtifactPreview content={'  \n '} kind={kind} />);

    expect(screen.getByText('Nothing to preview yet.')).toBeTruthy();
    expect(latest).toBeUndefined();
  });

  it('draws the page once content arrives', () => {
    const view = render(<SafeArtifactPreview content="" kind="html" />);

    view.rerender(<SafeArtifactPreview content="<p>hello</p>" kind="html" />);

    expect(screen.queryByText('Nothing to preview yet.')).toBeNull();
    expect(latest?.source.html).toContain('<p>hello</p>');
  });
});

describe('a React artifact', () => {
  const source = 'function App(){return <p>Hi</p>}';

  it('runs scripts in the pinned React document and labels the preview', () => {
    render(<SafeArtifactPreview content={source} kind="react" />);

    expect(latest?.source.html).toContain('react.production.min.js');
    expect(latest?.source.html).toContain('function App(){return <p>Hi</p>}');
    expect(latest?.javaScriptEnabled).toBe(true);
    expect(latest?.accessibilityLabel).toBe('REACT artifact preview');
  });

  it('stops with Retry and View source when the page reports a script error', () => {
    render(<SafeArtifactPreview content={source} kind="react" onViewSource={jest.fn()} />);

    act(() => {
      latest?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ type: 'error', message: 'Unexpected token' }) },
      });
    });

    expect(screen.getByText('This preview stopped with an error.')).toBeTruthy();
    expect(screen.getByText('Unexpected token')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(screen.getByText('View source')).toBeTruthy();
  });

  it('stops with Retry once the load bound passes', () => {
    render(<SafeArtifactPreview content={source} kind="react" />);

    act(() => {
      jest.advanceTimersByTime(LOAD_TIMEOUT_MS);
    });

    expect(screen.getByText('This preview did not finish loading.')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('says so for an empty React artifact', () => {
    render(<SafeArtifactPreview content="  " kind="react" />);

    expect(screen.getByText('Nothing to preview yet.')).toBeTruthy();
  });
});

describe('a malformed SVG', () => {
  it('shows the image error with View source and no Retry', () => {
    const onViewSource = jest.fn();
    render(
      <SafeArtifactPreview
        content='<svg width="10"><rect'
        kind="svg"
        onViewSource={onViewSource}
      />,
    );

    expect(screen.getByText("This image couldn't be rendered.")).toBeTruthy();
    expect(screen.queryByText('Retry')).toBeNull();
    expect(latest).toBeUndefined();
    fireEvent.press(screen.getByText('View source'));
    expect(onViewSource).toHaveBeenCalledTimes(1);
  });

  it('draws a valid SVG', () => {
    render(<SafeArtifactPreview content='<svg viewBox="0 0 1 1"><rect/></svg>' kind="svg" />);

    expect(screen.queryByText("This image couldn't be rendered.")).toBeNull();
    expect(latest?.source.html).toContain('<rect/>');
  });

  it.each([
    ['<svg></svg>', true],
    ['<?xml version="1.0"?>\n<!-- art -->\n<svg viewBox="0 0 1 1"><g/></svg>\n', true],
    ['<svg viewBox="0 0 1 1"/>', true],
    ['<SVG><circle/></SVG>', true],
    ['<svg><g>', false],
    ['<svg viewBox="0 0 1 1"', false],
    ['<svgfoo></svgfoo>', false],
    ['plain words', false],
    ['<svg/><script>x</script>', false],
  ])('classifies %j as renderable: %s', (source, expected) => {
    expect(isRenderableSvg(source)).toBe(expected);
  });
});

describe('a preview that never finishes loading', () => {
  it('stops with a reason, Retry and View source once the bound passes', () => {
    render(<SafeArtifactPreview content="<p>slow</p>" kind="html" onViewSource={jest.fn()} />);

    act(() => {
      jest.advanceTimersByTime(LOAD_TIMEOUT_MS);
    });

    expect(screen.getByText('This preview did not finish loading.')).toBeTruthy();
    expect(screen.queryByText('This preview stopped with an error.')).toBeNull();
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(screen.getByText('View source')).toBeTruthy();
  });

  it('keeps the page when it finishes loading in time', () => {
    render(<SafeArtifactPreview content="<p>quick</p>" kind="html" />);

    act(() => {
      jest.advanceTimersByTime(LOAD_TIMEOUT_MS - 1);
      latest?.onLoadEnd?.();
      jest.advanceTimersByTime(LOAD_TIMEOUT_MS * 2);
    });

    expect(screen.queryByText('This preview did not finish loading.')).toBeNull();
  });

  it('loads again from the start on Retry and gives that load its own bound', () => {
    render(<SafeArtifactPreview content="<p>slow</p>" kind="html" />);
    act(() => {
      jest.advanceTimersByTime(LOAD_TIMEOUT_MS);
    });
    const before = mounts;

    fireEvent.press(screen.getByText('Retry'));

    expect(mounts).toBe(before + 1);
    expect(screen.queryByText('This preview did not finish loading.')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(LOAD_TIMEOUT_MS);
    });
    expect(screen.getByText('This preview did not finish loading.')).toBeTruthy();
  });
});
