import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { PublishResult } from '@agiworkforce/artifacts';
import { ArtifactsPanel } from './ArtifactsPanel';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { useStreamingArtifactStore } from '../../stores/streaming-artifact-store';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';
import { usePublishedSitesStore } from '@features/sites/stores/published-sites-store';

type PublishSelection = { content: string; versionIndex: number };
let capturedLink: string | undefined;
let capturedPublish: ((selection: PublishSelection) => Promise<PublishResult>) | undefined;
let capturedAudience:
  | { current: string; memberCount: number | null; onChange: (next: string) => Promise<void> }
  | undefined;

vi.mock('./ArtifactPreview', () => ({
  ArtifactPreview: (props: {
    artifact: { title?: string };
    publishArtifact?: (selection: PublishSelection) => Promise<PublishResult>;
    artifactAudience?: typeof capturedAudience;
    publishedLink?: string;
  }) => {
    capturedLink = props.publishedLink;
    capturedPublish = props.publishArtifact;
    capturedAudience = props.artifactAudience;
    return (
      <div data-testid="artifact-preview" data-has-publish={String(Boolean(props.publishArtifact))}>
        {props.artifact.title}
      </div>
    );
  },
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(async () => 'test-token'),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({
    ...(headers as Record<string, string>),
    'x-csrf-token': 'test-token',
  })),
}));

const CONVERSATION_ID = '3f2b8b7c-1d4e-4a2b-8c9d-0e1f2a3b4c5d';
const MESSAGE_ID = 'msg-publish-test';
const ARTIFACT_ID = 'artifact-publish-test';
const CONTENT = '<h1>Sales dashboard</h1>';

// SECURITY-FIX F3 (CWE-863): publishing now refuses an artifact whose
// originating trust boundary the app cannot establish, so a wiring test has to
// state the boundary it is publishing from.
const MANAGED_TURN: Message = {
  id: MESSAGE_ID,
  role: 'assistant',
  content: 'Sales dashboard',
  createdAt: '2026-08-05T00:00:00.000Z',
  metadata: { privacyMode: 'managed', providerMode: 'ManagedGateway' },
};

function seedArtifact() {
  useArtifactsStore.getState().addArtifactForMessage(
    MESSAGE_ID,
    {
      id: ARTIFACT_ID,
      type: 'html',
      language: 'html',
      title: 'Sales dashboard',
      content: CONTENT,
    },
    CONVERSATION_ID,
  );
}

describe('ArtifactsPanel · publish wiring', () => {
  beforeEach(() => {
    capturedLink = undefined;
    usePublishedSitesStore.setState({ byArtifactId: {}, status: 'ready' });
    capturedPublish = undefined;
    capturedAudience = undefined;
    useArtifactsStore.getState().reset();
    useStreamingArtifactStore.getState().clearStreamingArtifact();
    useChatStore.setState({
      activeConversationId: CONVERSATION_ID,
      messagesByConversation: { [CONVERSATION_ID]: [MANAGED_TURN] },
      messages: [MANAGED_TURN],
    });
    useArtifactsStore.getState().setPanelOpen(true);
    seedArtifact();
    useArtifactsStore.getState().selectArtifact(ARTIFACT_ID);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useChatStore.setState({ messagesByConversation: {}, messages: [] });
  });

  it('injects a publishArtifact prop into the artifact viewer', () => {
    render(<ArtifactsPanel />);
    expect(screen.getByTestId('artifact-preview')).toHaveAttribute('data-has-publish', 'true');
    expect(typeof capturedPublish).toBe('function');
  });

  it('publishes the selected artifact through POST /api/artifacts/publish', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          shareUrl: 'https://agiworkforce.com/shared-artifact/aaaaaaaaaaaaaaaaaaaaaaaa',
          publishedAt: '2026-08-05T00:00:00.000Z',
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ArtifactsPanel />);
    const result = await capturedPublish!({ content: CONTENT, versionIndex: 0 });

    expect(result.kind).toBe('cloud');
    expect(result.shareUrl).toBe(
      'https://agiworkforce.com/shared-artifact/aaaaaaaaaaaaaaaaaaaaaaaa',
    );

    const posts = fetchMock.mock.calls.filter(
      (call) => (call as unknown as [string, RequestInit | undefined])[1]?.method === 'POST',
    );
    expect(posts).toHaveLength(1);
    const [url, init] = posts[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/artifacts/publish');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('test-token');

    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      artifactId: ARTIFACT_ID,
      kind: 'html',
      content: CONTENT,
      conversationId: CONVERSATION_ID,
    });
  });

  it('publishes the version the viewer selected, not the latest content', async () => {
    const OLDER = '<h1>Sales dashboard, first draft</h1>';
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          token: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          shareUrl: 'https://agiworkforce.com/shared-artifact/bbbbbbbbbbbbbbbbbbbbbbbb',
          publishedAt: '2026-08-05T00:00:00.000Z',
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ArtifactsPanel />);
    await capturedPublish!({ content: OLDER, versionIndex: 0 });

    const [, init] = fetchMock.mock.calls.filter(
      (call) => (call as unknown as [string, RequestInit | undefined])[1]?.method === 'POST',
    )[0]! as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.content).toBe(OLDER);
    expect(body.content).not.toBe(CONTENT);
  });

  it('records the publish where the artifact card reads its published state', async () => {
    usePublishedSitesStore.setState({ byArtifactId: {}, status: 'ready' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            token: 'cccccccccccccccccccccccc',
            shareUrl: 'https://agiworkforce.com/shared-artifact/cccccccccccccccccccccccc',
            publishedAt: '2026-08-05T00:00:00.000Z',
            visibility: 'public',
          },
          { status: 201 },
        ),
      ),
    );

    render(<ArtifactsPanel />);
    await capturedPublish!({ content: CONTENT, versionIndex: 0 });

    expect(usePublishedSitesStore.getState().byArtifactId[ARTIFACT_ID]).toEqual({
      token: 'cccccccccccccccccccccccc',
      shareUrl: 'https://agiworkforce.com/shared-artifact/cccccccccccccccccccccccc',
      visibility: 'public',
      sitePath: '/chat/sites/cccccccccccccccccccccccc',
    });
  });

  it('offers the invited audience to a publisher with no workspace', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? Response.json({
            shareUrl: 'https://agiworkforce.com/shared-artifact/eeeeeeeeeeeeeeeeeeeeeeee',
            visibility: 'invited',
          })
        : Response.json({
            artifacts: [
              {
                artifactId: ARTIFACT_ID,
                shareUrl: 'https://agiworkforce.com/shared-artifact/eeeeeeeeeeeeeeeeeeeeeeee',
                visibility: 'public',
              },
            ],
            workspace: null,
          }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ArtifactsPanel />);
    await waitFor(() => expect(capturedAudience?.current).toBe('public'));
    expect(capturedAudience?.memberCount).toBeNull();

    await capturedAudience!.onChange('invited');

    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!;
    expect(patch[0]).toBe('/api/artifacts/publish/eeeeeeeeeeeeeeeeeeeeeeee');
    expect(JSON.parse(String(patch[1]?.body))).toEqual({ visibility: 'invited' });
    await waitFor(() => expect(capturedAudience?.current).toBe('invited'));
  });

  it('surfaces the server error instead of reporting a fake success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: { message: 'Publishing is rate limited' } }, { status: 429 }),
      ),
    );

    render(<ArtifactsPanel />);
    await expect(capturedPublish!({ content: CONTENT, versionIndex: 0 })).rejects.toThrow(
      'Publishing is rate limited',
    );
  });
});

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

const OWNED_URL = 'https://agiworkforce.com/shared-artifact/aaaaaaaaaaaaaaaaaaaaaaaa';

function addSecondArtifact() {
  useArtifactsStore.getState().addArtifactForMessage(MESSAGE_ID, {
    id: 'artifact-b', type: 'html', language: 'html', title: 'B', content: '<p>B</p>',
  }, CONVERSATION_ID);
}

describe('ArtifactsPanel publication ownership', () => {
  beforeEach(() => {
    capturedLink = undefined;
    capturedAudience = undefined;
    useArtifactsStore.getState().reset();
    useStreamingArtifactStore.getState().clearStreamingArtifact();
    usePublishedSitesStore.setState({ byArtifactId: {}, status: 'ready' });
    useChatStore.setState({ activeConversationId: CONVERSATION_ID,
      messagesByConversation: { [CONVERSATION_ID]: [MANAGED_TURN] }, messages: [MANAGED_TURN] });
    seedArtifact();
    addSecondArtifact();
    useArtifactsStore.getState().selectArtifact(ARTIFACT_ID);
    useArtifactsStore.getState().setPanelOpen(true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['switch', 'round trip', 'close', 'unmount'])('attributes a late publish after %s only to A', async (transition) => {
    const post = deferredResponse();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? post.promise : Response.json({ artifacts: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const rendered = render(<ArtifactsPanel />);
    const oldPublish = capturedPublish!;
    const pending = oldPublish({ content: CONTENT, versionIndex: 0 });
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
    await act(async () => {
      if (transition === 'unmount') rendered.unmount();
      else if (transition === 'close') useArtifactsStore.getState().setPanelOpen(false);
      else useArtifactsStore.getState().selectArtifact('artifact-b');
    });
    if (transition === 'round trip') await act(async () => useArtifactsStore.getState().selectArtifact(ARTIFACT_ID));
    if (transition === 'close') await act(async () => useArtifactsStore.getState().setPanelOpen(true));
    await expect(oldPublish({ content: CONTENT, versionIndex: 0 })).rejects.toThrow();
    await act(async () => {
      post.resolve(Response.json({ shareUrl: OWNED_URL, visibility: 'public' }));
      await pending;
    });
    expect(usePublishedSitesStore.getState().byArtifactId[ARTIFACT_ID]?.shareUrl).toBe(OWNED_URL);
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-b']).toBeUndefined();
    if (transition !== 'unmount') expect(capturedLink).toBeUndefined();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('does not let a stale GET replace a successful same-token publish snapshot', async () => {
    const get = deferredResponse();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Response.json({ shareUrl: OWNED_URL, visibility: 'invited' })
        : get.promise));
    render(<ArtifactsPanel />);
    await act(async () => { await capturedPublish!({ content: CONTENT, versionIndex: 0 }); });
    await act(async () => {
      get.resolve(Response.json({ artifacts: [{ artifactId: ARTIFACT_ID, shareUrl: OWNED_URL, visibility: 'public' }] }));
    });
    expect(capturedAudience?.current).toBe('invited');
    expect(usePublishedSitesStore.getState().byArtifactId[ARTIFACT_ID]?.visibility).toBe('invited');
  });

  it('refuses duplicate mutation starts and stale same-token audience callbacks', async () => {
    const post = deferredResponse();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
      ? post.promise
      : Response.json({ artifacts: [{ artifactId: ARTIFACT_ID, shareUrl: OWNED_URL, visibility: 'public' }] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ArtifactsPanel />);
    await waitFor(() => expect(capturedAudience).toBeDefined());
    const oldAudience = capturedAudience!;
    const publish = capturedPublish!;
    const pending = publish({ content: CONTENT, versionIndex: 0 });
    await expect(publish({ content: CONTENT, versionIndex: 0 })).rejects.toThrow();
    await expect(oldAudience.onChange('invited')).rejects.toThrow();
    await act(async () => { post.resolve(Response.json({ shareUrl: OWNED_URL, visibility: 'public' })); await pending; });
    await expect(oldAudience.onChange('invited')).rejects.toThrow();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  });

  it('records an audience response under A after switching to B', async () => {
    const patch = deferredResponse();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'PATCH'
      ? patch.promise
      : Response.json({ artifacts: [{ artifactId: ARTIFACT_ID, shareUrl: OWNED_URL, visibility: 'public' }] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ArtifactsPanel />);
    await waitFor(() => expect(capturedAudience).toBeDefined());
    const oldAudience = capturedAudience!;
    const pending = oldAudience.onChange('invited');
    await act(async () => useArtifactsStore.getState().selectArtifact('artifact-b'));
    expect(capturedLink).toBeUndefined();
    expect(capturedAudience).toBeUndefined();
    await act(async () => { patch.resolve(Response.json({ shareUrl: OWNED_URL, visibility: 'invited' })); await pending; });
    expect(capturedLink).toBeUndefined();
    expect(usePublishedSitesStore.getState().byArtifactId[ARTIFACT_ID]?.visibility).toBe('invited');
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-b']).toBeUndefined();
    await expect(oldAudience.onChange('public')).rejects.toThrow();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
  });
  it('reloads publication controls when A reopens before its old publish settles', async () => {
    const post = deferredResponse();
    let published = false;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
      ? post.promise
      : Response.json({ artifacts: published ? [{ artifactId: ARTIFACT_ID, shareUrl: OWNED_URL, visibility: 'public' }] : [] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ArtifactsPanel />);
    const pending = capturedPublish!({ content: CONTENT, versionIndex: 0 });
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
    await act(async () => useArtifactsStore.getState().setPanelOpen(false));
    await act(async () => useArtifactsStore.getState().setPanelOpen(true));
    expect(capturedLink).toBeUndefined();
    await act(async () => {
      published = true;
      post.resolve(Response.json({ shareUrl: OWNED_URL, visibility: 'public' }));
      await pending;
    });
    await waitFor(() => expect(capturedLink).toBe(OWNED_URL));
    expect(capturedAudience?.current).toBe('public');
  });

  it('refuses a captured publish start while streaming replaces the selected viewer', async () => {
    const fetchMock = vi.fn(async () => Response.json({ artifacts: [] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ArtifactsPanel />);
    const oldPublish = capturedPublish!;
    await act(async () => {
      useStreamingArtifactStore.getState().setStreamingArtifact({ artifactId: 'streaming-new',
        messageId: MESSAGE_ID, conversationId: CONVERSATION_ID, type: 'html', language: 'html',
        title: 'Streaming', content: '<p>partial</p>' });
      useArtifactsStore.getState().selectArtifact('streaming-new');
    });
    expect(screen.queryByTestId('artifact-preview')).not.toBeInTheDocument();
    await expect(oldPublish({ content: CONTENT, versionIndex: 0 })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'POST' }));
  });

  it.each(['local', 'unknown'] as const)(
    'invalidates same-artifact publication controls when its origin becomes %s',
    async (origin) => {
      const post = deferredResponse();
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? post.promise
          : Response.json({
              artifacts: [{ artifactId: ARTIFACT_ID, shareUrl: OWNED_URL, visibility: 'public' }],
            }),
      );
      vi.stubGlobal('fetch', fetchMock);
      useChatStore.setState({ conversations: [] });
      render(<ArtifactsPanel />);
      await waitFor(() => expect(capturedAudience?.current).toBe('public'));
      expect(capturedLink).toBe(OWNED_URL);
      const oldPublish = capturedPublish!;
      const oldAudience = capturedAudience!;
      const pending = oldPublish({ content: CONTENT, versionIndex: 0 });
      await waitFor(() =>
        expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1),
      );

      const changedTurn: Message = {
        ...MANAGED_TURN,
        metadata: origin === 'local' ? { privacyMode: 'local', providerMode: 'Local' } : {},
      };
      act(() => {
        useChatStore.setState({
          messagesByConversation: { [CONVERSATION_ID]: [changedTurn] },
          messages: [changedTurn],
        });
      });
      expect(useArtifactsStore.getState().selectedArtifactId).toBe(ARTIFACT_ID);
      expect(screen.getByTestId('artifact-preview')).toHaveTextContent('Sales dashboard');
      expect(capturedLink).toBeUndefined();
      expect(capturedAudience).toBeUndefined();
      await expect(oldPublish({ content: CONTENT, versionIndex: 0 })).rejects.toThrow();
      await expect(oldAudience.onChange('invited')).rejects.toThrow();

      await act(async () => {
        post.resolve(Response.json({ shareUrl: OWNED_URL, visibility: 'public' }));
        await pending;
      });
      expect(capturedLink).toBeUndefined();
      expect(capturedAudience).toBeUndefined();
      expect(usePublishedSitesStore.getState().byArtifactId[ARTIFACT_ID]?.shareUrl).toBe(OWNED_URL);
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-b']).toBeUndefined();
      await expect(oldPublish({ content: CONTENT, versionIndex: 0 })).rejects.toThrow();
      await expect(oldAudience.onChange('invited')).rejects.toThrow();
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
    },
  );

});
