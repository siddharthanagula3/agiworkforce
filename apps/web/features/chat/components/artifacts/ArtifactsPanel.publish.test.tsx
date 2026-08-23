import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PublishResult } from '@agiworkforce/artifacts';
import { ArtifactsPanel } from './ArtifactsPanel';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { useStreamingArtifactStore } from '../../stores/streaming-artifact-store';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';

let capturedPublish: (() => Promise<PublishResult>) | undefined;

vi.mock('./ArtifactPreview', () => ({
  ArtifactPreview: (props: {
    artifact: { title?: string };
    publishArtifact?: () => Promise<PublishResult>;
  }) => {
    capturedPublish = props.publishArtifact;
    return (
      <div data-testid="artifact-preview" data-has-publish={String(Boolean(props.publishArtifact))}>
        {props.artifact.title}
      </div>
    );
  },
}));

vi.mock('@/lib/client/csrf', () => ({
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
    capturedPublish = undefined;
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
    const result = await capturedPublish!();

    expect(result.kind).toBe('cloud');
    expect(result.shareUrl).toBe(
      'https://agiworkforce.com/shared-artifact/aaaaaaaaaaaaaaaaaaaaaaaa',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
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

  it('surfaces the server error instead of reporting a fake success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: { message: 'Publishing is rate limited' } }, { status: 429 }),
      ),
    );

    render(<ArtifactsPanel />);
    await expect(capturedPublish!()).rejects.toThrow('Publishing is rate limited');
  });
});
