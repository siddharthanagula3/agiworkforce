/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { insetHasPanelBackground, sitsInColumn } from '../test-utils/sheetColumn';
import { lightColors } from '@/src/ui/theme/tokens';
import type { ChatMessage } from '@/types/chat';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.lightColors,
  };
});

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('@/src/features/chat/components/MessageContentRenderer', () => {
  const RN = require('react-native');
  return {
    renderMarkdownContent: (content: string) => [<RN.Text key="content">{content}</RN.Text>],
  };
});

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const fadeBuilder = {
    duration: () => ({
      springify: () => undefined,
    }),
  };
  return {
    __esModule: true,
    Easing: { linear: (value: number) => value },
    cancelAnimation: jest.fn(),
    useAnimatedProps: (factory: () => unknown) => factory(),
    useSharedValue: <T,>(value: T) => ({ value }),
    withRepeat: <T,>(value: T) => value,
    withTiming: <T,>(value: T) => value,
    default: { createAnimatedComponent: (component: unknown) => component, View: RN.View },
    FadeInDown: fadeBuilder,
    useReducedMotion: () => false,
  };
});

jest.mock('expo-image', () => {
  const RN = require('react-native');
  return {
    Image: (props: Record<string, unknown>) => <RN.View testID="expo-image" {...props} />,
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

jest.mock('@/src/features/chat/components/StreamingIndicator', () => ({
  StreamingIndicator: () => null,
}));
jest.mock('@/src/features/chat/components/ThinkingChip', () => {
  const RN = require('react-native');
  return { ThinkingChip: () => <RN.Text>Legacy thinking</RN.Text> };
});
jest.mock('@/src/features/chat/components/ToolCallTimeline', () => {
  const RN = require('react-native');
  return {
    ToolCallTimeline: () => <RN.Text>Legacy tool timeline</RN.Text>,
    ToolCallDetailsSheet: ({
      tool,
    }: {
      tool: { searchResults?: Array<{ title: string }> } | null;
    }) =>
      tool ? (
        <RN.View>
          <RN.Text>Structured tool details</RN.Text>
          {tool.searchResults?.map((result) => (
            <RN.Text key={result.title}>{result.title}</RN.Text>
          ))}
        </RN.View>
      ) : null,
  };
});
jest.mock('@/src/features/chat/components/AgentActivityTimeline', () => {
  const RN = require('react-native');
  return {
    AgentActivityTimeline: ({ activity }: { activity: { status: string } }) => (
      <RN.Text>Canonical activity: {activity.status}</RN.Text>
    ),
  };
});
jest.mock('@/src/features/chat/components/InlineArtifactCard', () => {
  const RN = require('react-native');
  return {
    InlineArtifactCard: ({
      artifact,
    }: {
      artifact: {
        id: string;
        type: string;
        title: string;
        content: string;
        generatedFile?: { fileName: string };
      };
    }) => (
      <RN.Text testID={`inline-artifact-${artifact.id}`}>
        {[
          artifact.title,
          artifact.type,
          artifact.generatedFile?.fileName ?? 'no-file',
          artifact.content,
        ].join('|')}
      </RN.Text>
    ),
  };
});
jest.mock('@/src/features/chat/components/ArtifactFullScreen', () => ({
  ArtifactFullScreen: () => null,
}));
jest.mock('@/src/features/chat/components/StatusStep', () => {
  const RN = require('react-native');
  return { StatusStep: () => <RN.Text>Legacy status step</RN.Text> };
});
jest.mock('@/src/features/chat/components/GeneratedImage', () => ({ GeneratedImage: () => null }));
jest.mock('@/src/features/chat/components/ImageGenProgress', () => ({
  ImageGenProgress: () => null,
}));
jest.mock('@/src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: () => null,
}));
jest.mock('@/src/features/chat/components/FileExportButton', () => ({
  FileExportButton: () => null,
}));
jest.mock('@/src/features/chat/components/CitationChip', () => ({ CitationChip: () => null }));
jest.mock('@/src/features/chat/components/CollapsibleSources', () => ({
  CollapsibleSources: () => null,
}));
jest.mock('@/src/features/chat/components/MessageEditModal', () => ({
  MessageEditModal: () => null,
}));
jest.mock('@/src/features/chat/components/ProvenanceFooter', () => {
  const RN = require('react-native');
  return {
    ProvenanceFooter: ({ provider, model }: { provider?: string; model?: string }) => (
      <RN.Text>{[provider, model].filter(Boolean).join(' · ')}</RN.Text>
    ),
  };
});
jest.mock('@/src/features/chat/components/PerformanceChip', () => ({
  PerformanceChip: () => null,
}));
jest.mock('@/src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: () => null,
}));

import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { CLOUD_RESUME_SIGN_IN, useChatExecutionStore } from '@/stores/chat/chatExecutionStore';
import { useAuthStore } from '@/src/features/auth/store';

const RUN_ID = '0190a000-0000-7000-8000-000000000051';

function pausedMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-input',
    role: 'assistant',
    conversationId: 'c-input',
    content: 'I need one detail first.',
    createdAt: new Date().toISOString(),
    pendingToolInput: {
      runId: RUN_ID,
      requestedAt: '2026-09-29T10:00:00.000Z',
      toolCalls: [
        {
          toolCallId: 'call_input',
          name: 'mcp__github__create_issue',
          connectorId: 'github',
          round: 0,
          inputRequests: {
            confirm_repo: {
              method: 'elicitation/create',
              params: {
                message: 'Which repository should I use?',
                requestedSchema: {
                  type: 'object',
                  properties: { repo: { type: 'string', title: 'Repository' } },
                  required: ['repo'],
                },
              },
            },
          },
        },
      ],
    },
    ...overrides,
  } as ChatMessage;
}

describe('MessageBubble tool input request', () => {
  const answerToolInput = jest.fn(async () => undefined);

  beforeEach(() => {
    answerToolInput.mockClear();
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useChatExecutionStore.setState({ answerToolInput, toolInputSendErrors: {} });
    useAuthStore.setState({ isClerkSignedIn: false });
  });

  it('asks for the connector input and sends the answer for the paused run', () => {
    const view = render(<MessageBubble message={pausedMessage()} />);

    expect(view.getAllByRole('header').map((header) => header.props.children)).toEqual([
      'GitHub needs your input',
    ]);
    expect(view.queryByText('Needs your input')).toBeNull();
    expect(view.getByText('Which repository should I use?')).toBeTruthy();

    fireEvent.changeText(view.getByLabelText(/Repository/), 'acme/app');
    fireEvent.press(view.getByText('Send answer'));

    expect(answerToolInput).toHaveBeenCalledWith('c-input', 'm-input', [
      {
        toolCallId: 'call_input',
        responses: { confirm_repo: { action: 'accept', content: { repo: 'acme/app' } } },
      },
    ]);
  });

  it('does not offer the form while the reply is still streaming or outside AGI Cloud', () => {
    const streaming = render(<MessageBubble message={pausedMessage({ isStreaming: true })} />);
    expect(streaming.queryByTestId('chat.tool-input-request')).toBeNull();
    streaming.unmount();

    useChatAppModeStore.setState({ appMode: 'local' });
    const local = render(<MessageBubble message={pausedMessage()} />);
    expect(local.queryByTestId('chat.tool-input-request')).toBeNull();
  });

  it('says the answer was sent once the run takes it, instead of the form', () => {
    const view = render(
      <MessageBubble
        message={pausedMessage({
          pendingToolInput: undefined,
          metadata: { toolInputOutcome: 'sent' },
        })}
      />,
    );

    expect(view.queryByTestId('chat.tool-input-request')).toBeNull();
    expect(view.getByTestId('chat.tool-input-outcome')).toHaveTextContent('Answer sent.');
    expect(view.queryByText('Send answer')).toBeNull();
  });

  it('says a request the run no longer waits on expired when the phone has no copy of it', () => {
    const view = render(
      <MessageBubble
        message={pausedMessage({
          pendingToolInput: undefined,
          metadata: { toolInputOutcome: 'expired' },
        })}
      />,
    );

    expect(view.getByTestId('chat.tool-input-outcome')).toHaveTextContent('This request expired.');
    expect(view.queryByText('Send answer')).toBeNull();
  });

  it('keeps a sent request on screen read-only once the run takes the answer', () => {
    const answered = pausedMessage().pendingToolInput;
    const view = render(
      <MessageBubble
        message={pausedMessage({
          pendingToolInput: undefined,
          answeredToolInput: answered,
          metadata: { toolInputOutcome: 'sent' },
        })}
      />,
    );

    expect(view.getByTestId('chat.tool-input-answered')).toBeTruthy();
    expect(view.getAllByRole('header').map((header) => header.props.children)).toEqual([
      'GitHub needs your input',
    ]);
    expect(
      view.getByText('Sent. The reply continues once every request in it is answered.'),
    ).toBeTruthy();
    expect(view.queryByTestId('chat.tool-input-outcome')).toBeNull();
    expect(view.queryByTestId('chat.tool-input-request')).toBeNull();
    expect(view.queryByText('Send answer')).toBeNull();
    expect(view.queryByText('Decline')).toBeNull();
  });

  it('shows an expired request with every field and button disabled', () => {
    const view = render(
      <MessageBubble
        message={pausedMessage({
          pendingToolInput: undefined,
          answeredToolInput: pausedMessage().pendingToolInput,
          metadata: { toolInputOutcome: 'expired' },
        })}
      />,
    );

    expect(view.getByTestId('chat.tool-input-answered')).toBeTruthy();
    expect(view.getByText('This request expired.')).toBeTruthy();
    expect(view.queryByTestId('chat.tool-input-outcome')).toBeNull();
    for (const name of ['Send answer', 'Decline', 'Cancel']) {
      expect(view.getByRole('button', { name }).props.accessibilityState?.disabled).toBe(true);
    }
    fireEvent.press(view.getByRole('button', { name: 'Send answer' }));
    expect(answerToolInput).not.toHaveBeenCalled();
    expect(view.getByLabelText(/Repository/).props.editable).toBe(false);
  });

  it('says why the answer could not be sent above the buttons of the paused form', () => {
    const sendError = 'Could not send your answer. Check your connection and try again.';
    useChatExecutionStore.setState({ toolInputSendErrors: { 'm-input': sendError } });
    const view = render(<MessageBubble message={pausedMessage()} />);

    expect(view.getByTestId('tool-input.send-error')).toHaveTextContent(sendError);
    expect(
      view.getByRole('button', { name: 'Send answer' }).props.accessibilityState?.disabled,
    ).toBe(false);

    act(() => useChatExecutionStore.setState({ toolInputSendErrors: {} }));
    expect(view.queryByTestId('tool-input.send-error')).toBeNull();
  });

  it('stops asking the person to sign in once they are signed in again', () => {
    useChatExecutionStore.setState({ toolInputSendErrors: { 'm-input': CLOUD_RESUME_SIGN_IN } });
    const view = render(<MessageBubble message={pausedMessage()} />);
    expect(view.getByTestId('tool-input.send-error')).toHaveTextContent(CLOUD_RESUME_SIGN_IN);

    act(() => useAuthStore.setState({ isClerkSignedIn: true }));
    expect(view.queryByTestId('tool-input.send-error')).toBeNull();

    const sendError = 'Could not send your answer. Check your connection and try again.';
    act(() => useChatExecutionStore.setState({ toolInputSendErrors: { 'm-input': sendError } }));
    expect(view.getByTestId('tool-input.send-error')).toHaveTextContent(sendError);
  });

  it('keeps the live form while the request is still pending, and ignores an unknown outcome', () => {
    const pending = render(
      <MessageBubble message={pausedMessage({ metadata: { toolInputOutcome: 'sent' } })} />,
    );
    expect(pending.getByTestId('chat.tool-input-request')).toBeTruthy();
    expect(pending.queryByTestId('chat.tool-input-outcome')).toBeNull();
    pending.unmount();

    const unknown = render(
      <MessageBubble
        message={pausedMessage({
          pendingToolInput: undefined,
          metadata: { toolInputOutcome: 'lost' },
        })}
      />,
    );
    expect(unknown.queryByTestId('chat.tool-input-outcome')).toBeNull();
  });
});

describe('MessageBubble: schedule a prompt as a task', () => {
  function userMessage(): ChatMessage {
    return {
      id: 'm-user',
      role: 'user',
      conversationId: 'c-cloud',
      content: 'Summarise the overnight sales numbers',
      createdAt: new Date().toISOString(),
    };
  }

  function actionHost(root: ReturnType<typeof render>['UNSAFE_root']) {
    return root.findAll(
      (node) =>
        Array.isArray(node.props.accessibilityActions) &&
        typeof node.props.onAccessibilityAction === 'function',
    )[0];
  }

  it('offers Schedule as task on a cloud prompt and hands the message over', () => {
    const onScheduleMessage = jest.fn();
    const { UNSAFE_root } = render(
      <MessageBubble message={userMessage()} onScheduleMessage={onScheduleMessage} />,
    );
    const host = actionHost(UNSAFE_root);
    expect(host?.props.accessibilityActions).toContainEqual({
      name: 'schedule',
      label: 'Schedule as task',
    });
    fireEvent(host!, 'accessibilityAction', { nativeEvent: { actionName: 'schedule' } });
    expect(onScheduleMessage).toHaveBeenCalledWith('m-user');
  });

  it('leaves the action out where scheduling is not offered', () => {
    const { UNSAFE_root } = render(<MessageBubble message={userMessage()} />);
    expect(
      actionHost(UNSAFE_root)?.props.accessibilityActions.map(
        (action: { name: string }) => action.name,
      ),
    ).not.toContain('schedule');
  });
});

describe('MessageBubble: when a message was sent', () => {
  it('shows the send time at the top of the message actions', () => {
    const { getByLabelText, getByTestId } = render(
      <MessageBubble
        message={{
          id: 'm-time',
          role: 'user',
          conversationId: 'c-time',
          content: 'What time is it?',
          createdAt: new Date().toISOString(),
        }}
      />,
    );
    fireEvent(getByLabelText('Your message: What time is it?'), 'longPress');
    expect(getByTestId('message-sent-at').props.children).toMatch(/^Sent at /);
  });

  it('stops the message actions at the reading column on a wide window', () => {
    const { getByLabelText, getByTestId } = render(
      <MessageBubble
        message={{
          id: 'm-wide',
          role: 'user',
          conversationId: 'c-wide',
          content: 'What time is it?',
          createdAt: new Date().toISOString(),
        }}
      />,
    );
    fireEvent(getByLabelText('Your message: What time is it?'), 'longPress');

    const rows = getByTestId('message-action-rows');
    expect(sitsInColumn(rows, 'reading')).toBe(true);
    expect(insetHasPanelBackground(rows, lightColors.surfaceElevated)).toBe(true);
  });
});
