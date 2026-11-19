/* eslint-disable @typescript-eslint/no-require-imports */
const mockInject = jest.fn();
const mockGetInfo = jest.fn();
const mockReadChunk = jest.fn();

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({
      injectJavaScript: (script: string) => mockInject(script),
    }));
    return <View {...props} />;
  });
  return { __esModule: true, WebView, default: WebView };
});
jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  getInfoAsync: (...args: unknown[]) => mockGetInfo(...args),
  readAsStringAsync: (...args: unknown[]) => mockReadChunk(...args),
}));
jest.mock('../pdfViewerHtml', () => ({ PDF_VIEWER_HTML: '<html></html>' }));

import { act, render, screen } from '@testing-library/react-native';
import { PdfFileView } from '../PdfFileView';
import { PDF_VIEWER_CHUNK_BYTES, PDF_VIEWER_SILENCE_MS } from '../pdfViewerBridge';

const URI = 'file:///cache/viewer-copies/report.pdf';

function post(message: Record<string, unknown>) {
  const frame = screen.getByTestId('pdf-file-frame');
  return act(async () => {
    frame.props.onMessage({ nativeEvent: { data: JSON.stringify(message) } });
  });
}

function startScript(): { size: number; page: number; background: string; border: string } {
  const script = mockInject.mock.calls
    .map(([value]) => value as string)
    .find((value) => value.startsWith('window.pdfViewer.begin('))!;
  return JSON.parse(script.slice('window.pdfViewer.begin('.length, -';true;'.length - 1));
}

function chunkScripts(): string[] {
  return mockInject.mock.calls
    .map(([value]) => value as string)
    .filter((value) => value.startsWith('window.pdfViewer.chunk('));
}

describe('PdfFileView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInfo.mockResolvedValue({ exists: true, size: 600000 });
    mockReadChunk.mockImplementation(
      async (_uri: string, options: { position: number }) => `B64-${options.position}`,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('draws the bundled page with no network, no file access and no way out of it', () => {
    render(<PdfFileView uri={URI} fileName="report.pdf" onFailed={jest.fn()} />);
    const frame = screen.getByTestId('pdf-file-frame');

    expect(frame.props.source).toEqual({ html: '<html></html>' });
    expect(frame.props.javaScriptEnabled).toBe(true);
    expect(frame.props.allowFileAccess).toBe(false);
    expect(frame.props.allowFileAccessFromFileURLs).toBe(false);
    expect(frame.props.allowUniversalAccessFromFileURLs).toBe(false);
    expect(frame.props.domStorageEnabled).toBe(false);
    expect(frame.props.incognito).toBe(true);
    expect(frame.props.setSupportMultipleWindows).toBe(false);
    expect(frame.props.originWhitelist).toEqual(['about:*']);
    expect(frame.props.setBuiltInZoomControls).toBe(true);
    expect(frame.props.accessibilityLabel).toBe('report.pdf');
    expect(frame.props.onShouldStartLoadWithRequest({ url: 'about:blank' })).toBe(true);
    expect(frame.props.onShouldStartLoadWithRequest({ url: 'https://evil.example' })).toBe(false);
    expect(frame.props.onShouldStartLoadWithRequest({ url: URI })).toBe(false);
  });

  it('shows that it is opening until the document is open, then Page n of N', async () => {
    render(<PdfFileView uri={URI} fileName="report.pdf" onFailed={jest.fn()} />);

    expect(screen.getByTestId('pdf-file-loading')).toBeTruthy();
    expect(screen.getByLabelText('Opening report.pdf')).toBeTruthy();
    expect(screen.queryByTestId('pdf-file-page')).toBeNull();

    await post({ type: 'loaded', pages: 4 });
    expect(screen.queryByTestId('pdf-file-loading')).toBeNull();
    expect(screen.getByText('Page 1 of 4')).toBeTruthy();

    await post({ type: 'page', page: 3 });
    expect(screen.getByText('Page 3 of 4')).toBeTruthy();
  });

  it('opens at the page it was asked for, never past the last one', async () => {
    render(<PdfFileView uri={URI} fileName="report.pdf" page={9} onFailed={jest.fn()} />);

    await post({ type: 'loaded', pages: 4 });

    expect(screen.getByText('Page 4 of 4')).toBeTruthy();
  });

  it('tells the page how big the file is, where to open it and which colours to use', async () => {
    render(<PdfFileView uri={URI} fileName="report.pdf" page={5} onFailed={jest.fn()} />);

    await post({ type: 'ready' });

    expect(mockGetInfo).toHaveBeenCalledWith(URI);
    expect(startScript()).toEqual({
      size: 600000,
      page: 5,
      background: expect.any(String),
      border: expect.any(String),
    });
  });

  it('sends the file in order, one chunk after each acknowledgment, and nothing after the last', async () => {
    render(<PdfFileView uri={URI} fileName="report.pdf" onFailed={jest.fn()} />);
    await post({ type: 'ready' });
    expect(chunkScripts()).toEqual([]);

    await post({ type: 'received', bytes: 0 });
    await post({ type: 'received', bytes: PDF_VIEWER_CHUNK_BYTES });
    await post({ type: 'received', bytes: PDF_VIEWER_CHUNK_BYTES * 2 });
    await post({ type: 'received', bytes: 600000 });

    expect(mockReadChunk.mock.calls.map(([, options]) => options)).toEqual([
      { encoding: 'base64', position: 0, length: PDF_VIEWER_CHUNK_BYTES },
      {
        encoding: 'base64',
        position: PDF_VIEWER_CHUNK_BYTES,
        length: PDF_VIEWER_CHUNK_BYTES,
      },
      {
        encoding: 'base64',
        position: PDF_VIEWER_CHUNK_BYTES * 2,
        length: 600000 - PDF_VIEWER_CHUNK_BYTES * 2,
      },
    ]);
    expect(chunkScripts()).toEqual([
      'window.pdfViewer.chunk("B64-0");true;',
      `window.pdfViewer.chunk("B64-${PDF_VIEWER_CHUNK_BYTES}");true;`,
      `window.pdfViewer.chunk("B64-${PDF_VIEWER_CHUNK_BYTES * 2}");true;`,
    ]);
  });

  it.each([
    ['password', 'password'],
    ['invalid', 'invalid'],
    ['error', 'error'],
  ] as const)('passes on a %s failure once and ignores what follows', async (reason, expected) => {
    const onFailed = jest.fn();
    render(<PdfFileView uri={URI} fileName="report.pdf" onFailed={onFailed} />);

    await post({ type: 'failed', reason });
    await post({ type: 'failed', reason: 'error' });
    await post({ type: 'ready' });

    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed).toHaveBeenCalledWith(expected);
    expect(mockGetInfo).not.toHaveBeenCalled();
  });

  it('fails as invalid when the file is empty or gone', async () => {
    const onFailed = jest.fn();
    mockGetInfo.mockResolvedValue({ exists: false });
    render(<PdfFileView uri={URI} fileName="report.pdf" onFailed={onFailed} />);

    await post({ type: 'ready' });

    expect(onFailed).toHaveBeenCalledWith('invalid');
    expect(mockInject).not.toHaveBeenCalled();
  });

  it('fails when the file cannot be read', async () => {
    const onFailed = jest.fn();
    mockReadChunk.mockRejectedValue(new Error('read failed'));
    render(<PdfFileView uri={URI} fileName="report.pdf" onFailed={onFailed} />);
    await post({ type: 'ready' });

    await post({ type: 'received', bytes: 0 });

    expect(onFailed).toHaveBeenCalledWith('error');
    expect(chunkScripts()).toEqual([]);
  });

  it('ignores messages it does not know', async () => {
    const onFailed = jest.fn();
    render(<PdfFileView uri={URI} fileName="report.pdf" onFailed={onFailed} />);
    const frame = screen.getByTestId('pdf-file-frame');

    await act(async () => {
      frame.props.onMessage({ nativeEvent: { data: 'not json' } });
      frame.props.onMessage({ nativeEvent: { data: '{"type":"loaded","pages":-3}' } });
    });

    expect(onFailed).not.toHaveBeenCalled();
    expect(screen.getByTestId('pdf-file-loading')).toBeTruthy();
  });

  it.each(['onError', 'onHttpError', 'onRenderProcessGone'])(
    'fails when the view reports %s',
    (name) => {
      const onFailed = jest.fn();
      render(<PdfFileView uri={URI} fileName="report.pdf" onFailed={onFailed} />);

      act(() => screen.getByTestId('pdf-file-frame').props[name]());

      expect(onFailed).toHaveBeenCalledWith('error');
    },
  );

  it('gives up when the page says nothing, so a blank screen never stays', () => {
    jest.useFakeTimers();
    const onFailed = jest.fn();
    render(<PdfFileView uri={URI} fileName="report.pdf" onFailed={onFailed} />);

    act(() => jest.advanceTimersByTime(PDF_VIEWER_SILENCE_MS - 1));
    expect(onFailed).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));

    expect(onFailed).toHaveBeenCalledWith('error');
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it('keeps waiting while the file goes across, and stops waiting once it is open', async () => {
    jest.useFakeTimers();
    const onFailed = jest.fn();
    render(<PdfFileView uri={URI} fileName="report.pdf" onFailed={onFailed} />);

    act(() => jest.advanceTimersByTime(PDF_VIEWER_SILENCE_MS - 1));
    await post({ type: 'received', bytes: 0 });
    act(() => jest.advanceTimersByTime(PDF_VIEWER_SILENCE_MS - 1));
    expect(onFailed).not.toHaveBeenCalled();

    await post({ type: 'loaded', pages: 2 });
    act(() => jest.advanceTimersByTime(PDF_VIEWER_SILENCE_MS * 4));
    expect(onFailed).not.toHaveBeenCalled();
  });

  it('sends nothing once it has gone away', async () => {
    let finish: (value: { exists: boolean; size: number }) => void = () => {};
    mockGetInfo.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const view = render(<PdfFileView uri={URI} fileName="report.pdf" onFailed={jest.fn()} />);
    const frame = screen.getByTestId('pdf-file-frame');
    await act(async () => {
      frame.props.onMessage({ nativeEvent: { data: '{"type":"ready"}' } });
    });

    view.unmount();
    await act(async () => finish({ exists: true, size: 10 }));

    expect(mockInject).not.toHaveBeenCalled();
  });
});
