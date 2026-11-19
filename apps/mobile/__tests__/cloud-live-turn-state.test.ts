jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => 'test-token'),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => {
  function MockApiPaywallError(this: { name: string; message: string }, feat: string) {
    this.name = 'ApiPaywallError';
    this.message = `Paywall: ${feat}`;
  }
  MockApiPaywallError.prototype = Object.create(Error.prototype);
  return {
    api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    ApiPaywallError: MockApiPaywallError,
  };
});

jest.mock('../services/streaming', () => ({ streamChat: jest.fn() }));

const mockEnsureCloudSendConsent = jest.fn();
jest.mock('../services/llmGate', () => ({
  ...jest.requireActual('../services/llmGate'),
  ensureCloudSendConsent: (...args: unknown[]) => mockEnsureCloudSendConsent(...args),
}));

const mockUploadWithRetry = jest.fn();
jest.mock('../src/features/chat/upload/uploadAttachment', () => ({
  ...jest.requireActual('../src/features/chat/upload/uploadAttachment'),
  uploadWithRetry: (...args: unknown[]) => mockUploadWithRetry(...args),
}));

jest.mock('../services/remoteChatGate', () => {
  class MockRemoteChatDisabledError extends Error {
    readonly code = 'MOBILE_REMOTE_CHAT_DISABLED';
  }
  return {
    getRemoteChatDisabledReason: jest.fn(() => null),
    RemoteChatDisabledError: MockRemoteChatDisabledError,
  };
});

jest.mock('@agiworkforce/local-llm', () => {
  const actual = jest.requireActual('@agiworkforce/local-llm');
  return {
    ...actual,
    localGenerate: jest.fn(),
    getCapabilities: jest.fn().mockResolvedValue({ tier2Available: true, tier3Available: true }),
  };
});

jest.mock('../storage/installedModels', () => ({
  listInstalledModels: jest.fn().mockResolvedValue([]),
  getInstalledModel: jest.fn().mockResolvedValue(null),
  markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { AppState } from 'react-native';
import { INTERACTIVE_CARD_RESPONSE_PATH } from '@agiworkforce/cloud-contracts';
import { api } from '../services/api';
import { waitFor } from '@testing-library/react-native';
import { INTERACTIVE_CARDS_METADATA_KEY, WEB_SEARCH_CITATION_DELTA_KEY } from '@agiworkforce/types';
import { TIMEOUTS } from '../lib/constants';
import { streamChat, type StreamCallbacks } from '../services/streaming';
import { clearCloudExecutionState, useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import {
  NEW_CHAT_STYLE_KEY,
  isResearchChosenFor,
  useChatViewStore,
} from '../stores/chat/chatViewStore';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';
import { useTierStore } from '../src/features/billing/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { ChatMessage } from '../types/chat';
import { useArtifactStore } from '../src/features/artifacts/store';

const appStateChangeListeners = (AppState.addEventListener as jest.Mock).mock.calls
  .filter(([type]) => type === 'change')
  .map(([, listener]) => listener as (state: string) => void);

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const MODEL = requireMobileCloudModel().id;
const CONV_A = '0190a000-0000-7000-8000-0000000000c1';
const CONV_B = '0190a000-0000-7000-8000-0000000000c2';

const LIVE_CARD = {
  schemaVersion: 1,
  cardId: 'fixture-live-map',
  kind: 'map-search.v1',
  createdAt: '2026-11-14T12:00:00.000Z',
  fallback: { headline: 'Tulip farms', text: 'Map results for tulip farms.' },
  producedBy: { toolCallId: 'fixture-live-map', toolName: 'search_maps' },
  body: {
    title: 'Tulip farms',
    query: 'tulip farms',
    actions: [
      {
        provider: 'google_maps',
        label: 'Open in Google Maps',
        url: 'https://www.google.com/maps/search/?api=1&query=tulip%20farms',
      },
    ],
    view: { latitude: 52.27, longitude: 4.55, zoom: 10, attribution: 'OpenStreetMap contributors' },
    places: [],
  },
};

const LIVE_FILE = {
  files: [
    {
      id: 'asset-live-report',
      file_name: 'tulips.pdf',
      mime_type: 'application/pdf',
      uri: '/api/files/asset-live-report',
      byte_count: 2048,
      kind: 'pdf',
      checksum_sha256: 'b'.repeat(64),
      surface: 'file',
      previewable: true,
    },
  ],
};

function seedCloudConversation(id: string) {
  useChatCloudMessageStore.getState().addCloudConversation({
    id,
    title: `Chat ${id.slice(-2)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    pinned: false,
    model: MODEL,
    executionMode: 'cloud',
  });
}

function assistantIn(conversationId: string): ChatMessage | undefined {
  return (useChatCloudMessageStore.getState().messages[conversationId] ?? []).find(
    (message) => message.role === 'assistant',
  );
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 40));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureCloudSendConsent.mockReset().mockResolvedValue(undefined);
  __resetCloudAccountSessionForTests();
  activateCloudAccount('live-turn-state-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {}, currentConversationId: null });
  useChatExecutionStore.setState({
    error: null,
    failureCode: null,
    paywallError: null,
    providerConsentError: null,
    freeCapacityError: null,
    errorConversationId: null,
    errorRetry: null,
  });
  useTierStore.setState({ tier: 'max', billingTier: 'max' });
  seedCloudConversation(CONV_A);
  seedCloudConversation(CONV_B);
});

afterEach(() => {
  jest.restoreAllMocks();
  clearCloudExecutionState();
});

describe('what an answer gathers while it streams', () => {
  it('shows a cited page, a card and a file before the answer ends, and keeps them on Stop', async () => {
    useChatMessageStore.setState({ currentConversationId: CONV_A });
    mockStreamChat.mockImplementation(
      (_body, callbacks: StreamCallbacks, signal) =>
        new Promise<void>((resolve) => {
          callbacks.onDelta({ content: 'Tulips need a cold winter [1].' });
          callbacks.onDelta({
            [WEB_SEARCH_CITATION_DELTA_KEY]: {
              url: 'https://cited.example.net/tulips',
              title: 'Tulip guide',
            },
          });
          callbacks.onDelta({ x_interactive_card: { card: LIVE_CARD } });
          callbacks.onDelta({ x_generated_files: LIVE_FILE });
          signal?.addEventListener('abort', () => resolve(), { once: true });
        }),
    );

    const send = useChatExecutionStore.getState().sendMessage(CONV_A, 'How do tulips grow?', MODEL);
    await flush();

    const live = assistantIn(CONV_A);
    expect(live?.isStreaming).toBe(true);
    expect(live?.citations).toEqual([
      expect.objectContaining({ url: 'https://cited.example.net/tulips' }),
    ]);
    expect(live?.interactiveCards).toEqual([
      expect.objectContaining({ cardId: 'fixture-live-map' }),
    ]);
    expect(live?.metadata?.generatedFiles).toEqual([
      expect.objectContaining({ id: 'asset-live-report' }),
    ]);

    useChatExecutionStore.getState().stopStreaming();
    await send;

    const stopped = assistantIn(CONV_A);
    expect(stopped?.isStreaming).toBe(false);
    expect(stopped?.citations).toEqual(live?.citations);
    expect(stopped?.interactiveCards).toEqual(live?.interactiveCards);
    expect(stopped?.metadata?.generatedFiles).toEqual(live?.metadata?.generatedFiles);
  });

  it("records the research run's current step while the report is being written", async () => {
    mockStreamChat.mockImplementation(
      (_body, callbacks: StreamCallbacks, signal) =>
        new Promise<void>((resolve) => {
          callbacks.onDelta({
            x_research_status: { phase: 'synthesizing', label: 'Writing report' },
          } as never);
          signal?.addEventListener('abort', () => resolve(), { once: true });
        }),
    );

    const send = useChatExecutionStore.getState().sendMessage(CONV_A, 'Research tulips', MODEL);
    await flush();

    expect(assistantIn(CONV_A)?.metadata?.research).toEqual(
      expect.objectContaining({ phase: 'synthesizing', label: 'Writing report' }),
    );

    useChatMessageStore.setState({ currentConversationId: CONV_A });
    useChatExecutionStore.getState().stopStreaming();
    await send;
  });

  it("keeps a failed answer's own text when another chat is streaming at the same time", async () => {
    const turns = new Map<string, { callbacks: StreamCallbacks; resolve: () => void }>();
    mockStreamChat.mockImplementation(
      (body, callbacks: StreamCallbacks, signal) =>
        new Promise<void>((resolve) => {
          const id = JSON.stringify(body).includes('alpha question') ? CONV_A : CONV_B;
          turns.set(id, { callbacks, resolve });
          callbacks.onDelta({ content: id === CONV_A ? 'Alpha partial' : 'Beta partial' });
          signal?.addEventListener('abort', () => resolve(), { once: true });
        }),
    );

    const first = useChatExecutionStore.getState().sendMessage(CONV_A, 'alpha question', MODEL);
    await flush();
    const second = useChatExecutionStore.getState().sendMessage(CONV_B, 'beta question', MODEL);
    await flush();
    expect(useChatExecutionStore.getState().streamingContent).toBe('Beta partial');

    turns.get(CONV_A)?.callbacks.onError(new Error('connection dropped'));
    turns.get(CONV_A)?.resolve();
    await first;

    expect(assistantIn(CONV_A)?.content).toBe('Alpha partial');
    expect(assistantIn(CONV_B)?.content).toBe('Beta partial');

    useChatMessageStore.setState({ currentConversationId: CONV_B });
    useChatExecutionStore.getState().stopStreaming();
    await second;
  });

  it('settles an answer cut off by the stall check as stopped, not as finished', async () => {
    mockStreamChat.mockImplementation(
      (_body, callbacks: StreamCallbacks, signal) =>
        new Promise<void>((resolve) => {
          callbacks.onDelta({ content: 'Tulips need' });
          signal?.addEventListener('abort', () => resolve(), { once: true });
        }),
    );

    const send = useChatExecutionStore.getState().sendMessage(CONV_A, 'How do tulips grow?', MODEL);
    await flush();
    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + TIMEOUTS.STREAM_STALL + 1_000);

    expect(appStateChangeListeners.length).toBeGreaterThan(0);
    appStateChangeListeners.forEach((listener) => listener('active'));
    await send;

    const settled = assistantIn(CONV_A);
    expect(settled?.isStreaming).toBe(false);
    expect(settled?.content).toBe('Tulips need');
    expect(settled?.metadata?.finishReason).toBe('stopped');
  });
});

describe('trying an answer again', () => {
  it('asks with the skill the question was sent with and drops the replaced answer from the Library', async () => {
    useChatCloudMessageStore.setState((state) => ({
      messages: {
        ...state.messages,
        [CONV_A]: [
          {
            id: 'retry-question',
            role: 'user',
            content: 'Plan my tulip beds',
            createdAt: '2026-11-14T10:00:00.000Z',
            model: MODEL,
            metadata: { sendReplay: { hasSkillInstruction: true, skillName: 'garden-planner' } },
          },
          {
            id: 'retry-answer',
            role: 'assistant',
            content: '',
            createdAt: '2026-11-14T10:00:01.000Z',
            model: MODEL,
            metadata: { streamError: { message: 'Something went wrong. Please try again.' } },
          },
        ],
      },
    }));
    const bodies: Array<Record<string, unknown>> = [];
    mockStreamChat.mockImplementation(async (body, callbacks: StreamCallbacks) => {
      bodies.push(body as unknown as Record<string, unknown>);
      callbacks.onDone();
    });

    useArtifactStore.getState().clearArtifacts();
    useArtifactStore.getState().addArtifacts([
      {
        id: 'artifact-of-replaced-answer',
        messageId: 'retry-answer',
        title: 'Bed plan',
        kind: 'code',
        content: 'rows = 4',
        ageLabel: 'now',
        sourceLabel: 'Chat',
        accentColor: '#000000',
        previewLines: ['rows = 4'],
        provenance: { scope: 'cloud', ownerId: 'live-turn-state-user' },
      },
    ]);
    expect(useArtifactStore.getState().artifacts).toHaveLength(1);

    useChatExecutionStore.getState().retryMessage(CONV_A, 'retry-answer');

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual(expect.objectContaining({ skill_name: 'garden-planner' }));
    await waitFor(() =>
      expect(useArtifactStore.getState().artifacts.map((artifact) => artifact.id)).toEqual([]),
    );
  });

  it('records the tools a skill turn asked for with its question', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDone();
    });

    await useChatExecutionStore
      .getState()
      .sendMessage(CONV_A, 'Make the planting sheet', MODEL, undefined, {
        skillName: 'garden-planner',
        skillTools: { codeExecution: true, officeCreation: false },
      });

    const question = (useChatCloudMessageStore.getState().messages[CONV_A] ?? []).find(
      (message) => message.role === 'user',
    );
    expect(question?.metadata?.['sendReplay']).toEqual({
      hasSkillInstruction: true,
      skillName: 'garden-planner',
      codeExecutionEnabled: true,
    });
  });

  it('asks again with the skill and the tools the question was sent with', async () => {
    useChatCloudMessageStore.setState((state) => ({
      messages: {
        ...state.messages,
        [CONV_A]: [
          {
            id: 'tools-question',
            role: 'user',
            content: 'Make the planting sheet',
            createdAt: '2026-11-14T10:00:00.000Z',
            model: MODEL,
            metadata: {
              sendReplay: {
                hasSkillInstruction: true,
                skillName: 'garden-planner',
                officeCreationEnabled: true,
              },
            },
          },
          {
            id: 'tools-answer',
            role: 'assistant',
            content: '',
            createdAt: '2026-11-14T10:00:01.000Z',
            model: MODEL,
            metadata: { streamError: { message: 'Something went wrong. Please try again.' } },
          },
        ],
      },
    }));
    const realSend = useChatExecutionStore.getState().sendMessage;
    const send = jest.fn(async () => true);
    useChatExecutionStore.setState({ sendMessage: send });

    try {
      useChatExecutionStore.getState().retryMessage(CONV_A, 'tools-answer');

      await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      expect(send).toHaveBeenCalledWith(
        CONV_A,
        'Make the planting sheet',
        MODEL,
        undefined,
        expect.objectContaining({
          skillName: 'garden-planner',
          skillTools: { codeExecution: false, officeCreation: true },
        }),
      );
    } finally {
      useChatExecutionStore.setState({ sendMessage: realSend });
    }
  });
});

describe('the Research chip belongs to the chat it was chosen in', () => {
  beforeEach(() => {
    useChatViewStore.setState({
      styleConversationId: null,
      researchByConversation: {},
      features: { ...useChatViewStore.getState().features, research: false },
    });
  });

  it('moves to the new chat with its first turn and is off for the next new chat', () => {
    const view = useChatViewStore.getState;
    view().bindStyleConversation(NEW_CHAT_STYLE_KEY);
    view().setFeature('research', true);

    view().adoptStyleSelection(NEW_CHAT_STYLE_KEY, CONV_A);
    expect(isResearchChosenFor(view(), CONV_A)).toBe(true);

    view().bindStyleConversation(NEW_CHAT_STYLE_KEY);
    expect(view().features.research).toBe(false);
    expect(isResearchChosenFor(view(), CONV_B)).toBe(false);

    view().bindStyleConversation(CONV_A);
    expect(view().features.research).toBe(true);
  });

  it('is not saved with the other composer choices', () => {
    useChatViewStore.getState().bindStyleConversation(NEW_CHAT_STYLE_KEY);
    useChatViewStore.getState().setFeature('research', true);

    const options = (
      useChatViewStore as unknown as {
        persist: { getOptions: () => { partialize: (state: unknown) => { features: unknown } } };
      }
    ).persist.getOptions();
    expect(options.partialize(useChatViewStore.getState()).features).toEqual(
      expect.objectContaining({ research: false }),
    );
  });
});

describe('answering a card', () => {
  it('posts to the shared card response path and shows the card the server settled', async () => {
    useChatCloudMessageStore.setState((state) => ({
      messages: {
        ...state.messages,
        [CONV_A]: [
          {
            id: 'card-question',
            role: 'user',
            content: 'Where are tulip farms?',
            createdAt: '2026-11-14T10:00:00.000Z',
            model: MODEL,
          },
          {
            id: 'card-answer',
            role: 'assistant',
            content: 'Here are some farms.',
            createdAt: '2026-11-14T10:00:01.000Z',
            model: MODEL,
            metadata: { [INTERACTIVE_CARDS_METADATA_KEY]: [LIVE_CARD] },
          },
        ],
      },
    }));
    const settledCard = { ...LIVE_CARD, body: { ...LIVE_CARD.body, title: 'Tulip farms nearby' } };
    (api.post as jest.Mock).mockResolvedValueOnce({ card: settledCard });

    const answered = await useChatExecutionStore
      .getState()
      .respondToInteractiveCard(CONV_A, 'card-answer', 'fixture-live-map', { kind: 'dismiss' });

    expect(answered).toBe(true);
    expect(api.post).toHaveBeenCalledWith(INTERACTIVE_CARD_RESPONSE_PATH, {
      conversation_id: CONV_A,
      message_id: 'card-answer',
      card_id: 'fixture-live-map',
      response: { kind: 'dismiss' },
    });
    expect(assistantIn(CONV_A)?.interactiveCards).toEqual([
      expect.objectContaining({
        cardId: 'fixture-live-map',
        body: expect.objectContaining({ title: 'Tulip farms nearby' }),
      }),
    ]);
  });
});
