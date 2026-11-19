/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render } from '@testing-library/react-native';
import type { ChatMessage } from '@/types/chat';

const mockActivity = jest.fn();

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
jest.mock('@/src/features/chat/components/AgentActivityTimeline', () => ({
  AgentActivityTimeline: (props: Record<string, unknown>) => {
    mockActivity(props);
    return null;
  },
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
  ReportSheet: () => null,
}));

jest.mock('@/src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: (path: string) => ({
    source: path ? { uri: `https://api.example.test${path}` } : null,
    status: path ? 'ready' : 'invalid',
  }),
}));

import { applyAgentActivityEvent, type AgentActivityState } from '@agiworkforce/client-runtime';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/cloud-contracts';
import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import { useArtifactStore } from '@/src/features/artifacts/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

const PNG_ID = '0b9c2f4e-7a1d-4c3b-9e8f-1a2b3c4d5e6f';
const CSV_ID = '2d9c2f4e-7a1d-4c3b-9e8f-1a2b3c4d5e71';
const SVG_ID = '3e9c2f4e-7a1d-4c3b-9e8f-1a2b3c4d5e72';

const GENERATED_FILES = [
  {
    id: 'file-png',
    fileName: 'sales.png',
    mimeType: 'image/png',
    uri: `/api/files/${PNG_ID}`,
    byteCount: 40_960,
    kind: 'image',
    surface: 'file',
    previewable: true,
  },
  {
    id: 'file-csv',
    fileName: 'sales.csv',
    mimeType: 'text/csv',
    uri: `/api/files/${CSV_ID}`,
    byteCount: 512,
    kind: 'csv',
    surface: 'file',
    previewable: false,
  },
];

function replay(events: AgentEventEnvelope['event'][]): AgentActivityState {
  let state: AgentActivityState | undefined;
  events.forEach((event, sequence) => {
    state = applyAgentActivityEvent(state, {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: 'session-plots',
      turnId: 'turn-plots',
      sequence,
      emittedAtMs: 1_000 + sequence * 500,
      event,
    } as AgentEventEnvelope);
  });
  return state!;
}

const CODE_RUN = replay([
  { type: 'lifecycle', phase: 'started' },
  {
    type: 'tool-execution-start',
    toolCallId: 'code-1',
    name: 'code_execution',
    category: 'code-execution',
    summary: 'Run Python',
    input: { code: 'plt.savefig("sales.png")' },
  },
  {
    type: 'tool-execution-end',
    toolCallId: 'code-1',
    name: 'code_execution',
    output: 'saved',
    isError: false,
    elapsedMs: 400,
  },
  { type: 'stop', reason: 'end-turn' },
]);

function answer(metadata: Record<string, unknown>): ChatMessage {
  return {
    id: 'answer-plots',
    conversationId: 'conversation-plots',
    role: 'assistant',
    content: 'Here is the chart.',
    createdAt: '2026-11-16T00:00:00.000Z',
    metadata: { generatedFiles: GENERATED_FILES, ...metadata },
  } as unknown as ChatMessage;
}

describe('MessageBubble code execution plots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useArtifactStore.setState({ artifacts: [] });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('draws a plotted chart under the code output and drops its separate card', () => {
    const view = render(
      <MessageBubble
        message={answer({ codeExecutionResult: { stdout: 'saved', stderr: '', returnCode: 0 } })}
      />,
    );

    expect(view.getByTestId('code-execution.plot-file-png')).toBeTruthy();
    expect(view.getByText('Plot 1')).toBeTruthy();
    expect(view.queryByTestId('inline-artifact-file-png')).toBeNull();
    expect(view.getByTestId('inline-artifact-file-csv')).toBeTruthy();
  });

  it('keeps an svg chart as its own card instead of drawing it as a plot', () => {
    const svg = {
      id: 'file-svg',
      fileName: 'trend.svg',
      mimeType: 'image/svg+xml',
      uri: `/api/files/${SVG_ID}`,
      byteCount: 2_048,
      kind: 'image',
      surface: 'file',
      previewable: true,
    };
    const view = render(
      <MessageBubble
        message={answer({
          generatedFiles: [svg],
          codeExecutionResult: { stdout: 'saved', stderr: '', returnCode: 0 },
        })}
      />,
    );

    expect(view.queryByTestId('code-execution.plot-file-svg')).toBeNull();
    expect(view.queryByText('Plot 1')).toBeNull();
    expect(view.getByTestId('inline-artifact-file-svg')).toBeTruthy();
  });

  it('keeps a picture as its own card when no code ran', () => {
    const view = render(<MessageBubble message={answer({})} />);

    expect(view.queryByTestId('code-execution')).toBeNull();
    expect(view.getByTestId('inline-artifact-file-png')).toBeTruthy();
    expect(view.getByTestId('inline-artifact-file-csv')).toBeTruthy();
  });

  it('hands the plots to the code step of the activity and keeps the picture in the answer', () => {
    const view = render(<MessageBubble message={answer({ agentActivity: CODE_RUN })} />);

    const props = mockActivity.mock.calls.at(-1)?.[0];
    expect(props.codePlots).toEqual([
      { artifactId: 'file-png', path: `/api/files/${PNG_ID}`, name: 'sales.png' },
    ]);
    expect(view.getByTestId('inline-artifact-file-png')).toBeTruthy();
  });

  it('hands no plots to an activity that ran no code', () => {
    const searchOnly = replay([
      { type: 'lifecycle', phase: 'started' },
      {
        type: 'tool-execution-start',
        toolCallId: 'search-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Search the web',
        input: { query: 'sales' },
      },
      {
        type: 'tool-execution-end',
        toolCallId: 'search-1',
        name: 'web_search',
        output: 'found',
        isError: false,
        elapsedMs: 200,
      },
      { type: 'stop', reason: 'end-turn' },
    ]);
    render(<MessageBubble message={answer({ agentActivity: searchOnly })} />);

    expect(mockActivity.mock.calls.at(-1)?.[0].codePlots).toBeUndefined();
  });
});
