jest.mock('../services/authSession', () => ({
  ...jest.requireActual('../services/authSession'),
  getAuthToken: jest.fn(async () => 'test-token'),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('../services/llmGate', () => ({
  ...jest.requireActual('../services/llmGate'),
  ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/streaming', () => ({
  ...jest.requireActual('../services/streaming'),
  streamChat: jest.fn(),
  streamToolApprovalResume: jest.fn(),
}));

jest.mock('../services/remoteChatGate', () => ({
  ...jest.requireActual('../services/remoteChatGate'),
  getRemoteChatDisabledReason: jest.fn(() => null),
}));

jest.mock('../lib/mmkv', () => ({
  ...jest.requireActual('../lib/mmkv'),
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

jest.mock('@/lib/safeOpenURL', () => ({
  ...jest.requireActual('@/lib/safeOpenURL'),
  openUntrustedUrlInAppBrowser: jest.fn(async () => true),
}));

import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { WEB_SEARCH_CITATION_DELTA_KEY } from '@agiworkforce/types';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { colors } from '@/src/ui/theme';
import { renderInlineMarkdown } from '../src/features/chat/components/MarkdownInline';
import {
  streamChat,
  streamToolApprovalResume,
  type StreamCallbacks,
  type StreamDelta,
} from '../services/streaming';
import {
  __resetPendingApprovalTurnsForTests,
  clearCloudExecutionState,
  useChatExecutionStore,
} from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { hydrateStoredCloudMessage } from '../stores/chat/hydrateCloudMessage';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';
import { useTierStore } from '../src/features/billing/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { ChatMessage } from '../types/chat';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockStreamResume = streamToolApprovalResume as jest.MockedFunction<
  typeof streamToolApprovalResume
>;
const MODEL = requireMobileCloudModel().id;
const CONV = '0190a000-0000-7000-8000-0000000000d1';
const RUN_ID = '0190a000-0000-7000-8000-0000000000d2';

const COLD = { url: 'https://cited.example.net/cold', title: 'Cold winters' };
const SPRING = { url: 'https://cited.example.net/spring', title: 'Spring bloom' };

const cite = (page: { url: string; title: string }): StreamDelta => ({
  [WEB_SEARCH_CITATION_DELTA_KEY]: page,
});

function assistant(): ChatMessage | undefined {
  return (useChatCloudMessageStore.getState().messages[CONV] ?? []).find(
    (message) => message.role === 'assistant',
  );
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 40));
}

function heldStream(): { deliver: (delta: StreamDelta) => void; finish: () => void } {
  let callbacks: StreamCallbacks | undefined;
  let resolveStream: (() => void) | undefined;
  mockStreamChat.mockImplementationOnce(
    (_body, streamCallbacks: StreamCallbacks) =>
      new Promise<void>((resolve) => {
        callbacks = streamCallbacks;
        resolveStream = resolve;
      }),
  );
  return {
    deliver: (delta) => callbacks?.onDelta(delta),
    finish: () => {
      callbacks?.onDone();
      resolveStream?.();
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('inline-citations-user');
  __resetPendingApprovalTurnsForTests();
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {}, currentConversationId: CONV });
  useTierStore.setState({ tier: 'max', billingTier: 'max' });
  useChatCloudMessageStore.getState().addCloudConversation({
    id: CONV,
    title: 'Tulips',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    pinned: false,
    model: MODEL,
    executionMode: 'cloud',
  });
});

afterEach(() => {
  clearCloudExecutionState();
});

describe('inline citation markers on a Cloud answer', () => {
  it('marks each sentence a cited page supports as it streams and when it ends', async () => {
    const stream = heldStream();
    const send = useChatExecutionStore.getState().sendMessage(CONV, 'How do tulips grow?', MODEL);
    await flush();

    stream.deliver(cite(COLD));
    stream.deliver({ content: 'Tulips need a cold winter. ' });
    stream.deliver(cite(SPRING));
    stream.deliver({ content: 'They bloom in spr' });

    expect(assistant()?.content).toBe('Tulips need a cold winter.[1] They bloom in spr');

    stream.deliver({ content: 'ing.' });
    stream.finish();
    await send;

    const settled = assistant();
    expect(settled?.isStreaming).toBe(false);
    expect(settled?.content).toBe('Tulips need a cold winter.[1] They bloom in spring.[2]');
    expect(settled?.citations?.map((source) => source.url)).toEqual([COLD.url, SPRING.url]);
  });

  it('waits for the character after a full stop before marking it, so a marker never moves', async () => {
    const stream = heldStream();
    const send = useChatExecutionStore.getState().sendMessage(CONV, 'What does it cost?', MODEL);
    await flush();

    stream.deliver(cite(COLD));
    stream.deliver({ content: 'It costs $3.' });
    expect(assistant()?.content).toBe('It costs $3.');

    stream.deliver({ content: '5 million.' });
    expect(assistant()?.content).toBe('It costs $3.5 million.');

    stream.deliver({ content: ' Prices rose.' });
    expect(assistant()?.content).toBe('It costs $3.5 million.[1] Prices rose.');

    stream.finish();
    await send;
    expect(assistant()?.content).toBe('It costs $3.5 million.[1] Prices rose.');
  });

  it('places a grounded answer at the spans the provider reported, numbered as delivered', async () => {
    const answer = 'Rates held steady. Growth slowed.';
    const stream = heldStream();
    const send = useChatExecutionStore.getState().sendMessage(CONV, 'Any news on rates?', MODEL);
    await flush();

    stream.deliver({ content: answer });
    stream.deliver({
      x_search_results: {
        content: [
          { type: 'web_search_result', ...SPRING },
          { type: 'web_search_result', ...COLD },
        ],
        citation_spans: [
          { endIndex: 18, positions: [2] },
          { endIndex: 33, positions: [1, 2] },
        ],
      },
    });
    stream.finish();
    await send;

    const settled = assistant();
    expect(settled?.citations?.map((source) => source.url)).toEqual([SPRING.url, COLD.url]);
    expect(settled?.content).toBe('Rates held steady.[2] Growth slowed.[1][2]');
  });

  it('leaves an answer without citations exactly as it streamed', async () => {
    const stream = heldStream();
    const send = useChatExecutionStore.getState().sendMessage(CONV, 'Say hello', MODEL);
    await flush();

    stream.deliver({ content: 'Hello there. Nice to meet you.' });
    stream.finish();
    await send;

    expect(assistant()?.content).toBe('Hello there. Nice to meet you.');
  });

  it('reopens with the same markers and a tap on [2] opens the second page', async () => {
    const stream = heldStream();
    const send = useChatExecutionStore.getState().sendMessage(CONV, 'How do tulips grow?', MODEL);
    await flush();
    stream.deliver(cite(COLD));
    stream.deliver({ content: 'Tulips need a cold winter. ' });
    stream.deliver(cite(SPRING));
    stream.deliver({ content: 'They bloom in spring.' });
    stream.finish();
    await send;

    const settled = assistant()!;
    const reopened = hydrateStoredCloudMessage({ ...settled, citations: undefined });

    expect(reopened.content).toBe(settled.content);
    expect(reopened.citations?.map((source) => source.url)).toEqual(
      settled.citations?.map((source) => source.url),
    );

    render(
      <>{renderInlineMarkdown(reopened.content, 'reopened', colors, reopened.citations ?? [])}</>,
    );
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    fireEvent.press(screen.getByRole('link', { name: /Citation 2: Spring bloom/ }));
    const buttons = (alertSpy.mock.calls[0]?.[2] ?? []) as {
      text?: string;
      onPress?: () => void;
    }[];
    expect(alertSpy.mock.calls[0]?.[0]).toBe(SPRING.title);
    buttons.find((button) => button.text === 'Open page')?.onPress?.();
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith(SPRING.url);
    alertSpy.mockRestore();
  });

  it('keeps the markers a paused answer had and marks only what the resumed run adds', async () => {
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onRunReference?.({
        runId: RUN_ID,
        runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
        lastSequence: -1,
      });
      callbacks.onDelta(cite(COLD));
      callbacks.onDelta({ content: 'Tulips need a cold winter. ' });
      callbacks.onDelta({
        x_tool_approval_request: {
          tool_call_id: 'call_garden',
          name: 'mcp__garden__plan_beds',
          args: { beds: 2 },
        },
      });
      callbacks.onDone();
    });
    await useChatExecutionStore.getState().sendMessage(CONV, 'Plan my tulip beds', MODEL);
    const paused = assistant()!;
    expect(paused.content).toBe('Tulips need a cold winter.[1]');

    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta(cite(SPRING));
      callbacks.onDelta({ content: ' They bloom in spring.' });
      callbacks.onDone();
    });
    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV, paused.id, 'call_garden', 'approved');

    expect(assistant()?.content).toBe('Tulips need a cold winter.[1] They bloom in spring.[2]');
    expect(assistant()?.citations?.map((source) => source.url)).toEqual([COLD.url, SPRING.url]);
  });
});
