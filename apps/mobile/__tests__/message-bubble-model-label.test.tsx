/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render } from '@testing-library/react-native';
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
  // Any icon name resolves to the stub — robust to new icons added to MessageBubble.
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
  return { ToolCallTimeline: () => <RN.Text>Legacy tool timeline</RN.Text> };
});
jest.mock('@/src/features/chat/components/AgentActivityTimeline', () => {
  const RN = require('react-native');
  return {
    AgentActivityTimeline: ({ activity }: { activity: { status: string } }) => (
      <RN.Text>Canonical activity: {activity.status}</RN.Text>
    ),
  };
});
jest.mock('@/src/features/chat/components/InlineArtifactCard', () => ({
  InlineArtifactCard: () => null,
}));
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

describe('MessageBubble model label', () => {
  it('shows the friendly local model name instead of the internal model ID', () => {
    const message: ChatMessage = {
      id: 'm-1',
      role: 'assistant',
      content: 'Local AI runs on this device.',
      createdAt: new Date().toISOString(),
      model: 'qwen3-4b-instruct-2507',
    };

    const { getByText, queryByText, getByLabelText } = render(<MessageBubble message={message} />);

    expect(getByText(/AGI Standard/)).toBeTruthy();
    expect(queryByText('qwen3-4b-instruct-2507')).toBeNull();
    expect(getByLabelText('AGI Standard message: Local AI runs on this device.')).toBeTruthy();
  });

  it('renders canonical Cloud activity once and suppresses duplicate legacy reasoning rows', () => {
    const message: ChatMessage = {
      id: 'm-cloud-1',
      role: 'assistant',
      content: 'Verified answer.',
      createdAt: new Date().toISOString(),
      model: 'gpt-5.6-luna',
      reasoning: 'private provider scratchpad',
      steps: [
        {
          id: 'step-1',
          title: 'Legacy step',
          status: 'completed',
        },
      ],
      toolCalls: [
        {
          id: 'tool-1',
          toolCallId: 'tool-1',
          name: 'web_search',
          status: 'completed',
        },
      ],
      metadata: {
        agentActivity: {
          schemaVersion: 1,
          sessionId: 'session-1',
          turnId: 'turn-1',
          lastSequence: 2,
          status: 'completed',
          startedAtMs: 1_000,
          updatedAtMs: 2_000,
          completedAtMs: 2_000,
          entries: [
            {
              kind: 'progress',
              id: 'progress:research',
              progressId: 'research',
              summary: 'Searched official sources',
              status: 'completed',
              startedAtMs: 1_100,
              completedAtMs: 1_900,
            },
          ],
        },
      },
    } as ChatMessage;

    const view = render(<MessageBubble message={message} />);

    expect(view.getByText('Canonical activity: completed')).toBeTruthy();
    expect(view.queryByText('Legacy thinking')).toBeNull();
    expect(view.queryByText('Legacy status step')).toBeNull();
    expect(view.queryByText('Legacy tool timeline')).toBeNull();
    expect(view.getByText('Verified answer.')).toBeTruthy();
  });

  it('rejects malformed synced activity metadata and preserves the legacy safe fallback', () => {
    const message = {
      id: 'm-cloud-malformed',
      role: 'assistant',
      content: 'Fallback answer.',
      createdAt: new Date().toISOString(),
      reasoning: 'Safe summarized thinking',
      metadata: {
        agentActivity: {
          schemaVersion: 1,
          sessionId: 'session-1',
          turnId: 'turn-1',
          lastSequence: 2,
          status: 'completed',
          startedAtMs: 1_000,
          updatedAtMs: 2_000,
          entries: [
            {
              kind: 'context',
              id: 'context:1',
              summary: 'Compacted context',
              beforeTokens: 'not-a-number',
              emittedAtMs: 1_500,
            },
          ],
        },
      },
    } as unknown as ChatMessage;

    const view = render(<MessageBubble message={message} />);

    expect(view.queryByText(/Canonical activity/)).toBeNull();
    expect(view.getByText('Legacy thinking')).toBeTruthy();
    expect(view.getByText('Fallback answer.')).toBeTruthy();
  });
});
