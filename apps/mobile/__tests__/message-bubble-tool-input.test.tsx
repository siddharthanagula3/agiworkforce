/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { ChatMessage } from '@/types/chat';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.lightColors,
  };
});

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('@/components/ui/avatar', () => {
  const RN = require('react-native');
  return {
    Avatar: (props: Record<string, unknown>) => <RN.View testID="avatar" {...props} />,
  };
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
    default: {
      View: RN.View,
    },
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
jest.mock('@/src/features/chat/components/ApprovalCard', () => ({ ApprovalCard: () => null }));
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
  ReportFlagButton: () => null,
}));

import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useChatExecutionStore } from '@/stores/chat/chatExecutionStore';

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
    useChatExecutionStore.setState({ answerToolInput });
  });

  it('asks for the connector input and sends the answer for the paused run', () => {
    const view = render(<MessageBubble message={pausedMessage()} />);

    expect(view.getByText('Needs your input')).toBeTruthy();
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
});
