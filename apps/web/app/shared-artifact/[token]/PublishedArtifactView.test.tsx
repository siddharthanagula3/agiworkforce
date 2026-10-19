import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PublishedArtifactView } from './PublishedArtifactView';

const routerPush = vi.hoisted(() => vi.fn());
const copySharedArtifactToChat = vi.hoisted(() => vi.fn());
const runtimeState = vi.hoisted(() => ({ signInNeeded: false, granted: [] as string[][] }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }));

vi.mock('@/features/chat/lib/copy-shared-artifact', () => ({ copySharedArtifactToChat }));

vi.mock('./usePublishedArtifactRuntime', () => ({
  usePublishedArtifactRuntime: () => ({
    host: undefined,
    signInNeeded: runtimeState.signInNeeded,
    askingForAi: null,
    answerAiRequest: vi.fn(),
    grantedConnectorSets: runtimeState.granted,
    reviewConnectors: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) =>
      key === 'artifactPublish.sharedWithWorkspace'
        ? 'Shared with your workspace'
        : (fallback ?? key),
  }),
}));

vi.mock('@/features/chat/components/SandboxedIframe', () => ({
  SandboxedIframe: (props: {
    payload: { kind: string };
    fallbackSrcDoc: string;
    title: string;
    onRenderError?: (error: string) => void;
    refreshKey?: number;
  }) => (
    <>
      <div
        data-testid="sandboxed-frame"
        data-refresh={props.refreshKey ?? 0}
        data-kind={props.payload.kind}
        data-fallback={props.fallbackSrcDoc}
      />
      <button
        type="button"
        onClick={() => props.onRenderError?.('HTTP 500: SELECT secret FROM users 0xdeadbeef')}
      >
        Report render error
      </button>
    </>
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/identity/client', () => ({
  useSession: () => ({
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    getToken: async () => null,
  }),
}));

vi.mock('@agiworkforce/unified-chat', () => ({
  MarkdownContent: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}));

const BASE = {
  title: 'Published thing',
  language: null,
  publishedAt: '2026-08-05T00:00:00.000Z',
};

const TOKEN = 'tok_shared';

describe('PublishedArtifactView', () => {
  beforeEach(() => {
    routerPush.mockReset();
    copySharedArtifactToChat.mockReset();
    runtimeState.signInNeeded = false;
    runtimeState.granted = [];
  });

  it('starts a signed-out visitor who saves a copy on sign-up and brings them back', async () => {
    copySharedArtifactToChat.mockResolvedValue({ kind: 'sign-in' });
    render(<PublishedArtifactView {...BASE} kind="markdown" content="# Title" token={TOKEN} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save a copy to my chats' }));

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith(`/signup?redirectTo=%2Fshared-artifact%2F${TOKEN}`),
    );
  });

  it('offers an account beside sign-in when the app needs AI, as Claude asks a viewer to sign up', () => {
    runtimeState.signInNeeded = true;
    render(<PublishedArtifactView {...BASE} kind="html" content="<h1>hi</h1>" token={TOKEN} />);

    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      `/signup?redirectTo=%2Fshared-artifact%2F${TOKEN}`,
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      `/login?redirectTo=%2Fshared-artifact%2F${TOKEN}`,
    );
  });

  it('offers a way into the product from the provenance line', () => {
    render(<PublishedArtifactView {...BASE} kind="markdown" content="# Title" />);
    expect(screen.getByRole('link', { name: 'Shared from AGI' })).toHaveAttribute('href', '/');
  });

  it('sends a workspace-shared artifact back to the app rather than the marketing home', () => {
    render(
      <PublishedArtifactView {...BASE} kind="markdown" content="# Title" audience="organization" />,
    );
    expect(screen.getByRole('link', { name: 'Shared with your workspace' })).toHaveAttribute(
      'href',
      '/chat',
    );
  });

  it('serves html through the sandbox frame, never inline', () => {
    render(
      <PublishedArtifactView
        {...BASE}
        kind="html"
        content='<h1 id="marker">hi</h1><script>window.__pwned = 1</script>'
      />,
    );
    const frame = screen.getByTestId('sandboxed-frame');
    expect(frame).toHaveAttribute('data-kind', 'html');
    expect(document.getElementById('marker')).toBeNull();
    expect(document.querySelector('main script')).toBeNull();
  });

  it('serves react through the sandbox frame', () => {
    render(
      <PublishedArtifactView {...BASE} kind="react" content="const App = () => <div>hi</div>;" />,
    );
    expect(screen.getByTestId('sandboxed-frame')).toHaveAttribute('data-kind', 'react');
  });

  it('does not expose sandbox diagnostics on the public page', () => {
    render(<PublishedArtifactView {...BASE} kind="html" content="<h1>hi</h1>" />);

    fireEvent.click(screen.getByRole('button', { name: 'Report render error' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/could not be rendered/i);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/HTTP|SELECT|deadbeef/i);
  });

  it('serves mermaid through the sandbox frame rather than running the parser here', () => {
    render(<PublishedArtifactView {...BASE} kind="mermaid" content="graph TD; A-->B;" />);
    expect(screen.getByTestId('sandboxed-frame')).toHaveAttribute('data-kind', 'mermaid');
  });

  it('renders svg as an inert image, not as injected markup', () => {
    render(
      <PublishedArtifactView
        {...BASE}
        kind="svg"
        content='<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect /></svg>'
      />,
    );
    expect(screen.queryByTestId('sandboxed-frame')).not.toBeInTheDocument();
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml;/);
    expect(decodeURIComponent(img.getAttribute('src') ?? '')).not.toContain('alert(1)');
    expect(document.querySelector('main svg')).toBeNull();
  });

  it('renders markdown through the sanitising markdown chain, with no frame', () => {
    render(<PublishedArtifactView {...BASE} kind="markdown" content="# Title" />);
    expect(screen.queryByTestId('sandboxed-frame')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown')).toHaveTextContent('# Title');
  });

  it('renders code as escaped text, so published source cannot become markup', () => {
    render(
      <PublishedArtifactView
        {...BASE}
        kind="code"
        language="js"
        content='<img src=x onerror="alert(1)">'
      />,
    );
    expect(screen.queryByTestId('sandboxed-frame')).not.toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(document.querySelector('main img')).toBeNull();
  });

  it('falls back to a readable heading when the artifact has no title', () => {
    render(<PublishedArtifactView {...BASE} title="" kind="code" content="x" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Published artifact');
  });

  it('re-runs an app with connected data to refresh it without regenerating', () => {
    runtimeState.granted = [['google-drive']];
    render(
      <PublishedArtifactView {...BASE} kind="html" content="<main>Report</main>" token={TOKEN} />,
    );
    expect(screen.getByTestId('sandboxed-frame')).toHaveAttribute('data-refresh', '0');
    fireEvent.click(screen.getByTestId('artifact-runtime-refresh-data'));
    expect(screen.getByTestId('sandboxed-frame')).toHaveAttribute('data-refresh', '1');
  });

  it('offers no data refresh to an app without connected data', () => {
    render(
      <PublishedArtifactView {...BASE} kind="html" content="<main>Plain</main>" token={TOKEN} />,
    );
    expect(screen.queryByTestId('artifact-runtime-refresh-data')).toBeNull();
  });
});
