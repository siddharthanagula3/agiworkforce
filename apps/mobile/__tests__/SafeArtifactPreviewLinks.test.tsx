import { Alert, Linking, type AlertButton } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { SafeArtifactPreview } from '../src/features/chat/components/SafeArtifactPreview';

type NavigationRequest = { url: string; navigationType?: string; isTopFrame?: boolean };
type WebViewProps = { onShouldStartLoadWithRequest?: (request: NavigationRequest) => boolean };

let lastProps: WebViewProps | undefined;

jest.mock('../src/features/chat/components/mermaidRuntime', () => ({
  loadMermaidRuntime: () => Promise.resolve('window.mermaid = {};'),
}));

jest.mock('react-native-webview', () => ({
  __esModule: true,
  WebView: (props: WebViewProps) => {
    lastProps = props;
    return null;
  },
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));

const PAGE = '<a href="https://example.com">Visit example.com</a>';

async function renderedPreview(): Promise<(request: NavigationRequest) => boolean> {
  render(<SafeArtifactPreview content={PAGE} kind="html" />);
  await waitFor(() => expect(lastProps?.onShouldStartLoadWithRequest).toBeDefined());
  return lastProps!.onShouldStartLoadWithRequest!;
}

let clock = 1_000_000;

function later(): void {
  clock += 5_000;
}

function pressAlertButton(call: number, text: string): void {
  const buttons = (jest.mocked(Alert.alert).mock.calls[call]?.[2] ?? []) as AlertButton[];
  buttons.find((button) => button.text === text)?.onPress?.();
}

describe('SafeArtifactPreview links', () => {
  beforeEach(() => {
    lastProps = undefined;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    jest.mocked(WebBrowser.openBrowserAsync).mockClear();
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps the preview in place and offers a tapped web link in the in-app browser', async () => {
    const navigate = await renderedPreview();

    expect(
      navigate({ url: 'https://example.com/', navigationType: 'click', isTopFrame: true }),
    ).toBe(false);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(Alert.alert).mock.calls[0]![0]).toBe('Open link?');
    expect(jest.mocked(Alert.alert).mock.calls[0]![1]).toBe('https://example.com/');
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();

    pressAlertButton(0, 'Open');
    await waitFor(() =>
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
        'https://example.com/',
        expect.anything(),
      ),
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('offers a link on Android, where every request reports navigation type other', async () => {
    const navigate = await renderedPreview();

    expect(navigate({ url: 'https://example.com/', navigationType: 'other' })).toBe(false);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it.each([
    'javascript:alert(1)',
    'agiworkforce://settings',
    'file:///etc/passwd',
    'data:text/html,<p>hi</p>',
    'blob:null/3b1d1e8e',
  ])('never offers or opens %s', async (url) => {
    const navigate = await renderedPreview();

    expect(navigate({ url, navigationType: 'click', isTopFrame: true })).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('never offers a page that a frame inside the preview loads', async () => {
    const navigate = await renderedPreview();

    expect(
      navigate({ url: 'https://example.com/embed', navigationType: 'other', isTopFrame: false }),
    ).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('asks before a phone link and opens nothing on its own', async () => {
    const navigate = await renderedPreview();

    expect(navigate({ url: 'tel:5551234', navigationType: 'click', isTopFrame: true })).toBe(false);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('asks once at a time', async () => {
    const navigate = await renderedPreview();

    navigate({ url: 'https://example.com/a', navigationType: 'other' });
    navigate({ url: 'https://example.com/b', navigationType: 'other' });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it('offers a later link after the person declines one', async () => {
    const navigate = await renderedPreview();

    navigate({ url: 'https://example.com/a', navigationType: 'click', isTopFrame: true });
    pressAlertButton(0, 'Cancel');
    later();
    navigate({ url: 'https://example.com/c', navigationType: 'click', isTopFrame: true });
    expect(Alert.alert).toHaveBeenCalledTimes(2);

    pressAlertButton(1, 'Open');
    await waitFor(() =>
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
        'https://example.com/c',
        expect.anything(),
      ),
    );
  });

  it('ignores a request that comes straight after a prompt closes', async () => {
    const navigate = await renderedPreview();

    navigate({ url: 'https://example.com/a', navigationType: 'other' });
    pressAlertButton(0, 'Cancel');
    navigate({ url: 'https://example.com/b', navigationType: 'other' });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it('stops offering links once the person has declined several', async () => {
    const navigate = await renderedPreview();

    for (let call = 0; call < 3; call += 1) {
      navigate({ url: `https://example.com/${call}`, navigationType: 'click', isTopFrame: true });
      pressAlertButton(call, 'Cancel');
      later();
    }
    expect(Alert.alert).toHaveBeenCalledTimes(3);

    navigate({ url: 'https://example.com/last', navigationType: 'click', isTopFrame: true });
    expect(Alert.alert).toHaveBeenCalledTimes(3);
  });

  it('offers a web link after a phone link was offered', async () => {
    const navigate = await renderedPreview();

    navigate({ url: 'mailto:hello@example.com', navigationType: 'click', isTopFrame: true });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    later();
    navigate({ url: 'https://example.com/', navigationType: 'click', isTopFrame: true });
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    expect(jest.mocked(Alert.alert).mock.calls[1]![0]).toBe('Open link?');
  });

  it('offers links again when an Android prompt goes away without a choice', async () => {
    const navigate = await renderedPreview();

    navigate({ url: 'https://example.com/a', navigationType: 'other' });
    const options = jest.mocked(Alert.alert).mock.calls[0]![3];
    options?.onDismiss?.();
    later();
    navigate({ url: 'https://example.com/b', navigationType: 'other' });
    expect(Alert.alert).toHaveBeenCalledTimes(2);
  });

  it('lets a link to a section of the same page scroll the preview', async () => {
    const navigate = await renderedPreview();

    expect(
      navigate({ url: 'about:blank#pricing', navigationType: 'click', isTopFrame: true }),
    ).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
