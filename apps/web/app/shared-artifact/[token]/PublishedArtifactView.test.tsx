import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PublishedArtifactView } from './PublishedArtifactView';

const routerPush = vi.hoisted(() => vi.fn());
const copySharedArtifactToChat = vi.hoisted(() => vi.fn());
const identity = vi.hoisted(() => ({
  loaded: true,
  signedIn: false,
  current: true,
  sessionId: 'session-a',
}));
const artifactUpsert = vi.hoisted(() => vi.fn());
vi.mock('@/features/chat/stores/artifacts-store', () => ({
  useArtifactsStore: { getState: () => ({ upsertArtifact: artifactUpsert }) },
}));
vi.mock('@/lib/identity/useSessionSnapshot', () => ({
  useSessionSnapshot: () => () => {
    if (!identity.loaded || !identity.signedIn || !identity.current) return null;
    const sessionId = identity.sessionId;
    let retired = false;
    return {
      userId: 'account-a',
      sessionId,
      isCurrent: () => {
        if (!identity.current || !identity.signedIn || identity.sessionId !== sessionId)
          retired = true;
        return !retired;
      },
      getToken: async () => 'token-a',
    };
  },
}));
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

vi.mock('@/lib/identity/client', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  useSession: () => ({
    isLoaded: identity.loaded,
    isSignedIn: identity.signedIn,
    userId: identity.signedIn ? 'account-a' : null,
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
    identity.loaded = true;
    identity.signedIn = false;
    identity.current = true;
    identity.sessionId = 'session-a';
    artifactUpsert.mockReset();
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
    expect(screen.getByRole('link', { name: 'Shared conversation' })).toHaveAttribute('href', '/');
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

describe('published copy ownership', () => {
  beforeEach(() => {
    identity.loaded = true;
    identity.signedIn = true;
    identity.current = true;
    identity.sessionId = 'session-a';
    routerPush.mockReset();
    artifactUpsert.mockReset();
    copySharedArtifactToChat.mockReset();
  });

  it('does not redirect while identity is loading or capture is inconsistent', () => {
    identity.loaded = false;
    const view = render(
      <PublishedArtifactView {...BASE} kind="text" content="copy" token={TOKEN} />,
    );
    fireEvent.click(screen.getByTestId('published-artifact-save-copy'));
    identity.loaded = true;
    identity.current = false;
    view.rerender(<PublishedArtifactView {...BASE} kind="text" content="copy" token={TOKEN} />);
    fireEvent.click(screen.getByTestId('published-artifact-save-copy'));
    expect(routerPush).not.toHaveBeenCalled();
    expect(copySharedArtifactToChat).not.toHaveBeenCalled();
  });

  it.each(['source', 'account', 'unmount'])(
    'ignores a late receipt after %s retirement',
    async (retirement) => {
      let resolve!: (value: unknown) => void;
      copySharedArtifactToChat.mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const view = render(
        <PublishedArtifactView {...BASE} kind="text" content="copy" token={TOKEN} />,
      );
      fireEvent.click(screen.getByTestId('published-artifact-save-copy'));
      if (retirement === 'source') {
        view.rerender(
          <PublishedArtifactView {...BASE} kind="text" content="changed" token={TOKEN} />,
        );
        view.rerender(<PublishedArtifactView {...BASE} kind="text" content="copy" token={TOKEN} />);
      } else if (retirement === 'account') identity.current = false;
      else view.unmount();
      await act(async () => {
        resolve({ kind: 'copied', conversationId: 'chat-a', artifact: {} });
      });
      await waitFor(() => expect(copySharedArtifactToChat).toHaveBeenCalledTimes(1));
      expect(routerPush).not.toHaveBeenCalled();
      expect(artifactUpsert).not.toHaveBeenCalled();
    },
  );

  it('publishes a successful current copy and navigates', async () => {
    const artifact = { id: 'artifact-a' };
    copySharedArtifactToChat.mockResolvedValue({
      kind: 'copied',
      conversationId: 'chat-a',
      artifact,
    });
    render(<PublishedArtifactView {...BASE} kind="text" content="copy" token={TOKEN} />);
    fireEvent.click(screen.getByTestId('published-artifact-save-copy'));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/chat/chat-a'));
    expect(artifactUpsert).toHaveBeenCalledWith(artifact);
  });

  it('reports a known chat with an unconfirmed save without redirecting', async () => {
    copySharedArtifactToChat.mockResolvedValue({ kind: 'unconfirmed', conversationId: 'chat-a' });
    render(<PublishedArtifactView {...BASE} kind="text" content="copy" token={TOKEN} />);
    fireEvent.click(screen.getByTestId('published-artifact-save-copy'));
    expect(await screen.findByRole('alert')).toHaveTextContent('A chat was created');
    expect(routerPush).not.toHaveBeenCalled();
    expect(artifactUpsert).not.toHaveBeenCalled();
  });
});

it('keeps a successor busy when an earlier source copy finishes', async () => {
  identity.loaded = true;
  identity.signedIn = true;
  identity.current = true;
  copySharedArtifactToChat.mockReset();
  routerPush.mockReset();
  let resolveEarlier!: (value: unknown) => void;
  let resolveLater!: (value: unknown) => void;
  copySharedArtifactToChat
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolveEarlier = done;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolveLater = done;
        }),
    );
  const view = render(
    <PublishedArtifactView {...BASE} kind="text" content="earlier" token={TOKEN} />,
  );
  fireEvent.click(screen.getByTestId('published-artifact-save-copy'));
  view.rerender(<PublishedArtifactView {...BASE} kind="text" content="later" token={TOKEN} />);
  fireEvent.click(screen.getByTestId('published-artifact-save-copy'));
  fireEvent.click(screen.getByTestId('published-artifact-save-copy'));
  expect(copySharedArtifactToChat).toHaveBeenCalledTimes(2);
  await act(async () => {
    resolveEarlier({ kind: 'unconfirmed', conversationId: 'earlier' });
  });
  expect(screen.getByTestId('published-artifact-save-copy')).toBeDisabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await act(async () => {
    resolveLater({ kind: 'unconfirmed', conversationId: 'later' });
  });
  expect(screen.getByTestId('published-artifact-save-copy')).not.toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('A chat was created');
  expect(routerPush).not.toHaveBeenCalled();
});

it('retires a previous session for the same account and enables a fresh copy', async () => {
  identity.loaded = true;
  identity.signedIn = true;
  identity.current = true;
  identity.sessionId = 'session-a';
  copySharedArtifactToChat.mockReset();
  routerPush.mockReset();
  artifactUpsert.mockReset();
  let resolveEarlier!: (value: unknown) => void;
  let resolveLater!: (value: unknown) => void;
  copySharedArtifactToChat
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolveEarlier = done;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolveLater = done;
        }),
    );
  const props = { ...BASE, kind: 'text' as const, content: 'copy', token: TOKEN };
  const view = render(<PublishedArtifactView {...props} />);
  fireEvent.click(screen.getByTestId('published-artifact-save-copy'));
  expect(screen.getByTestId('published-artifact-save-copy')).toBeDisabled();
  identity.sessionId = 'session-b';
  view.rerender(<PublishedArtifactView {...props} />);
  expect(screen.getByTestId('published-artifact-save-copy')).not.toBeDisabled();
  expect(screen.getByTestId('published-artifact-save-copy')).toHaveTextContent(
    'Save a copy to my chats',
  );
  fireEvent.click(screen.getByTestId('published-artifact-save-copy'));
  expect(copySharedArtifactToChat).toHaveBeenCalledTimes(2);
  await act(async () => {
    resolveEarlier({ kind: 'copied', conversationId: 'earlier', artifact: {} });
  });
  expect(routerPush).not.toHaveBeenCalled();
  expect(artifactUpsert).not.toHaveBeenCalled();
  expect(screen.getByTestId('published-artifact-save-copy')).toBeDisabled();
  await act(async () => {
    resolveLater({ kind: 'copied', conversationId: 'later', artifact: { id: 'later' } });
  });
  expect(routerPush).toHaveBeenCalledWith('/chat/later');
  expect(artifactUpsert).toHaveBeenCalledTimes(1);
});

type ImportedModule0 = typeof import('@/lib/identity/client');
