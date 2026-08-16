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
import { useArtifactStore } from '@/src/features/artifacts/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { DEFAULT_LOCAL_MODEL_ID, getShortDisplayName } from '@/src/features/model-picker/service';

const LOCAL_MODEL_LABEL = getShortDisplayName(DEFAULT_LOCAL_MODEL_ID);
const SYNTHETIC_CLOUD_MODEL_ID = 'fixture-cloud-model';

describe('MessageBubble model label', () => {
  beforeEach(() => {
    useArtifactStore.setState({ artifacts: [] });
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('shows the friendly local model name instead of the internal model ID', () => {
    const message: ChatMessage = {
      id: 'm-1',
      role: 'assistant',
      content: 'Local AI runs on this device.',
      createdAt: new Date().toISOString(),
      model: DEFAULT_LOCAL_MODEL_ID,
    };

    const { getByText, queryByText, getByLabelText } = render(<MessageBubble message={message} />);

    expect(getByText(new RegExp(LOCAL_MODEL_LABEL))).toBeTruthy();
    expect(queryByText(DEFAULT_LOCAL_MODEL_ID)).toBeNull();
    expect(
      getByLabelText(`${LOCAL_MODEL_LABEL} message: Local AI runs on this device.`),
    ).toBeTruthy();
  });

  it('renders canonical Cloud activity once and suppresses duplicate legacy step/tool rows', () => {
    const message: ChatMessage = {
      id: 'm-cloud-1',
      role: 'assistant',
      content: 'Verified answer.',
      createdAt: new Date().toISOString(),
      model: SYNTHETIC_CLOUD_MODEL_ID,
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
    expect(view.queryByText('Legacy status step')).toBeNull();
    expect(view.queryByText('Legacy tool timeline')).toBeNull();
    expect(view.getByText('Verified answer.')).toBeTruthy();
    expect(view.getByText('Legacy thinking')).toBeTruthy();
  });

  it('opens structured search details from the VoiceOver message action', () => {
    const message: ChatMessage = {
      id: 'm-search-a11y',
      role: 'assistant',
      content: 'Here is the current result.',
      createdAt: new Date().toISOString(),
      model: SYNTHETIC_CLOUD_MODEL_ID,
      toolCalls: [
        {
          id: 'search-1',
          name: 'web_search',
          status: 'completed',
          output: '{"type":"web_search_tool_result","content":[{"url":"https://example.test"}]}',
          searchResults: [
            {
              title: 'Official announcement',
              url: 'https://example.test/announcement',
              snippet: 'Verified source',
            },
          ],
        },
      ],
    };

    const view = render(<MessageBubble message={message} />);
    const bubble = view.getByLabelText('AGI message: Here is the current result.');

    fireEvent(bubble, 'accessibilityAction', {
      nativeEvent: { actionName: 'tool-search-1' },
    });

    expect(view.getByText('Structured tool details')).toBeTruthy();
    expect(view.getByText('Official announcement')).toBeTruthy();
    expect(view.queryByText(/web_search_tool_result/)).toBeNull();
  });

  it('omits the thinking chip entirely when the turn produced no reasoning', () => {
    const message: ChatMessage = {
      id: 'm-no-reasoning',
      role: 'assistant',
      content: 'Direct answer.',
      createdAt: new Date().toISOString(),
      model: SYNTHETIC_CLOUD_MODEL_ID,
    };

    const view = render(<MessageBubble message={message} />);

    expect(view.queryByText('Legacy thinking')).toBeNull();
    expect(view.getByText('Direct answer.')).toBeTruthy();
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

  it('renders a rich message-owned generated file when the artifact store is empty', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const message: ChatMessage = {
      id: 'm-generated-file',
      role: 'assistant',
      content: 'Your report is ready.',
      createdAt: '2026-08-13T00:00:00.000Z',
      artifacts: [
        {
          id: 'generated-report',
          type: 'document',
          title: 'Quarterly report',
          content: '',
          generatedFile: {
            id: 'generated-report',
            computeSessionId: '',
            ownerUserId: '',
            sourceSurface: 'web',
            privacyMode: 'managed',
            providerMode: 'ManagedGateway',
            kind: 'pdf',
            fileName: 'quarterly-report.pdf',
            mimeType: 'application/pdf',
            uri: 'https://media.example/quarterly-report.pdf',
            byteCount: 4096,
            checksumSha256: 'f'.repeat(64),
            previewDerivatives: [],
            createdAt: '2026-08-13T00:00:00.000Z',
          },
        },
      ],
    };

    const view = render(<MessageBubble message={message} />);

    expect(view.getByTestId('inline-artifact-generated-report').props.children).toBe(
      'Quarterly report|document|quarterly-report.pdf|',
    );
  });

  it('lets the rich message artifact replace a duplicate store row and omits wrong-scope rows', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useArtifactStore.setState({
      artifacts: [
        {
          id: 'same-id',
          messageId: 'm-merge',
          title: 'Store fallback',
          kind: 'document',
          content: 'plain store content',
          ageLabel: 'Now',
          sourceLabel: 'AGI',
          accentColor: '#000000',
          previewLines: [],
          provenance: { scope: 'cloud', ownerId: 'user-fixture' },
        },
        {
          id: 'wrong-scope',
          messageId: 'm-merge',
          title: 'Local private artifact',
          kind: 'document',
          content: 'must stay local',
          ageLabel: 'Now',
          sourceLabel: 'AGI',
          accentColor: '#000000',
          previewLines: [],
          provenance: { scope: 'local' },
        },
      ],
    });
    const message: ChatMessage = {
      id: 'm-merge',
      role: 'assistant',
      content: 'Finished.',
      createdAt: '2026-08-13T00:00:00.000Z',
      artifacts: [
        {
          id: 'same-id',
          type: 'document',
          title: 'Rich generated file',
          content: '',
          generatedFile: {
            id: 'same-id',
            computeSessionId: '',
            ownerUserId: '',
            sourceSurface: 'web',
            privacyMode: 'managed',
            providerMode: 'ManagedGateway',
            kind: 'docx',
            fileName: 'rich-result.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            uri: 'https://media.example/rich-result.docx',
            byteCount: 1024,
            checksumSha256: 'a'.repeat(64),
            previewDerivatives: [],
            createdAt: '2026-08-13T00:00:00.000Z',
          },
        },
      ],
    };

    const view = render(<MessageBubble message={message} />);

    expect(view.getByTestId('inline-artifact-same-id').props.children).toBe(
      'Rich generated file|document|rich-result.docx|',
    );
    expect(view.queryByTestId('inline-artifact-wrong-scope')).toBeNull();
    expect(view.queryByText('Store fallback')).toBeNull();
  });
});
