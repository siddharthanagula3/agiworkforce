/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ChatMessage } from '@/types/chat';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.lightColors };
});

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

const mockRenderOptions = jest.fn();
jest.mock('@/src/features/chat/components/MessageContentRenderer', () => {
  const RN = require('react-native');
  const { useAssistantDraftScope } = require('@/src/features/chat/components/AssistantDraftScope');
  function ScopeProbe({ content }: { content: string }) {
    const scope = useAssistantDraftScope();
    return (
      <RN.Text testID="draft-scope">
        {`${content}|${scope?.messageId ?? 'none'}|${scope?.saveFenceEdit ? 'save' : 'no-save'}`}
      </RN.Text>
    );
  }
  return {
    renderMarkdownContent: (content: string, _colors: unknown, options: unknown) => {
      mockRenderOptions(options);
      return content ? [<ScopeProbe key="probe" content={content} />] : [];
    },
  };
});

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const fadeBuilder = { duration: () => ({ springify: () => undefined }) };
  return {
    __esModule: true,
    Easing: { linear: (value: number) => value },
    cancelAnimation: jest.fn(),
    interpolateColor: (_value: number, _input: number[], output: string[]) => output[0],
    useAnimatedProps: (factory: () => unknown) => factory(),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: <T,>(value: T) => ({ value }),
    withRepeat: <T,>(value: T) => value,
    withTiming: <T,>(value: T) => value,
    default: {
      createAnimatedComponent: (component: unknown) => component,
      View: RN.View,
      Text: RN.Text,
    },
    FadeInDown: fadeBuilder,
    useReducedMotion: () => false,
  };
});

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(),
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('react-native-gesture-handler', () => {
  const RN = require('react-native');
  return {
    TapGestureHandler: ({ children }: { children: React.ReactNode }) => (
      <RN.View>{children}</RN.View>
    ),
    State: { ACTIVE: 'ACTIVE' },
  };
});

const mockInteractiveCards = jest.fn();
jest.mock('@/src/features/chat/components/InteractiveCardBlock', () => ({
  InteractiveCardBlock: (props: Record<string, unknown>) => {
    mockInteractiveCards(props);
    return null;
  },
}));
const mockSources = jest.fn();
jest.mock('@/src/features/chat/components/CollapsibleSources', () => ({
  CollapsibleSources: (props: Record<string, unknown>) => {
    mockSources(props);
    return null;
  },
}));
const mockProjectFiles = jest.fn();
jest.mock('@/src/features/chat/components/ProjectFileCitations', () => ({
  ...jest.requireActual('@/src/features/chat/components/ProjectFileCitations'),
  ProjectFileCitations: (props: Record<string, unknown>) => {
    mockProjectFiles(props);
    return null;
  },
}));
const mockPastChats = jest.fn();
jest.mock('@/src/features/chat/components/PastChatCitations', () => ({
  PastChatCitations: (props: Record<string, unknown>) => {
    mockPastChats(props);
    return null;
  },
}));
const mockActivity = jest.fn();
jest.mock('@/src/features/chat/components/AgentActivityTimeline', () => ({
  AgentActivityTimeline: (props: Record<string, unknown>) => {
    mockActivity(props);
    return null;
  },
}));
const mockToolTimeline = jest.fn();
jest.mock('@/src/features/chat/components/ToolCallTimeline', () => ({
  ToolCallDetailsSheet: () => null,
  ToolCallTimeline: (props: Record<string, unknown>) => {
    mockToolTimeline(props);
    return null;
  },
}));
const mockReportSections = jest.fn();
jest.mock('@/src/features/chat/components/research/ResearchReportSections', () => ({
  ResearchReportSections: (props: Record<string, unknown>) => {
    mockReportSections(props);
    return null;
  },
}));
const mockResearchRunCard = jest.fn();
jest.mock('@/src/features/chat/components/research/ResearchRunCard', () => ({
  ResearchRunCard: (props: Record<string, unknown>) => {
    mockResearchRunCard(props);
    return null;
  },
}));
const mockViewer = jest.fn();
jest.mock('@/src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: (props: Record<string, unknown>) => {
    mockViewer(props);
    return null;
  },
}));
const mockGeneratedImage = jest.fn();
jest.mock('@/src/features/chat/components/GeneratedImage', () => ({
  GeneratedImage: (props: Record<string, unknown>) => {
    mockGeneratedImage(props);
    return null;
  },
}));
const mockImageProgress = jest.fn();
jest.mock('@/src/features/chat/components/ImageGenProgress', () => ({
  ImageGenProgress: (props: Record<string, unknown>) => {
    mockImageProgress(props);
    return null;
  },
}));
const mockAuthorizedImage = jest.fn();
jest.mock('@/src/features/image/components/AuthorizedImage', () => ({
  AuthorizedImage: (props: Record<string, unknown>) => {
    mockAuthorizedImage(props);
    return null;
  },
}));
const mockFileViewer = jest.fn();
jest.mock('@/src/features/chat/components/artifact-viewers/FileViewerScreen', () => ({
  FileViewerScreen: (props: Record<string, unknown>) => {
    mockFileViewer(props);
    return null;
  },
}));
const mockStreamingIndicator = jest.fn();
jest.mock('@/src/features/chat/components/StreamingIndicator', () => ({
  StreamingIndicator: (props: Record<string, unknown>) => {
    mockStreamingIndicator(props);
    return null;
  },
}));
const mockThinkingChip = jest.fn();
jest.mock('@/src/features/chat/components/ThinkingChip', () => ({
  ThinkingChip: (props: Record<string, unknown>) => {
    mockThinkingChip(props);
    return null;
  },
}));
jest.mock('@/src/features/chat/components/InlineArtifactCard', () => ({
  InlineArtifactCard: () => null,
}));
jest.mock('@/src/features/chat/components/ArtifactFullScreen', () => ({
  ArtifactFullScreen: () => null,
}));
jest.mock('@/src/features/chat/components/FileExportButton', () => ({
  FileExportButton: () => null,
}));
jest.mock('@/src/features/chat/components/ProvenanceFooter', () => ({
  ProvenanceFooter: () => null,
}));
jest.mock('@/src/features/chat/components/PerformanceChip', () => ({
  PerformanceChip: () => null,
}));

import { applyAgentActivityEvent, type AgentActivityState } from '@agiworkforce/client-runtime';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/cloud-contracts';
import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

const DENIAL = 'The user denied permission to run this tool.';
const CODE_ARGS = { language: 'python', code: 'print(37 * 91)' };
const EMPTY_RESPONSE = {
  code: 'empty_response',
  message: 'The model finished without returning a response.',
  retryable: false,
};

function replay(events: AgentEventEnvelope['event'][]): AgentActivityState {
  let state: AgentActivityState | undefined;
  events.forEach((event, sequence) => {
    state = applyAgentActivityEvent(state, {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: 'session-1',
      turnId: 'turn-1',
      sequence,
      emittedAtMs: 1_000 + sequence * 500,
      event,
    } as AgentEventEnvelope);
  });
  return state!;
}

const asked: AgentEventEnvelope['event'] = {
  type: 'approval-requested',
  approvalId: 'call_0',
  toolCallId: 'call_0',
  name: 'execute_code',
  category: 'code-execution',
  summary: 'Run code',
  input: CODE_ARGS,
};

const pausedForApproval: AgentEventEnvelope['event'][] = [
  { type: 'task-state-changed', taskId: 'task-1', state: 'awaiting_input' },
  { type: 'lifecycle', phase: 'paused' },
];

function declined(isError: boolean): AgentEventEnvelope['event'][] {
  return [
    { type: 'lifecycle', phase: 'started' },
    asked,
    ...pausedForApproval,
    { type: 'lifecycle', phase: 'resumed' },
    { type: 'approval-resolved', approvalId: 'call_0', decision: 'denied' },
    {
      type: 'tool-execution-end',
      toolCallId: 'call_0',
      name: 'execute_code',
      output: DENIAL,
      isError,
      elapsedMs: 0,
    },
  ];
}

const emptyEnding: AgentEventEnvelope['event'][] = [
  { type: 'error', ...EMPTY_RESPONSE },
  { type: 'stop', reason: 'error' },
];

const deniedCodeCall = {
  id: 'id:call_0',
  toolCallId: 'call_0',
  name: 'execute_code',
  status: 'failed' as const,
  requiresApproval: false,
  approvalDecision: 'rejected' as const,
  output: DENIAL,
};

function declinedTurn(agentActivity: AgentActivityState, overrides = {}) {
  return {
    id: 'answer-1',
    conversationId: 'conversation-1',
    role: 'assistant' as const,
    content: '',
    createdAt: '2026-11-15T10:00:00.000Z',
    toolCalls: [deniedCodeCall],
    metadata: { agentActivity },
    ...overrides,
  };
}

describe('a turn the person declined that ended without text', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it.each([
    ['the decided state with nothing after it', replay(declined(false))],
    ['the decided state ending in an empty response', replay([...declined(false), ...emptyEnding])],
    [
      'the older error shape ending in an empty response',
      replay([...declined(true), ...emptyEnding]),
    ],
    [
      'a request asked again under the decided id, rebuilt from storage',
      replay([
        ...declined(false),
        { ...asked, name: 'web_search', category: 'web-search' },
        ...pausedForApproval,
      ]),
    ],
  ])('ends as declined from %s, with the finished row and nothing waiting', (_shape, activity) => {
    render(
      <MessageBubble
        message={declinedTurn(activity, {
          metadata: { agentActivity: activity, streamError: EMPTY_RESPONSE },
        })}
        onRetryMessage={jest.fn()}
      />,
    );

    expect(screen.queryByText(/Waiting for approval/)).toBeNull();
    expect(screen.queryByTestId('stream-failure-notice-text')).toBeNull();
    expect(screen.getByLabelText('Regenerate response')).toBeOnTheScreen();
    expect(screen.getByLabelText(/More message actions/)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Copy')).toBeNull();
    const shown = mockActivity.mock.calls.at(-1)?.[0].activity as AgentActivityState;
    expect(shown.status).toBe('completed');
    expect(shown.entries.some((entry) => entry.kind === 'error')).toBe(false);
  });

  it('ends as declined when another step ran before the decline', () => {
    const activity = replay([
      { type: 'lifecycle', phase: 'started' },
      {
        type: 'tool-execution-start',
        toolCallId: 'call_search',
        name: 'web_search',
        category: 'web-search',
        summary: 'Search the web',
        input: { query: '37 * 91' },
      },
      {
        type: 'tool-execution-end',
        toolCallId: 'call_search',
        name: 'web_search',
        output: 'results',
        isError: false,
        elapsedMs: 20,
      },
      ...declined(false).slice(1),
      ...emptyEnding,
    ]);
    render(
      <MessageBubble
        message={declinedTurn(activity, {
          metadata: { agentActivity: activity, streamError: EMPTY_RESPONSE },
        })}
        onRetryMessage={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('stream-failure-notice-text')).toBeNull();
    expect(screen.queryByText(/Waiting for approval/)).toBeNull();
    expect(screen.getByLabelText('Regenerate response')).toBeOnTheScreen();
    const shown = mockActivity.mock.calls.at(-1)?.[0].activity as AgentActivityState;
    expect(shown.status).toBe('partial');
    expect(shown.entries.some((entry) => entry.kind === 'error')).toBe(false);
  });

  it('leaves a turn with one of two requests decided waiting as it was', () => {
    const activity = replay([
      { type: 'lifecycle', phase: 'started' },
      {
        ...asked,
        approvalId: 'call_a',
        toolCallId: 'call_a',
        name: 'web_search',
        category: 'web-search',
        summary: 'Search the web',
        input: { query: '37 * 91' },
      },
      { ...asked, approvalId: 'call_b', toolCallId: 'call_b' },
      ...pausedForApproval,
    ]);
    render(
      <MessageBubble
        message={declinedTurn(activity, {
          toolCalls: [
            {
              id: 'id:call_a',
              toolCallId: 'call_a',
              name: 'web_search',
              status: 'awaiting-approval',
              requiresApproval: true,
              approvalDecision: 'approved',
              approvalScope: 'approved',
            },
            {
              ...deniedCodeCall,
              id: 'id:call_b',
              toolCallId: 'call_b',
              status: 'awaiting-approval',
              requiresApproval: true,
              approvalDecision: undefined,
              output: undefined,
            },
          ],
        })}
        onRetryMessage={jest.fn()}
      />,
    );

    expect(screen.getByText(/Waiting for approval/)).toBeOnTheScreen();
    const shown = mockActivity.mock.calls.at(-1)?.[0].activity as AgentActivityState;
    expect(shown).toEqual(activity);
    expect(shown.entries.find((entry) => entry.id === 'tool:call_a')).toMatchObject({
      status: 'awaiting-approval',
    });
  });

  it('still waits while a request has no decision', () => {
    const activity = replay([{ type: 'lifecycle', phase: 'started' }, asked, ...pausedForApproval]);
    render(
      <MessageBubble
        message={declinedTurn(activity, {
          toolCalls: [
            {
              ...deniedCodeCall,
              status: 'awaiting-approval',
              requiresApproval: true,
              approvalDecision: undefined,
            },
          ],
        })}
        onRetryMessage={jest.fn()}
      />,
    );
    expect(screen.getByText(/Waiting for approval/)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Regenerate response')).toBeNull();
  });

  it('keeps a real failure after a decline as a failure', () => {
    const rateLimited = { code: 'rate_limited', message: 'Too many requests.', retryable: true };
    const activity = replay([
      ...declined(false),
      { type: 'error', ...rateLimited },
      { type: 'stop', reason: 'error' },
    ]);
    render(
      <MessageBubble
        message={declinedTurn(activity, {
          metadata: { agentActivity: activity, streamError: rateLimited },
        })}
        onRetryMessage={jest.fn()}
      />,
    );
    expect(screen.getByTestId('stream-failure-notice-text')).toBeOnTheScreen();
    expect((mockActivity.mock.calls.at(-1)?.[0].activity as AgentActivityState).status).toBe(
      'failed',
    );
  });
});

describe('a turn the person stopped', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  const stoppedWhilePreparing: AgentActivityState = {
    schemaVersion: 1,
    sessionId: 'session-1',
    turnId: 'turn-1',
    lastSequence: 0,
    status: 'cancelled',
    stopReason: 'cancelled',
    startedAtMs: 1_000,
    updatedAtMs: 8_000,
    completedAtMs: 8_000,
    entries: [
      {
        kind: 'progress',
        id: 'progress:preparing',
        progressId: 'preparing',
        summary: 'Preparing',
        status: 'cancelled',
        startedAtMs: 1_000,
        completedAtMs: 8_000,
      },
    ],
  };

  it('shows only the stopped notice when it stopped before any step', () => {
    render(
      <MessageBubble
        message={{
          id: 'answer-2',
          conversationId: 'conversation-1',
          role: 'assistant',
          content: '',
          createdAt: '2026-11-15T10:00:00.000Z',
          metadata: { agentActivity: stoppedWhilePreparing, finishReason: 'stopped' },
        }}
        onRetryMessage={jest.fn()}
      />,
    );
    expect(screen.getByText('Response stopped.')).toBeOnTheScreen();
    expect(mockActivity).not.toHaveBeenCalled();
  });

  it('offers Try again and no answer actions when nothing was written before the stop', () => {
    const onRetryMessage = jest.fn();
    render(
      <MessageBubble
        message={{
          id: 'answer-4',
          conversationId: 'conversation-1',
          role: 'assistant',
          content: '',
          createdAt: '2026-11-15T10:00:00.000Z',
          metadata: { finishReason: 'stopped' },
        }}
        onRetryMessage={onRetryMessage}
        onContinueMessage={jest.fn()}
      />,
    );

    expect(screen.getByText('Response stopped.')).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText('Regenerate this response'));
    expect(onRetryMessage).toHaveBeenCalledWith('answer-4');
    expect(screen.queryByLabelText('Message actions')).toBeNull();
    expect(screen.queryByLabelText('Regenerate response')).toBeNull();
    expect(screen.queryByTestId('continue-generating')).toBeNull();
  });

  it('still pages back to the earlier answer when a new version was stopped before any text', () => {
    const onSelectVariant = jest.fn();
    render(
      <MessageBubble
        message={{
          id: 'answer-5',
          conversationId: 'conversation-1',
          role: 'assistant',
          content: '',
          createdAt: '2026-11-15T10:00:00.000Z',
          metadata: { finishReason: 'stopped' },
        }}
        onRetryMessage={jest.fn()}
        variant={{ index: 1, total: 2, previousId: 'answer-1', nextId: null }}
        onSelectVariant={onSelectVariant}
      />,
    );

    expect(screen.queryByLabelText('Message actions')).toBeNull();
    expect(screen.getByLabelText('Response 2 of 2')).toBeOnTheScreen();
    expect(screen.getByLabelText('Next response')).toBeDisabled();
    fireEvent.press(screen.getByLabelText('Previous response'));
    expect(onSelectVariant).toHaveBeenCalledWith('answer-1');
  });

  it('draws no pager under a new version while it is being written', () => {
    render(
      <MessageBubble
        message={{
          id: 'answer-6',
          conversationId: 'conversation-1',
          role: 'assistant',
          content: '',
          createdAt: '2026-11-15T10:00:00.000Z',
          isStreaming: true,
        }}
        onRetryMessage={jest.fn()}
        variant={{ index: 1, total: 2, previousId: 'answer-1', nextId: null }}
        onSelectVariant={jest.fn()}
      />,
    );

    expect(screen.queryByLabelText('Previous response')).toBeNull();
    expect(screen.queryByLabelText('Response 2 of 2')).toBeNull();
  });

  it.each(['stopped', 'cancelled', 'canceled'])(
    'keeps the stopped notice and gives the partial answer its actions when the turn says %s',
    (finishReason) => {
      const onRetryMessage = jest.fn();
      render(
        <MessageBubble
          message={{
            id: 'answer-3',
            conversationId: 'conversation-1',
            role: 'assistant',
            content: 'Canals began as irrigation ditches and grew into',
            createdAt: '2026-11-15T10:00:00.000Z',
            metadata: { finishReason },
          }}
          onRetryMessage={onRetryMessage}
          onContinueMessage={jest.fn()}
        />,
      );
      expect(screen.getByText('Response stopped.')).toBeOnTheScreen();
      expect(screen.queryByText('Try again')).toBeNull();
      expect(screen.getByLabelText('Copy')).toBeOnTheScreen();
      expect(screen.getByLabelText('Read aloud')).toBeOnTheScreen();
      fireEvent.press(screen.getByLabelText('Regenerate response'));
      expect(onRetryMessage).toHaveBeenCalledWith('answer-3');
      expect(screen.queryByTestId('continue-generating')).toBeNull();
    },
  );
});

describe('a sent reply that quotes an answer', () => {
  const quoted = [
    '# The History of Canals',
    '',
    'A canal is a deceptively **simple** idea: dig a channel and let water carry the load.',
  ].join('\n');

  it('shows the quote once, as plain text in the pill, above only the words the person wrote', () => {
    const { quotedReplyText } = require('@/src/features/chat/components/QuotedReplyBar');
    render(
      <MessageBubble
        message={{
          id: 'question-2',
          conversationId: 'conversation-1',
          role: 'user',
          content: `> Assistant: ${quotedReplyText(quoted)}\n\nReply with one word: ok`,
          createdAt: '2026-11-15T10:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByTestId('user-message-text')).toHaveTextContent('Reply with one word: ok', {
      exact: true,
    });
    expect(
      screen.getByText(
        'Assistant: The History of Canals A canal is a deceptively simple idea: dig a channel and let water carry the load.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/#|\*\*/)).toBeNull();
    expect(screen.getAllByText(/deceptively/)).toHaveLength(1);
  });
});

describe('a reopened answer whose run was still marked as working', () => {
  const unfinished = replay([
    { type: 'lifecycle', phase: 'started' },
    {
      type: 'tool-execution-start',
      toolCallId: 'call_search',
      name: 'web_search',
      category: 'web-search',
      summary: 'Search the web',
      input: { query: 'tides' },
    },
  ]);
  const answer = {
    id: 'answer-9',
    conversationId: 'conversation-1',
    role: 'assistant' as const,
    content: 'Tides rise twice a day because',
    createdAt: '2026-11-15T10:00:00.000Z',
    metadata: { agentActivity: unfinished },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('shows a run that is no longer live as failed, with no clock and no step still running', () => {
    render(<MessageBubble message={answer} liveRun="ended" />);

    const props = mockActivity.mock.calls.at(-1)?.[0];
    const shown = props.activity as AgentActivityState;
    expect(shown.status).toBe('failed');
    expect(shown.completedAtMs).toBe(unfinished.updatedAtMs);
    expect(props.nowMs).toBeUndefined();
    expect(
      shown.entries.some(
        (entry) =>
          entry.kind === 'tool' && (entry.status === 'running' || entry.status === 'pending'),
      ),
    ).toBe(false);
  });

  it('shows a run on an answer saved as stopped when the app closed as stopped, matching its notice', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    render(
      <MessageBubble
        message={{ ...answer, metadata: { ...answer.metadata, finishReason: 'stopped' } }}
        liveRun="ended"
      />,
    );

    const props = mockActivity.mock.calls.at(-1)?.[0];
    const shown = props.activity as AgentActivityState;
    expect(shown.status).toBe('cancelled');
    expect(shown.completedAtMs).toBe(unfinished.updatedAtMs);
    expect(props.nowMs).toBeUndefined();
    expect(
      shown.entries.some(
        (entry) =>
          entry.kind === 'tool' && (entry.status === 'running' || entry.status === 'failed'),
      ),
    ).toBe(false);
  });

  it('keeps a run the server says is live working', () => {
    render(<MessageBubble message={answer} liveRun="live" />);

    const props = mockActivity.mock.calls.at(-1)?.[0];
    expect((props.activity as AgentActivityState).status).toBe('running');
    expect(props.nowMs).toEqual(expect.any(Number));
    expect(props.statusLabel).toBeUndefined();
    expect(props.statusUnavailable).toBe(false);
  });

  it('says the status is unavailable when the server could not be asked', () => {
    render(<MessageBubble message={answer} liveRun="unknown" />);

    const props = mockActivity.mock.calls.at(-1)?.[0];
    expect((props.activity as AgentActivityState).status).toBe('running');
    expect(props.statusLabel).toBe('Status unavailable');
    expect(props.statusUnavailable).toBe(true);
    expect(props.nowMs).toBeUndefined();
  });

  it('never settles a row that is streaming in this session', () => {
    render(<MessageBubble message={{ ...answer, isStreaming: true }} liveRun="ended" />);

    const shown = mockActivity.mock.calls.at(-1)?.[0].activity as AgentActivityState;
    expect(shown.status).toBe('running');
  });
});
