import { Linking } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { SafeArtifactPreview } from '../src/features/chat/components/SafeArtifactPreview';

type WebViewProps = {
  originWhitelist?: string[];
  setSupportMultipleWindows?: boolean;
  javaScriptCanOpenWindowsAutomatically?: boolean;
  onShouldStartLoadWithRequest?: (request: { url: string }) => boolean;
};

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

describe('SafeArtifactPreview navigation', () => {
  beforeEach(() => {
    lastProps = undefined;
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each(['html', 'svg', 'mermaid'] as const)(
    'sends every %s request through the policy and blocks page navigation and new windows',
    async (kind) => {
      render(<SafeArtifactPreview content="<p>x</p>" kind={kind} />);
      await waitFor(() => expect(lastProps).toBeDefined());
      expect(lastProps?.originWhitelist).toEqual(['*']);
      expect(lastProps?.setSupportMultipleWindows).toBe(false);
      expect(lastProps?.javaScriptCanOpenWindowsAutomatically).toBe(false);
      for (const url of [
        'https://x',
        'agiworkforce://settings',
        'tel:5551234',
        'sms:5551234',
        'javascript:alert(1)',
      ]) {
        expect(lastProps?.onShouldStartLoadWithRequest?.({ url })).toBe(false);
      }
      expect(Linking.openURL).not.toHaveBeenCalled();
    },
  );
});
