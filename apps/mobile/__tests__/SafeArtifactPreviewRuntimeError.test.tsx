import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeArtifactPreview } from '../src/features/chat/components/SafeArtifactPreview';

type WebViewProps = {
  source: { html: string };
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

function reportError(message: string) {
  act(() => {
    latest?.onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'error', message }) } });
  });
}

describe('SafeArtifactPreview runtime error', () => {
  beforeEach(() => {
    mounts = 0;
    latest = undefined;
  });

  it('shows the error of the version that failed', () => {
    render(<SafeArtifactPreview content="<p>v2</p>" kind="html" />);

    reportError('v2 is broken');

    expect(screen.getByText('This preview stopped with an error.')).toBeTruthy();
    expect(screen.getByText('v2 is broken')).toBeTruthy();
  });

  it('drops that error and previews the new version when a different version is selected', () => {
    const view = render(<SafeArtifactPreview content="<p>v2</p>" kind="html" />);
    reportError('v2 is broken');
    expect(screen.getByText('v2 is broken')).toBeTruthy();

    view.rerender(<SafeArtifactPreview content="<p>v1</p>" kind="html" />);

    expect(screen.queryByText('This preview stopped with an error.')).toBeNull();
    expect(latest?.source.html).toContain('<p>v1</p>');
  });

  it('reports a fresh failure of the newly selected version', () => {
    const view = render(<SafeArtifactPreview content="<p>v2</p>" kind="html" />);
    reportError('v2 is broken');
    view.rerender(<SafeArtifactPreview content="<p>v1</p>" kind="html" />);

    reportError('v1 is broken too');

    expect(screen.getByText('v1 is broken too')).toBeTruthy();
    expect(screen.queryByText('v2 is broken')).toBeNull();
  });

  it('starts a new page for a new version so a late message from the old one is not attributed to it', () => {
    const view = render(<SafeArtifactPreview content="<p>v2</p>" kind="html" />);
    const mountsBefore = mounts;

    view.rerender(<SafeArtifactPreview content="<p>v1</p>" kind="html" />);

    expect(mounts).toBe(mountsBefore + 1);
  });

  it('keeps the error across an unrelated re-render and lets Retry clear it', () => {
    const view = render(<SafeArtifactPreview content="<p>v2</p>" kind="html" />);
    reportError('v2 is broken');

    view.rerender(<SafeArtifactPreview content="<p>v2</p>" kind="html" />);
    expect(screen.getByText('v2 is broken')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Run the preview again'));
    expect(screen.queryByText('v2 is broken')).toBeNull();
  });
});
