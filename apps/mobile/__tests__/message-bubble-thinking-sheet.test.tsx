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
    useSharedValue: (initial: number) => ({ value: initial }),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withTiming: (value: number) => value,
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
  const gesture = new Proxy(
    {},
    { get: (target, name) => (name === 'then' ? undefined : () => gesture) },
  );
  return {
    TapGestureHandler: ({ children }: { children: React.ReactNode }) => (
      <RN.View>{children}</RN.View>
    ),
    State: { ACTIVE: 'ACTIVE' },
    Gesture: { Pan: () => gesture },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: RN.View,
  };
});

jest.mock('@/src/features/chat/components/StreamingIndicator', () => ({
  StreamingIndicator: () => null,
}));
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
jest.mock('@/src/features/chat/components/AgentActivityTimeline', () => ({
  AgentActivityTimeline: () => null,
}));
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
  ReportFlagButton: () => null,
}));

import { MessageBubble } from '@/src/features/chat/components/MessageBubble';

function searchingMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-think',
    role: 'assistant',
    conversationId: 'c-think',
    content: 'Here is the schedule.',
    reasoning: '**Reviewing event details**\nChecking the dates.',
    createdAt: new Date().toISOString(),
    metadata: {
      agentActivity: {
        schemaVersion: 1,
        sessionId: 's1',
        turnId: 't1',
        lastSequence: 2,
        status: 'completed',
        startedAtMs: 0,
        updatedAtMs: 10,
        completedAtMs: 10,
        entries: [
          {
            kind: 'tool',
            id: 'e1',
            toolCallId: 'call-1',
            name: 'web_search',
            category: 'web-search',
            summary: 'Searching',
            status: 'completed',
            startedAtMs: 0,
            query: 'event schedule',
            sources: [{ url: 'https://luma.com/e/1', title: 'Luma event' }],
          },
        ],
      },
    },
    ...overrides,
  } as ChatMessage;
}

describe('MessageBubble thinking sheet', () => {
  it('shows the search steps from the message activity in the sheet', () => {
    const { getByLabelText, getByText } = render(<MessageBubble message={searchingMessage()} />);

    fireEvent.press(getByLabelText('Show reasoning'));

    expect(getByText('Reviewing event details')).toBeTruthy();
    expect(getByText('Searching the web')).toBeTruthy();
    expect(getByText('event schedule')).toBeTruthy();
    expect(getByText('luma.com')).toBeTruthy();
  });

  it('shows only the reasoning steps when the message carries no activity', () => {
    const { getByLabelText, getByText, queryByText } = render(
      <MessageBubble message={searchingMessage({ metadata: {} })} />,
    );

    fireEvent.press(getByLabelText('Show reasoning'));

    expect(getByText('Reviewing event details')).toBeTruthy();
    expect(queryByText('Searching the web')).toBeNull();
  });
});
