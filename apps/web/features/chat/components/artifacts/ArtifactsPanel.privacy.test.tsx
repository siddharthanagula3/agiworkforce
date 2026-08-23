import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import type { PublishResult } from '@agiworkforce/artifacts';
import { getProviderConfig, getProviderSurface, PROVIDERS_IN_ORDER } from '@agiworkforce/types';
import { ArtifactsPanel, resolveArtifactOriginPrivacyMode } from './ArtifactsPanel';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { useStreamingArtifactStore } from '../../stores/streaming-artifact-store';
import { useChatStore, type Conversation, type Message } from '@shared/stores/web-chat-store';

let capturedPublish: (() => Promise<PublishResult>) | undefined;

vi.mock('./ArtifactPreview', () => ({
  ArtifactPreview: (props: { publishArtifact?: () => Promise<PublishResult> }) => {
    capturedPublish = props.publishArtifact;
    return <div data-testid="artifact-preview" />;
  },
}));

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({
    ...(headers as Record<string, string>),
    'x-csrf-token': 'test-token',
  })),
}));

const CONVERSATION_ID = '9a1c2d3e-4f56-4789-8a9b-0c1d2e3f4a5b';
const MESSAGE_ID = 'msg-privacy-test';
const ARTIFACT_ID = 'artifact-privacy-test';

const LOCAL_MODEL_ID = 'ollama/fixture-local-model';
const MANAGED_MODEL_ID = 'auto';

function requireDirectByokModelId(): string {
  for (const provider of PROVIDERS_IN_ORDER) {
    if (getProviderSurface(provider) !== 'byok') continue;
    if (getProviderConfig(provider)?.label) return `${provider}/fixture-byok-model`;
  }
  throw new Error('Canonical model registry is missing a direct-BYOK provider fixture');
}

const BYOK_MODEL_ID = requireDirectByokModelId();

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    role: 'assistant',
    content: 'here is your artifact',
    createdAt: '2026-08-21T00:00:00.000Z',
    ...overrides,
  };
}

function seedConversation(
  messages: Message[],
  options: { conversationModel?: string; generatedFile?: Record<string, unknown> } = {},
) {
  const conversation: Conversation = {
    id: CONVERSATION_ID,
    title: 'Fixture thread',
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    ...(options.conversationModel ? { model: options.conversationModel } : {}),
  };
  useChatStore.setState({
    activeConversationId: CONVERSATION_ID,
    conversations: [conversation],
    messagesByConversation: { [CONVERSATION_ID]: messages },
    messages,
  });
  useArtifactsStore.getState().addArtifactForMessage(
    MESSAGE_ID,
    {
      id: ARTIFACT_ID,
      type: 'html',
      language: 'html',
      title: 'Private notes',
      content: '<h1>salary review</h1>',
      ...(options.generatedFile ? { generatedFile: options.generatedFile as never } : {}),
    },
    CONVERSATION_ID,
  );
  useArtifactsStore.getState().setPanelOpen(true);
  useArtifactsStore.getState().selectArtifact(ARTIFACT_ID);
}

function managedDescriptor(): Record<string, unknown> {
  return {
    id: ARTIFACT_ID,
    computeSessionId: `generated-${MESSAGE_ID}`,
    ownerUserId: '',
    sourceSurface: 'web',
    privacyMode: 'managed',
    providerMode: 'ManagedGateway',
    kind: 'html',
    fileName: 'notes.html',
    mimeType: 'text/html',
    uri: '/api/files/gf-1',
    byteCount: 24,
    checksumSha256: '',
    previewDerivatives: [],
    createdAt: '2026-08-21T00:00:00.000Z',
  };
}

async function publishAndCaptureFetch() {
  const fetchMock = vi.fn(async () => Response.json({}, { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<ArtifactsPanel />);
  const result = await capturedPublish!();
  return { fetchMock, result };
}

describe('ArtifactsPanel · publish honors the conversation trust boundary', () => {
  beforeEach(() => {
    capturedPublish = undefined;
    useArtifactsStore.getState().reset();
    useStreamingArtifactStore.getState().clearStreamingArtifact();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useChatStore.setState({ messagesByConversation: {}, messages: [], conversations: [] });
  });

  it.each(['byok', 'local'] as const)(
    'never uploads an artifact from a %s-labeled conversation to the managed cloud',
    async (privacyMode) => {
      seedConversation([message(MESSAGE_ID, { metadata: { privacyMode } })]);

      const { fetchMock, result } = await publishAndCaptureFetch();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.kind).toBe('unavailable');
      expect(result.shareUrl).toBeNull();
    },
  );

  // The Local→BYOK handoff is the ONLY writer of metadata.privacyMode in the web
  // app, so an ordinary local-model conversation carries no label anywhere. Its
  // artifacts used to publish straight to the managed cloud.
  it.each([LOCAL_MODEL_ID, BYOK_MODEL_ID])(
    'never uploads an unlabeled artifact from a conversation served by %s',
    async (modelId) => {
      seedConversation([message(MESSAGE_ID, { model: modelId })]);

      const { fetchMock, result } = await publishAndCaptureFetch();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.kind).toBe('unavailable');
    },
  );

  it('never uploads when only the conversation model names the local boundary', async () => {
    seedConversation([message(MESSAGE_ID)], { conversationModel: LOCAL_MODEL_ID });

    const { fetchMock, result } = await publishAndCaptureFetch();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.kind).toBe('unavailable');
  });

  it('never uploads when a turn declares only providerMode', async () => {
    seedConversation([message(MESSAGE_ID, { metadata: { providerMode: 'Local' } })]);

    const { fetchMock, result } = await publishAndCaptureFetch();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.kind).toBe('unavailable');
  });

  // A generated-file descriptor is synthesised client-side from the turn, so its
  // default "managed" label must not be able to launder a local turn's origin.
  it('never uploads when a managed generated-file label contradicts a local turn', async () => {
    seedConversation([message(MESSAGE_ID, { model: LOCAL_MODEL_ID })], {
      generatedFile: managedDescriptor(),
    });

    const { fetchMock, result } = await publishAndCaptureFetch();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.kind).toBe('unavailable');
  });

  it('never uploads an artifact whose origin the app cannot establish at all', async () => {
    seedConversation([message(MESSAGE_ID)]);

    const { fetchMock, result } = await publishAndCaptureFetch();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.kind).toBe('unavailable');
  });

  it('refuses for an unlabeled turn in a conversation that was handed off to BYOK', async () => {
    seedConversation([
      message('msg-handoff', { metadata: { privacyMode: 'byok', providerMode: 'DirectByok' } }),
      message(MESSAGE_ID),
    ]);

    const { fetchMock, result } = await publishAndCaptureFetch();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.kind).toBe('unavailable');
  });

  it.each([
    ['an explicit managed label', { metadata: { privacyMode: 'managed' as const } }],
    ['a managed model', { model: MANAGED_MODEL_ID }],
  ])('still publishes an artifact from a conversation with %s', async (_label, overrides) => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          token: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          shareUrl: 'https://agiworkforce.com/shared-artifact/bbbbbbbbbbbbbbbbbbbbbbbb',
          publishedAt: '2026-08-21T00:00:00.000Z',
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    seedConversation([message(MESSAGE_ID, overrides)]);

    render(<ArtifactsPanel />);
    const result = await capturedPublish!();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe('cloud');
  });
});

describe('resolveArtifactOriginPrivacyMode', () => {
  it('prefers the artifact trust-boundary label over the transcript', () => {
    const mode = resolveArtifactOriginPrivacyMode(
      {
        messageId: MESSAGE_ID,
        artifactManifest: {
          id: 'manifest-1',
          artifactId: ARTIFACT_ID,
          type: 'generated_file_bundle',
          title: 'Private notes',
          computeSessionId: 'session-1',
          generatedFileIds: [ARTIFACT_ID],
          privacyMode: 'local',
          providerMode: 'Local',
          storageScope: 'local_device',
          createdAt: '2026-08-21T00:00:00.000Z',
          updatedAt: '2026-08-21T00:00:00.000Z',
        },
      },
      [message(MESSAGE_ID, { metadata: { privacyMode: 'managed' } })],
    );
    expect(mode).toBe('local');
  });

  it('classifies the boundary from the model when no label exists', () => {
    expect(
      resolveArtifactOriginPrivacyMode({ messageId: MESSAGE_ID }, [
        message(MESSAGE_ID, { model: LOCAL_MODEL_ID }),
      ]),
    ).toBe('local');
    expect(
      resolveArtifactOriginPrivacyMode({ messageId: MESSAGE_ID }, [
        message(MESSAGE_ID, { model: BYOK_MODEL_ID }),
      ]),
    ).toBe('byok');
    expect(
      resolveArtifactOriginPrivacyMode({ messageId: MESSAGE_ID }, [
        message(MESSAGE_ID, { model: MANAGED_MODEL_ID }),
      ]),
    ).toBe('managed');
  });

  it('reads the model recorded in message metadata as well as the top-level field', () => {
    expect(
      resolveArtifactOriginPrivacyMode({ messageId: MESSAGE_ID }, [
        message(MESSAGE_ID, { metadata: { model: LOCAL_MODEL_ID } }),
      ]),
    ).toBe('local');
  });

  it('falls back to the conversation model when no turn carries one', () => {
    expect(
      resolveArtifactOriginPrivacyMode({ messageId: MESSAGE_ID }, [message(MESSAGE_ID)], {
        model: LOCAL_MODEL_ID,
      }),
    ).toBe('local');
  });

  it('reports an unknown origin rather than assuming managed', () => {
    expect(
      resolveArtifactOriginPrivacyMode({ messageId: MESSAGE_ID }, [message(MESSAGE_ID)]),
    ).toBeUndefined();
  });

  it('ignores a synthesised managed descriptor label when the turn says otherwise', () => {
    expect(
      resolveArtifactOriginPrivacyMode(
        { messageId: MESSAGE_ID, generatedFile: managedDescriptor() as never },
        [message(MESSAGE_ID, { model: LOCAL_MODEL_ID })],
      ),
    ).toBe('local');
  });

  it('does not accept a synthesised managed descriptor label as the only origin evidence', () => {
    expect(
      resolveArtifactOriginPrivacyMode(
        { messageId: MESSAGE_ID, generatedFile: managedDescriptor() as never },
        [message(MESSAGE_ID)],
      ),
    ).toBeUndefined();
  });
});
