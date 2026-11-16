/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Alert, View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
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

import { EXPLICIT_ARTIFACT_MARKER_FOR } from '@agiworkforce/artifacts';
import { applyAgentActivityEvent, type AgentActivityState } from '@agiworkforce/client-runtime';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  SHARED_ATTACHMENTS_NOT_COPIED,
  WEB_SEARCH_NOT_PERFORMED_CODE,
  describeSecretRedactionNotice,
  supportsManagedMediaImageEdit,
} from '@agiworkforce/cloud-contracts';
import {
  MODEL_ESCALATION_PREFIX,
  resolveModelEscalation,
} from '@agiworkforce/unified-chat/model-escalation';
import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import {
  ChatScrollIntoView,
  type ScrollableChatList,
} from '@/src/features/chat/components/cards/ChatScrollIntoView';
import { API_URL } from '@/lib/constants';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import * as executionStore from '@/stores/chat/chatExecutionStore';
import { useChatExecutionStore } from '@/stores/chat/chatExecutionStore';
import {
  SYNTHETIC_CLOUD_MODEL_ID,
  SYNTHETIC_IMAGE_MODEL_ID,
  SYNTHETIC_LOCAL_MODEL_ID,
  requireCatalogModel,
} from '@/test-utils/modelFixtures';

const EDITING_IMAGE_MODEL = requireCatalogModel(
  (model) => model.modelType === 'image' && supportsManagedMediaImageEdit(model.imageApi),
  'image model that edits images',
).id;

function answer(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'answer-7',
    conversationId: 'conversation-7',
    role: 'assistant',
    content: 'The answer.',
    createdAt: '2026-11-14T10:00:00.000Z',
    ...overrides,
  };
}

const MAP_CARD = {
  cardId: 'card-1',
  kind: 'map-search.v1',
  recognized: false,
  body: {},
} as unknown as NonNullable<ChatMessage['interactiveCards']>[number];

describe('what MessageBubble mounts for other renderers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('mounts interactive cards before and after the prose, each under the real conversation', () => {
    render(<MessageBubble message={answer({ interactiveCards: [MAP_CARD] })} />);

    const placements = mockInteractiveCards.mock.calls.map(([props]) => props.placement);
    expect(placements).toEqual(['before-prose', 'after-prose']);
    for (const [props] of mockInteractiveCards.mock.calls) {
      expect(props.conversationId).toBe('conversation-7');
      expect(props.messageId).toBe('answer-7');
      expect(props.assistantText).toBe('The answer.');
      expect(props.textOffsets).toBeUndefined();
    }
  });

  it('gives the cards the answer text without its reasoning', () => {
    render(
      <MessageBubble
        message={answer({
          content: '<think>Checking hours.</think>Blue Bottle opens at 7.',
          interactiveCards: [MAP_CARD],
        })}
      />,
    );

    expect(mockInteractiveCards.mock.calls.map(([props]) => props.assistantText)).toEqual([
      'Blue Bottle opens at 7.',
      'Blue Bottle opens at 7.',
    ]);
  });

  it('gives both card mounts the recorded text offsets, keeping only real positions', () => {
    render(
      <MessageBubble
        message={answer({
          interactiveCards: [MAP_CARD],
          metadata: { interactiveCardTextOffsets: { 'card-1': 0, 'card-2': 'x', 'card-3': -4 } },
        })}
      />,
    );

    expect(mockInteractiveCards.mock.calls.map(([props]) => props.textOffsets)).toEqual([
      { 'card-1': 0 },
      { 'card-1': 0 },
    ]);
  });

  it('wraps the answer in its draft scope with Save, and a person’s message without Save', () => {
    const view = render(<MessageBubble message={answer()} />);
    expect(screen.getByTestId('draft-scope').props.children).toBe('The answer.|answer-7|save');
    view.unmount();

    useChatAppModeStore.setState({ appMode: 'local' });
    render(
      <MessageBubble
        message={answer({ id: 'question-7', role: 'user', content: 'A question?' })}
      />,
    );
    expect(screen.queryByTestId('draft-scope')).toBeNull();
  });

  it('shows sources as one control with the cited count, the query and a partial mark', () => {
    render(
      <MessageBubble
        message={answer({
          citations: [
            { url: 'https://a.example/one', title: 'One' },
            { url: 'https://b.example/two', title: 'Two' },
          ],
          metadata: {
            citations: [
              { type: 'web_search_result_location', url: 'https://a.example/one', title: 'One' },
            ],
            searchResults: { query: 'tide tables', results: [] },
          },
        })}
      />,
    );

    expect(mockSources).toHaveBeenCalledTimes(1);
    expect(mockSources.mock.calls[0][0]).toEqual(
      expect.objectContaining({ citedCount: 1, query: 'tide tables', partial: false }),
    );
    expect(mockSources.mock.calls[0][0].sources).toHaveLength(2);
  });

  it('gives the sources control the turn metadata, so a stopped answer says its sources are partial', () => {
    const metadata = { finishReason: 'stopped' };
    render(
      <MessageBubble
        message={answer({
          citations: [{ url: 'https://a.example/one', title: 'One' }],
          metadata,
        })}
      />,
    );

    expect(mockSources).toHaveBeenCalledTimes(1);
    expect(mockSources.mock.calls[0][0]).toEqual(
      expect.objectContaining({ metadata, partial: false }),
    );
  });

  it('shows the code a reopened answer ran, with its output', () => {
    render(
      <MessageBubble
        message={answer({
          metadata: {
            codeExecutionResult: { stdout: 'mean = 4.5\n', stderr: '', returnCode: 0 },
            isExecutingCode: false,
          },
        })}
      />,
    );

    expect(screen.getByTestId('code-execution')).toBeOnTheScreen();
    expect(screen.getByText('Output')).toBeOnTheScreen();
    expect(screen.getByText('mean = 4.5\n')).toBeOnTheScreen();
    expect(screen.queryByTestId('code-execution.running')).toBeNull();
  });

  it('shows a running line while the answer says its code is executing', () => {
    render(
      <MessageBubble
        message={answer({ content: '', isStreaming: true, metadata: { isExecutingCode: true } })}
      />,
    );

    expect(screen.getByTestId('code-execution.running')).toBeOnTheScreen();
    expect(mockStreamingIndicator).not.toHaveBeenCalled();
  });

  it('offers View as for a finished answer in a format web recognises, never while it streams', () => {
    const recipe = [
      '# Pancakes',
      '',
      '## Ingredients',
      '- 200g flour',
      '',
      '## Instructions',
      '1. Mix everything',
    ].join('\n');
    const view = render(<MessageBubble message={answer({ content: recipe, isStreaming: true })} />);
    expect(screen.queryByRole('button', { name: 'View as recipe' })).toBeNull();

    view.rerender(<MessageBubble message={answer({ content: recipe })} />);
    fireEvent.press(screen.getByRole('button', { name: 'View as recipe' }));
    expect(screen.getByTestId('message-format-card.recipe')).toBeOnTheScreen();
  });

  it('offers no View as on a plain answer or a person’s message', () => {
    const view = render(<MessageBubble message={answer()} />);
    expect(screen.queryByTestId('message-format-card')).toBeNull();
    view.unmount();

    render(
      <MessageBubble
        message={answer({
          id: 'question-7',
          role: 'user',
          content: '# Pancakes\n\n## Ingredients\n- flour\n\n## Instructions\n1. Mix everything',
        })}
      />,
    );
    expect(screen.queryByTestId('message-format-card')).toBeNull();
  });

  it('shows no code block on an answer that ran no code', () => {
    render(<MessageBubble message={answer()} />);

    expect(screen.queryByTestId('code-execution')).toBeNull();
  });

  it('shows project file citations only once the answer is complete', () => {
    const metadata = {
      projectSources: [
        {
          projectId: 'project-1',
          fileId: 'file-1',
          fileName: 'report.pdf',
          anchor: { page: 12 },
          snippet: 'Revenue grew.',
        },
      ],
    };
    const view = render(<MessageBubble message={answer({ isStreaming: true, metadata })} />);
    expect(mockProjectFiles).not.toHaveBeenCalled();

    view.rerender(<MessageBubble message={answer({ metadata })} />);
    expect(mockProjectFiles.mock.calls.at(-1)?.[0].citations).toEqual([
      {
        projectId: 'project-1',
        fileId: 'file-1',
        fileName: 'report.pdf',
        anchor: { page: 12 },
        snippet: 'Revenue grew.',
      },
    ]);
  });

  it('opens a person’s photos as attachments the viewer can page through and never delete', () => {
    const onDeleteImageConversation = jest.fn();
    useChatAppModeStore.setState({ appMode: 'local' });
    render(
      <MessageBubble
        message={answer({
          id: 'question-8',
          role: 'user',
          content: 'Which is better?',
          attachments: [
            { url: 'file:///one.jpg', mimeType: 'image/jpeg', fileName: 'one.jpg' },
            { url: 'file:///two.jpg', mimeType: 'image/jpeg', fileName: 'two.jpg' },
          ],
        })}
        onDeleteImageConversation={onDeleteImageConversation}
      />,
    );

    expect(mockAuthorizedImage.mock.calls.map(([props]) => props.name)).toEqual([
      'one.jpg',
      'two.jpg',
    ]);
    const second = screen.getByRole('button', { name: 'Attached image: two.jpg' });
    expect(second.props.accessibilityHint).toBe('Opens full screen');
    fireEvent.press(second);

    const viewer = mockViewer.mock.calls.at(-1)?.[0];
    expect(viewer.visible).toBe(true);
    expect(viewer.initialIndex).toBe(1);
    expect(viewer.onDelete).toBeUndefined();
    expect(viewer.images).toEqual([
      { url: 'file:///one.jpg', kind: 'attachment', name: 'one.jpg', mimeType: 'image/jpeg' },
      { url: 'file:///two.jpg', kind: 'attachment', name: 'two.jpg', mimeType: 'image/jpeg' },
    ]);
  });

  it('opens a generated image with its settings and keeps Delete for the image chat', () => {
    const onDeleteImageConversation = jest.fn();
    render(
      <MessageBubble
        message={answer({
          content: '',
          type: 'image',
          imageUrl: 'https://cdn.example.com/fox.png',
          imageGenPrompt: 'a red fox',
          imageAspectRatio: '16:9',
          model: SYNTHETIC_IMAGE_MODEL_ID,
        })}
        onDeleteImageConversation={onDeleteImageConversation}
      />,
    );

    expect(mockGeneratedImage.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ model: SYNTHETIC_IMAGE_MODEL_ID, aspectRatio: '16:9' }),
    );
    act(() => mockGeneratedImage.mock.calls.at(-1)?.[0].onPress());
    const viewer = mockViewer.mock.calls.at(-1)?.[0];
    expect(viewer.images).toEqual([
      {
        url: 'https://cdn.example.com/fox.png',
        kind: 'generated',
        prompt: 'a red fox',
        model: SYNTHETIC_IMAGE_MODEL_ID,
        aspectRatio: '16:9',
        allowEphemeral: false,
      },
    ]);
    expect(viewer.onDelete).toBe(onDeleteImageConversation);
  });

  it('offers Edit area in the viewer only for an image from a model that edits images', () => {
    const onEditImageArea = jest.fn();
    const image = (model: string) =>
      answer({ content: '', type: 'image', imageUrl: 'https://cdn.example.com/fox.png', model });
    const edit = { prompt: 'make it blue', sourceBase64: 'c291cmNl', maskBase64: 'bWFzaw==' };

    const view = render(
      <MessageBubble message={image(EDITING_IMAGE_MODEL)} onEditImageArea={onEditImageArea} />,
    );
    const editable = mockViewer.mock.calls.at(-1)?.[0];
    expect(typeof editable.onEditArea).toBe('function');
    act(() => editable.onEditArea(edit));
    expect(onEditImageArea).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'answer-7', model: EDITING_IMAGE_MODEL }),
      edit,
    );
    view.unmount();

    render(
      <MessageBubble message={image(SYNTHETIC_IMAGE_MODEL_ID)} onEditImageArea={onEditImageArea} />,
    );
    expect(mockViewer.mock.calls.at(-1)?.[0].onEditArea).toBeUndefined();
  });

  it('hides Edit area for an image model the server has not admitted for editing', () => {
    const onEditImageArea = jest.fn();
    const message = answer({
      content: '',
      type: 'image',
      imageUrl: 'https://cdn.example.com/fox.png',
      model: EDITING_IMAGE_MODEL,
    });

    const view = render(
      <MessageBubble
        message={message}
        onEditImageArea={onEditImageArea}
        imageEditModelIds={new Set<string>()}
      />,
    );
    expect(mockViewer.mock.calls.at(-1)?.[0].onEditArea).toBeUndefined();
    view.unmount();

    render(
      <MessageBubble
        message={message}
        onEditImageArea={onEditImageArea}
        imageEditModelIds={new Set([EDITING_IMAGE_MODEL])}
      />,
    );
    expect(typeof mockViewer.mock.calls.at(-1)?.[0].onEditArea).toBe('function');
  });

  it('offers Change this image in the viewer only for an image from a model that edits images', () => {
    const onEditImage = jest.fn();
    const image = (model: string) =>
      answer({ content: '', type: 'image', imageUrl: 'https://cdn.example.com/fox.png', model });
    const edit = { operation: 'variation', prompt: 'a red fox', sourceBase64: 'c291cmNl' };

    const view = render(
      <MessageBubble message={image(EDITING_IMAGE_MODEL)} onEditImage={onEditImage} />,
    );
    act(() => mockGeneratedImage.mock.calls.at(-1)?.[0].onPress());
    const editable = mockViewer.mock.calls.at(-1)?.[0];
    expect(editable.visible).toBe(true);
    expect(typeof editable.onEditImage).toBe('function');
    act(() => editable.onEditImage(edit));
    expect(onEditImage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'answer-7', model: EDITING_IMAGE_MODEL }),
      edit,
    );
    expect(mockViewer.mock.calls.at(-1)?.[0].visible).toBe(false);
    view.unmount();

    const other = render(
      <MessageBubble message={image(SYNTHETIC_IMAGE_MODEL_ID)} onEditImage={onEditImage} />,
    );
    expect(mockViewer.mock.calls.at(-1)?.[0].onEditImage).toBeUndefined();
    other.unmount();

    render(
      <MessageBubble
        message={image(EDITING_IMAGE_MODEL)}
        onEditImage={onEditImage}
        imageEditModelIds={new Set<string>()}
      />,
    );
    expect(mockViewer.mock.calls.at(-1)?.[0].onEditImage).toBeUndefined();
  });

  it('tells a generated image when its chat is temporary, so it can be kept', () => {
    const image = answer({
      content: '',
      type: 'image',
      imageUrl: 'https://cdn.example.com/fox.png',
      model: SYNTHETIC_IMAGE_MODEL_ID,
    });
    const view = render(<MessageBubble message={image} inTemporaryChat />);
    expect(mockGeneratedImage.mock.calls.at(-1)?.[0].inTemporaryChat).toBe(true);
    view.unmount();

    render(<MessageBubble message={image} />);
    expect(mockGeneratedImage.mock.calls.at(-1)?.[0].inTemporaryChat).toBe(false);
  });

  it('counts image generation time from when the answer was created, and waits for a retry time', () => {
    const view = render(
      <MessageBubble
        message={answer({ content: '', isGeneratingImage: true, imageGenStatus: 'generating' })}
      />,
    );
    expect(mockImageProgress.mock.calls.at(-1)?.[0].startedAt).toBe(
      Date.parse('2026-11-14T10:00:00.000Z'),
    );
    expect(mockImageProgress.mock.calls.at(-1)?.[0].retryAt).toBeUndefined();

    const retryAt = Date.parse('2026-11-14T10:01:00.000Z');
    view.rerender(
      <MessageBubble
        message={answer({ content: '', imageGenStatus: 'failed', imageGenRetryAt: retryAt })}
      />,
    );
    expect(mockImageProgress.mock.calls.at(-1)?.[0].retryAt).toBe(retryAt);
  });

  it('shows an image an answer carries full width and opens it full screen', () => {
    render(
      <MessageBubble
        message={answer({
          attachments: [
            {
              url: 'https://cdn.example.com/chart.png',
              mimeType: 'image/png',
              fileName: 'chart.png',
            },
          ],
        })}
      />,
    );

    expect(mockAuthorizedImage.mock.calls.at(-1)?.[0].style).toEqual(
      expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Attached image: chart.png' }));
    expect(mockViewer.mock.calls.at(-1)?.[0].images).toEqual([
      {
        url: 'https://cdn.example.com/chart.png',
        kind: 'attachment',
        name: 'chart.png',
        mimeType: 'image/png',
      },
    ]);
  });

  it('opens a sent file in the file viewer from its chip, which names its type and size', () => {
    const file = {
      url: '/api/files/0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0',
      mimeType: 'application/pdf',
      fileName: 'lease.pdf',
      fileSize: 245_760,
    };
    render(
      <MessageBubble
        message={answer({
          id: 'question-9',
          role: 'user',
          content: 'Summarise this.',
          attachments: [file],
        })}
      />,
    );

    expect(mockFileViewer.mock.calls.at(-1)?.[0].source).toBeNull();
    const chip = screen.getByRole('button', { name: 'File attachment: lease.pdf, PDF · 240 KB' });
    expect(screen.getByText('PDF · 240 KB')).toBeOnTheScreen();
    fireEvent.press(chip);

    const viewer = mockFileViewer.mock.calls.at(-1)?.[0];
    expect(viewer.source).toEqual({
      title: 'lease.pdf',
      fileName: 'lease.pdf',
      mimeType: 'application/pdf',
      url: `${API_URL.replace(/\/+$/, '')}/api/files/0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0`,
      byteCount: 245_760,
    });
    act(() => viewer.onClose());
    expect(mockFileViewer.mock.calls.at(-1)?.[0].source).toBeNull();
  });

  it('says a sent file is gone instead of opening nothing', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    render(
      <MessageBubble
        message={answer({
          id: 'question-10',
          role: 'user',
          content: 'Here.',
          attachments: [{ url: 'blob:gone', mimeType: 'application/pdf', fileName: 'gone.pdf' }],
        })}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'File attachment: gone.pdf, PDF' }));

    expect(alert).toHaveBeenCalledWith(
      'Could not open file',
      'This file is no longer available on this device.',
    );
    expect(mockFileViewer.mock.calls.at(-1)?.[0].source).toBeNull();
    alert.mockRestore();
  });

  it('names the files a shared chat kept private under the person’s message', () => {
    render(
      <MessageBubble
        message={answer({
          id: 'question-11',
          role: 'user',
          content: 'From the shared chat.',
          metadata: { sharedAttachments: [{ name: 'plan.pdf' }, { name: 'q3.xlsx' }] },
        })}
      />,
    );

    expect(screen.getByTestId('message-shared-attachments')).toHaveTextContent(
      `${SHARED_ATTACHMENTS_NOT_COPIED} plan.pdf, q3.xlsx`,
    );
  });

  it('shows no shared-files line on an answer or a message without them', () => {
    const view = render(
      <MessageBubble
        message={answer({ metadata: { sharedAttachments: [{ name: 'plan.pdf' }] } })}
      />,
    );
    expect(screen.queryByTestId('message-shared-attachments')).toBeNull();
    view.unmount();

    render(<MessageBubble message={answer({ id: 'question-12', role: 'user', content: 'Hi' })} />);
    expect(screen.queryByTestId('message-shared-attachments')).toBeNull();
  });

  it('shows reasoning an older answer stored as thinkingContent, with its duration', () => {
    render(
      <MessageBubble
        message={answer({
          metadata: { thinkingContent: 'Compared the two plans.', thinkingDurationSeconds: 6 },
        })}
      />,
    );

    expect(mockThinkingChip.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ thinkingText: 'Compared the two plans.', duration: 6 }),
    );
  });

  it('shows the reasoning steps an older answer stored, one numbered step each', () => {
    render(
      <MessageBubble
        message={answer({
          metadata: { thinkingSteps: ['Read the lease.', ' ', 'Found the break clause. '] },
        })}
      />,
    );

    expect(mockThinkingChip.mock.calls.at(-1)?.[0].thinkingText).toBe(
      '**Step 1**\nRead the lease.\n\n**Step 2**\nFound the break clause.',
    );
  });

  it('tells the reasoning line when the answer text has started', () => {
    const view = render(
      <MessageBubble
        message={answer({ content: '', reasoning: 'Weighing it.', isStreaming: true })}
      />,
    );
    expect(mockThinkingChip.mock.calls.at(-1)?.[0].answerStarted).toBe(false);

    view.rerender(
      <MessageBubble
        message={answer({ content: 'The answer', reasoning: 'Weighing it.', isStreaming: true })}
      />,
    );
    expect(mockThinkingChip.mock.calls.at(-1)?.[0].answerStarted).toBe(true);
  });

  it('gives the renderer this turn’s sources, so their images load without asking', () => {
    const citations = [
      { url: 'https://news.example/photo.jpg', title: 'News' },
      { url: 'https://search.example/p.png', title: 'Search' },
    ];
    render(<MessageBubble message={answer({ citations })} />);

    expect(mockRenderOptions.mock.calls.at(-1)?.[0].citations).toEqual(citations);
  });

  it('leads project files with the passage the answer names and lists past chats once done', () => {
    const metadata = {
      projectSources: [
        { projectId: 'project-1', fileId: 'file-1', fileName: 'report.pdf', snippet: 'Revenue.' },
      ],
      pastChatSources: [
        {
          id: 'past-1',
          conversationId: 'conversation-2',
          messageId: 'message-3',
          title: 'Budget review',
          createdAt: '2026-11-01T09:00:00.000Z',
        },
        {
          id: 'past-2',
          conversationId: '',
          messageId: 'message-4',
          title: 'No chat',
          createdAt: '',
        },
      ],
    };
    const view = render(
      <MessageBubble message={answer({ content: '<think>x</think>Per report.pdf', metadata })} />,
    );
    expect(mockProjectFiles.mock.calls.at(-1)?.[0].answerText).toBe('Per report.pdf');
    expect(mockPastChats.mock.calls.at(-1)?.[0].citations).toEqual([
      {
        id: 'past-1',
        conversationId: 'conversation-2',
        messageId: 'message-3',
        title: 'Budget review',
        createdAt: '2026-11-01T09:00:00.000Z',
      },
    ]);

    mockPastChats.mockClear();
    view.rerender(<MessageBubble message={answer({ isStreaming: true, metadata })} />);
    expect(mockPastChats).not.toHaveBeenCalled();
  });

  it('lets both card mounts send a reply only when the chat can send one', () => {
    const onFollowUp = jest.fn();
    const view = render(
      <MessageBubble message={answer({ interactiveCards: [MAP_CARD] })} onFollowUp={onFollowUp} />,
    );
    expect(mockInteractiveCards.mock.calls.map(([props]) => props.onSendMessage)).toEqual([
      onFollowUp,
      onFollowUp,
    ]);

    mockInteractiveCards.mockClear();
    view.rerender(<MessageBubble message={answer({ interactiveCards: [MAP_CARD] })} />);
    for (const [props] of mockInteractiveCards.mock.calls) {
      expect(props.onSendMessage).toBeUndefined();
    }
  });

  it('keeps a report’s open sections with its own answer', () => {
    render(<MessageBubble message={answer({ metadata: { research: { phase: 'complete' } } })} />);

    expect(mockReportSections.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ content: 'The answer.', messageId: 'answer-7' }),
    );
  });
});

describe('a finished report jumping to the section a person taps', () => {
  type MeasureDone = (x: number, y: number, width: number, height: number) => void;
  type Measured = { props: { testID?: string } };
  const MockedView = jest.requireMock<{
    default: { prototype: { measureInWindow: (this: Measured, done: MeasureDone) => void } };
  }>('react-native/Libraries/Components/View/View').default;
  const REPORT = ['# Report', '## Findings', 'Text.', '## Risks', 'More.', '## Next steps'].join(
    '\n',
  );
  const report = (overrides: Partial<ChatMessage> = {}) =>
    answer({ content: REPORT, metadata: { research: { phase: 'complete' } }, ...overrides });

  function ScrollingChat({
    list,
    children,
  }: {
    list: ScrollableChatList;
    children: React.ReactNode;
  }) {
    const viewport = React.useRef<View>(null);
    const listRef = React.useRef<ScrollableChatList>(list);
    return (
      <View ref={viewport} testID="chat-viewport">
        <ChatScrollIntoView list={listRef} viewport={viewport}>
          {children}
        </ChatScrollIntoView>
      </View>
    );
  }

  function lastRenderOptions(): { onHeadingLayout?: (id: string, y: number) => void } {
    return mockRenderOptions.mock.calls.at(-1)?.[0] ?? {};
  }

  function lastSections(): { content?: string; onSelectSection?: (id: string) => void } {
    return mockReportSections.mock.calls.at(-1)?.[0] ?? {};
  }

  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'cloud' });
    jest.spyOn(MockedView.prototype, 'measureInWindow').mockImplementation(function measure(
      this: Measured,
      done: MeasureDone,
    ) {
      if (this.props.testID === 'chat-viewport') done(0, 100, 320, 600);
      else if (this.props.testID === 'message-answer-body') done(0, 1200, 320, 900);
      else done(0, 0, 0, 0);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('scrolls the chat so the tapped section starts at the top', () => {
    const list = { getAbsoluteLastScrollOffset: () => 400, scrollToOffset: jest.fn() };
    render(
      <ScrollingChat list={list}>
        <MessageBubble message={report()} />
      </ScrollingChat>,
    );
    const onHeadingLayout = lastRenderOptions().onHeadingLayout;
    expect(onHeadingLayout).toEqual(expect.any(Function));
    act(() => {
      onHeadingLayout?.('report', 0);
      onHeadingLayout?.('findings', 60);
      onHeadingLayout?.('risks', 300);
      onHeadingLayout?.('next-steps', 500);
    });

    act(() => lastSections().onSelectSection?.('risks'));

    expect(list.scrollToOffset).toHaveBeenCalledWith({
      offset: 1784,
      animated: true,
      skipFirstItemOffset: true,
    });
  });

  it('leaves the chat where it is when the whole section is already on screen', () => {
    const list = { getAbsoluteLastScrollOffset: () => 400, scrollToOffset: jest.fn() };
    jest.spyOn(MockedView.prototype, 'measureInWindow').mockImplementation(function measure(
      this: Measured,
      done: MeasureDone,
    ) {
      if (this.props.testID === 'chat-viewport') done(0, 100, 320, 600);
      else if (this.props.testID === 'message-answer-body') done(0, 150, 320, 520);
      else done(0, 0, 0, 0);
    });
    render(
      <ScrollingChat list={list}>
        <MessageBubble message={report()} />
      </ScrollingChat>,
    );
    act(() => {
      lastRenderOptions().onHeadingLayout?.('risks', 300);
      lastRenderOptions().onHeadingLayout?.('next-steps', 500);
    });

    act(() => lastSections().onSelectSection?.('risks'));

    expect(list.scrollToOffset).not.toHaveBeenCalled();
  });

  it('lists only the sections the answer shows, not the source list it drops', () => {
    const withSources = [
      '# Report',
      '## Findings',
      'Tides rise twice a day [1].',
      '## Risks',
      'More.',
      '',
      '## Sources',
      '1. https://tides.example/today',
    ].join('\n');
    render(
      <ScrollingChat list={{ getAbsoluteLastScrollOffset: () => 0, scrollToOffset: jest.fn() }}>
        <MessageBubble
          message={report({
            content: withSources,
            citations: [{ url: 'https://tides.example/today', title: 'Tides' }],
          })}
        />
      </ScrollingChat>,
    );

    expect(lastSections().content).toBe(
      ['# Report', '## Findings', 'Tides rise twice a day [1].', '## Risks', 'More.'].join('\n'),
    );
  });

  it('offers no jump outside a scrolling chat or while the report is still being written', () => {
    const view = render(<MessageBubble message={report()} />);
    expect(lastSections().onSelectSection).toBeUndefined();
    expect(lastRenderOptions().onHeadingLayout).toBeUndefined();

    mockRenderOptions.mockClear();
    view.rerender(
      <ScrollingChat list={{ getAbsoluteLastScrollOffset: () => 0, scrollToOffset: jest.fn() }}>
        <MessageBubble message={report({ isStreaming: true })} />
      </ScrollingChat>,
    );
    expect(lastRenderOptions().onHeadingLayout).toBeUndefined();
  });
});

describe('what MessageBubble gives the tool timelines', () => {
  const pendingCall = {
    id: 'tool-1',
    toolCallId: 'call-1',
    name: 'mcp__github__create_issue',
    status: 'awaiting-approval' as const,
    requiresApproval: true,
  };
  const activity = {
    schemaVersion: 1,
    sessionId: 'session-1',
    turnId: 'turn-1',
    lastSequence: 0,
    status: 'completed',
    startedAtMs: 1,
    updatedAtMs: 2,
    entries: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useChatExecutionStore.setState({
      streamingConversationIds: [],
      reconnectingMessageIds: [],
    });
    jest.spyOn(executionStore, 'isApprovalTurnLive').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('never approves a pending tool call on its own', () => {
    const onResolveToolApproval = jest.fn();
    render(
      <MessageBubble
        message={answer({ toolCalls: [pendingCall] })}
        onResolveToolApproval={onResolveToolApproval}
      />,
    );

    expect(onResolveToolApproval).not.toHaveBeenCalled();
    const timeline = mockToolTimeline.mock.calls.at(-1)?.[0];
    expect(timeline.codeRunConversationId).toBe('conversation-7');
  });

  it('sends Allow for this chat and Always allow to the server as their own decisions', () => {
    const onResolveToolApproval = jest.fn();
    const view = render(
      <MessageBubble
        message={answer({ toolCalls: [pendingCall] })}
        onResolveToolApproval={onResolveToolApproval}
      />,
    );

    const timeline = mockToolTimeline.mock.calls.at(-1)?.[0];
    act(() => timeline.onAllowApprovalForChat('call-1', pendingCall.name, 'Only the docs repo'));
    act(() => timeline.onAlwaysAllowApproval('call-1', pendingCall.name, undefined));
    expect(onResolveToolApproval.mock.calls).toEqual([
      ['answer-7', 'call-1', 'approved-for-session', 'Only the docs repo'],
      ['answer-7', 'call-1', 'approved-always', undefined],
    ]);

    view.unmount();
    mockToolTimeline.mockClear();
    render(<MessageBubble message={answer({ toolCalls: [pendingCall] })} />);
    const readOnly = mockToolTimeline.mock.calls.at(-1)?.[0];
    expect(readOnly.onAllowApprovalForChat).toBeUndefined();
    expect(readOnly.onAlwaysAllowApproval).toBeUndefined();
  });

  it('gives the activity its tool calls, a turn retry once finished and the reconnecting label', () => {
    const onRetryMessage = jest.fn();
    const onResolveToolApproval = jest.fn();
    const message = answer({ toolCalls: [pendingCall], metadata: { agentActivity: activity } });
    const view = render(
      <MessageBubble
        message={message}
        onRetryMessage={onRetryMessage}
        onResolveToolApproval={onResolveToolApproval}
      />,
    );

    let props = mockActivity.mock.calls.at(-1)?.[0];
    expect(props.approvalToolCalls).toEqual([pendingCall]);
    act(() => props.onAllowApprovalForChat('call-1', pendingCall.name, undefined));
    expect(onResolveToolApproval).toHaveBeenLastCalledWith(
      'answer-7',
      'call-1',
      'approved-for-session',
      undefined,
    );
    onResolveToolApproval.mockClear();
    expect(props.statusLabel).toBeUndefined();
    act(() => props.onRetry());
    expect(onRetryMessage).toHaveBeenCalledWith('answer-7');
    expect(onResolveToolApproval).not.toHaveBeenCalled();

    act(() => useChatExecutionStore.setState({ reconnectingMessageIds: ['answer-7'] }));
    view.rerender(
      <MessageBubble
        message={{ ...message, isStreaming: true }}
        onRetryMessage={onRetryMessage}
        onResolveToolApproval={onResolveToolApproval}
      />,
    );
    props = mockActivity.mock.calls.at(-1)?.[0];
    expect(props.statusLabel).toBe('Reconnecting…');
    expect(props.onRetry).toBeUndefined();
  });

  it('gives a running activity a clock that ticks each second, and none once it settles', () => {
    jest.useFakeTimers({ now: 10_000 });
    try {
      const running = answer({
        isStreaming: true,
        metadata: { agentActivity: { ...activity, status: 'running', entries: [] } },
      });
      const view = render(<MessageBubble message={running} />);
      expect(mockActivity.mock.calls.at(-1)?.[0].nowMs).toBe(10_000);

      act(() => {
        jest.advanceTimersByTime(2_000);
      });
      expect(mockActivity.mock.calls.at(-1)?.[0].nowMs).toBe(12_000);

      view.rerender(<MessageBubble message={answer({ metadata: { agentActivity: activity } })} />);
      const rendersWhenSettled = mockActivity.mock.calls.length;
      expect(mockActivity.mock.calls.at(-1)?.[0].nowMs).toBeUndefined();
      act(() => {
        jest.advanceTimersByTime(3_000);
      });
      expect(mockActivity.mock.calls.length).toBe(rendersWhenSettled);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('what MessageBubble passes for a turn in progress and its media', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useChatExecutionStore.setState({
      streamingConversationIds: [],
      reconnectingMessageIds: [],
    });
  });

  it('shows the research phase on the status line until the report text starts', () => {
    const research = { phase: 'synthesizing', startedAt: '2026-11-14T10:00:00.000Z' };
    const view = render(
      <MessageBubble
        message={answer({ content: '', isStreaming: true, metadata: { research } })}
      />,
    );
    expect(mockStreamingIndicator.mock.calls.at(-1)?.[0].label).toBe('Writing report');

    mockStreamingIndicator.mockClear();
    view.rerender(
      <MessageBubble
        message={answer({
          content: '',
          isStreaming: true,
          metadata: { research: { ...research, label: 'Reading 12 sources' } },
        })}
      />,
    );
    expect(mockStreamingIndicator.mock.calls.at(-1)?.[0].label).toBe('Reading 12 sources');

    mockStreamingIndicator.mockClear();
    view.rerender(
      <MessageBubble
        message={answer({ content: '# Report', isStreaming: true, metadata: { research } })}
      />,
    );
    expect(mockStreamingIndicator.mock.calls.at(-1)?.[0].label).toBeUndefined();
  });

  it('keys the research run card to its own message', () => {
    const research = { phase: 'planning', startedAt: '2026-11-14T10:00:00.000Z' };
    render(<MessageBubble message={answer({ content: '', metadata: { research } })} />);
    expect(mockResearchRunCard).toHaveBeenCalled();
    expect(mockResearchRunCard.mock.calls.at(-1)?.[0]).toMatchObject({ messageId: 'answer-7' });
  });

  it('keeps the research phase alive beside a finished activity row', () => {
    const agentActivity = {
      schemaVersion: 1,
      sessionId: 'session-1',
      turnId: 'turn-1',
      lastSequence: 0,
      status: 'completed',
      startedAtMs: 1,
      updatedAtMs: 2,
      entries: [],
    };
    render(
      <MessageBubble
        message={answer({
          content: '',
          isStreaming: true,
          metadata: { agentActivity, research: { phase: 'synthesizing' } },
        })}
      />,
    );
    expect(mockActivity.mock.calls.at(-1)?.[0].statusLabel).toBe('Writing report');
    expect(mockStreamingIndicator.mock.calls.at(-1)?.[0].label).toBe('Writing report');
  });

  it('frames a generating image like the finished one, so the row does not jump', () => {
    render(
      <MessageBubble
        message={answer({
          content: '',
          isGeneratingImage: true,
          imageGenStatus: 'generating',
          imageAspectRatio: '16:9',
        })}
      />,
    );
    const progress = mockImageProgress.mock.calls.at(-1)?.[0];
    expect(progress.aspectRatio).toBe('16:9');
    expect(progress.width).toEqual(expect.any(Number));
    expect(progress.width).toBeGreaterThan(0);
  });

  it('gives the image its earlier versions and opens the version that is showing', () => {
    render(
      <MessageBubble
        message={answer({
          content: '',
          type: 'image',
          imageUrl: 'https://cdn.example.com/fox-2.png',
          imageGenPrompt: 'a red fox, at night',
          metadata: {
            imageVersions: [
              { imageUrl: 'https://cdn.example.com/fox-1.png', prompt: 'a red fox', aspect: '1:1' },
            ],
          },
        })}
      />,
    );
    const image = mockGeneratedImage.mock.calls.at(-1)?.[0];
    expect(image.previousVersions).toEqual([
      { imageUrl: 'https://cdn.example.com/fox-1.png', prompt: 'a red fox', aspect: '1:1' },
    ]);

    act(() => image.onPress('https://cdn.example.com/fox-1.png'));
    let viewer = mockViewer.mock.calls.at(-1)?.[0];
    expect(viewer.images).toEqual([
      {
        url: 'https://cdn.example.com/fox-1.png',
        kind: 'generated',
        prompt: 'a red fox',
        aspectRatio: '1:1',
        allowEphemeral: false,
      },
    ]);
    expect(viewer.initialIndex).toBe(0);

    act(() => viewer.onClose());
    act(() =>
      mockGeneratedImage.mock.calls.at(-1)?.[0].onPress('https://cdn.example.com/fox-2.png'),
    );
    viewer = mockViewer.mock.calls.at(-1)?.[0];
    expect(viewer.images[0].url).toBe('https://cdn.example.com/fox-2.png');
  });

  it('gives no earlier versions to an image that has none', () => {
    render(
      <MessageBubble
        message={answer({ content: '', type: 'image', imageUrl: 'https://cdn.example.com/a.png' })}
      />,
    );
    expect(mockGeneratedImage.mock.calls.at(-1)?.[0].previousVersions).toEqual([]);
  });

  it('tells the renderer an answer was stopped, so its open tail is repaired', () => {
    const view = render(
      <MessageBubble
        message={answer({ content: 'See **this', metadata: { finishReason: 'stopped' } })}
      />,
    );
    expect(mockRenderOptions.mock.calls.at(-1)?.[0].stopped).toBe(true);

    view.rerender(<MessageBubble message={answer({ content: 'See **this', isStreaming: true })} />);
    expect(mockRenderOptions.mock.calls.at(-1)?.[0].stopped).toBeUndefined();
  });

  it('drops the source list the answer repeats at its end and keeps its markers linked', () => {
    render(
      <MessageBubble
        message={answer({
          content: [
            'Tides rise twice a day [2].',
            '',
            'Sources:',
            '2. https://tides.example/today',
          ].join('\n'),
          citations: [
            { url: 'https://moon.example/phase', title: 'Moon' },
            { url: 'https://tides.example/today', title: 'Tides' },
          ],
        })}
      />,
    );
    expect(screen.getByTestId('draft-scope').props.children).toBe(
      'Tides rise twice a day [2].|answer-7|save',
    );
    expect(mockRenderOptions.mock.calls.at(-1)?.[0].citations).toHaveLength(2);
  });

  it('renumbers markers to the turn’s sources when the answer listed them in another order', () => {
    const content = [
      'Tides rise twice a day [1].',
      '',
      '## References',
      '1. https://tides.example/today',
    ].join('\n');
    render(
      <MessageBubble
        message={answer({
          content,
          citations: [
            { url: 'https://moon.example/phase', title: 'Moon' },
            { url: 'https://tides.example/today', title: 'Tides' },
          ],
        })}
      />,
    );
    expect(screen.getByTestId('draft-scope').props.children).toBe(
      'Tides rise twice a day [2].|answer-7|save',
    );
  });

  it('links no markers when the answer’s own list names a page the turn never found', () => {
    render(
      <MessageBubble
        message={answer({
          content: ['A fact [1].', '', 'Sources:', '1. https://elsewhere.example/x'].join('\n'),
          citations: [{ url: 'https://tides.example/today', title: 'Tides' }],
        })}
      />,
    );
    const options = mockRenderOptions.mock.calls.at(-1)?.[0];
    expect(options.citations).toBeUndefined();
    expect(options.trustedImageUrls).toEqual(['https://tides.example/today']);
    expect(screen.getByTestId('draft-scope').props.children).toBe('A fact [1].|answer-7|save');
  });

  it('drops a trailing line of bare markers and keeps a person’s message as written', () => {
    const view = render(<MessageBubble message={answer({ content: 'The answer.\n\n[1][2]' })} />);
    expect(screen.getByTestId('draft-scope').props.children).toBe('The answer.|answer-7|save');
    view.unmount();

    render(
      <MessageBubble
        message={answer({ id: 'question-7', role: 'user', content: 'Why?\n\n[1][2]' })}
      />,
    );
    expect(screen.getByTestId('user-message-text')).toHaveTextContent('Why? [1][2]', {
      normalizeWhitespace: true,
    });
  });

  it('trusts the images of pages this turn searched and cited', () => {
    render(
      <MessageBubble
        message={answer({
          metadata: {
            searchResults: {
              query: 'tides',
              results: [{ title: 'Tides', url: 'https://tides.example/today' }],
            },
            citations: [
              { type: 'web_search_result_location', url: 'https://cited.example/p', title: 'P' },
            ],
          },
        })}
      />,
    );
    expect(mockRenderOptions.mock.calls.at(-1)?.[0].trustedImageUrls).toEqual([
      'https://tides.example/today',
      'https://cited.example/p',
    ]);
  });

  it('passes no trusted images when the turn fetched nothing', () => {
    render(<MessageBubble message={answer()} />);
    expect(mockRenderOptions.mock.calls.at(-1)?.[0].trustedImageUrls).toBeUndefined();
  });

  it('shows no failure banner when the turn ended because the person declined a tool', () => {
    const declined = {
      id: 'tool-1',
      toolCallId: 'call-1',
      name: 'mcp__github__create_issue',
      status: 'failed' as const,
      requiresApproval: true,
      approvalDecision: 'rejected' as const,
    };
    const view = render(
      <MessageBubble
        message={answer({ toolCalls: [declined], metadata: { finishReason: 'error' } })}
        onRetryMessage={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('stream-failure-notice-text')).toBeNull();

    view.rerender(
      <MessageBubble
        message={answer({
          toolCalls: [{ ...declined, approvalDecision: 'approved' as const }],
          metadata: { finishReason: 'error' },
        })}
        onRetryMessage={jest.fn()}
      />,
    );
    expect(screen.getByTestId('stream-failure-notice-text')).toBeOnTheScreen();
  });
});

describe('the notices web shows under a finished answer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('says when the turn moved to another model, once it is done', () => {
    const metadata = { movedFromModel: SYNTHETIC_LOCAL_MODEL_ID, movedReason: 'rate_limited' };
    const view = render(
      <MessageBubble
        message={answer({ model: SYNTHETIC_CLOUD_MODEL_ID, isStreaming: true, metadata })}
      />,
    );
    expect(screen.queryByTestId('model-escalation-receipt')).toBeNull();

    view.rerender(
      <MessageBubble message={answer({ model: SYNTHETIC_CLOUD_MODEL_ID, metadata })} />,
    );
    const expected = resolveModelEscalation({
      movedFromModelId: SYNTHETIC_LOCAL_MODEL_ID,
      movedReason: 'rate_limited',
      servedModelId: SYNTHETIC_CLOUD_MODEL_ID,
    })?.line;
    expect(expected?.startsWith(MODEL_ESCALATION_PREFIX)).toBe(true);
    expect(screen.getByTestId('model-escalation-receipt')).toHaveTextContent(expected!);
  });

  it('says nothing about a move when the turn stayed on its model', () => {
    render(
      <MessageBubble
        message={answer({
          model: SYNTHETIC_CLOUD_MODEL_ID,
          metadata: { movedFromModel: SYNTHETIC_CLOUD_MODEL_ID },
        })}
      />,
    );
    expect(screen.queryByTestId('model-escalation-receipt')).toBeNull();
  });

  it('says how many secrets were removed and can be dismissed', () => {
    render(<MessageBubble message={answer({ metadata: { secretRedactionCount: 2 } })} />);
    expect(screen.getByTestId('secret-redaction-notice')).toBeOnTheScreen();
    expect(screen.getByText(describeSecretRedactionNotice(2)!)).toBeOnTheScreen();
    const dismiss = screen.getByRole('button', { name: 'Dismiss secret redaction notice' });
    expect(dismiss).toHaveStyle({ minHeight: 44 });
    fireEvent.press(dismiss);
    expect(screen.queryByTestId('secret-redaction-notice')).toBeNull();
  });

  it('says the answer used no web search when the person asked for one, with a way to search', () => {
    const onRetryMessage = jest.fn();
    render(
      <MessageBubble
        message={answer({ metadata: { webSearchRequested: true, webSearchAskedInText: true } })}
        onRetryMessage={onRetryMessage}
      />,
    );
    expect(
      screen.getByText(
        "The answer used the model's own knowledge. Ask to search the web for current sources.",
      ),
    ).toBeOnTheScreen();
    fireEvent.press(
      screen.getByRole('button', { name: 'Send this turn again with a web search required' }),
    );
    expect(onRetryMessage).toHaveBeenCalledWith('answer-7');
  });

  it('says a web search found nothing, and offers Retry', () => {
    const agentActivity = {
      schemaVersion: 1,
      sessionId: 'session-1',
      turnId: 'turn-1',
      lastSequence: 1,
      status: 'completed',
      startedAtMs: 1,
      updatedAtMs: 2,
      entries: [
        {
          id: 'tool-1',
          kind: 'tool',
          toolCallId: 'call-1',
          name: 'web_search',
          category: 'web-search',
          summary: 'Searched the web',
          status: 'completed',
          startedAtMs: 1,
          completedAtMs: 2,
        },
      ],
    };
    render(
      <MessageBubble
        message={answer({
          metadata: { webSearchRequested: true, webSearchAskedInText: true, agentActivity },
        })}
        onRetryMessage={jest.fn()}
      />,
    );
    expect(
      screen.getByText(
        "Web search didn't return results for this turn, so the answer relies on the model's own knowledge.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Retry this response with web search' }),
    ).toBeOnTheScreen();
  });

  it('counts an older answer’s web search tool as a search that found nothing', () => {
    render(
      <MessageBubble
        message={answer({
          toolCalls: [{ id: 'call-1', name: 'web_search', status: 'completed' }],
          metadata: { webSearchRequested: true, webSearchAskedInText: true },
        })}
        onRetryMessage={jest.fn()}
      />,
    );
    expect(
      screen.getByText(
        "Web search didn't return results for this turn, so the answer relies on the model's own knowledge.",
      ),
    ).toBeOnTheScreen();
  });

  it('shows no search notice when web search was only a standing setting', () => {
    render(<MessageBubble message={answer({ metadata: { webSearchRequested: true } })} />);
    expect(screen.queryByText(/search the web for current sources/)).toBeNull();
  });
});

describe('an answer the person ended by declining the web search', () => {
  const NOT_PERFORMED =
    'Web search was not approved or available, so this answer could not be verified.';

  function searchActivity(decision: 'approved' | 'denied') {
    const events: AgentEventEnvelope['event'][] = [
      {
        type: 'approval-requested',
        approvalId: 'approval-1',
        toolCallId: 'call-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Look up the weather',
        input: { query: 'weather in Paris' },
      },
      { type: 'approval-resolved', approvalId: 'approval-1', decision },
      {
        type: 'tool-execution-end',
        toolCallId: 'call-1',
        name: 'web_search',
        output:
          decision === 'denied'
            ? 'The user denied permission to run this tool.'
            : 'Tool "web_search" is not available and was not executed.',
        isError: true,
        elapsedMs: 0,
      },
      {
        type: 'error',
        code: WEB_SEARCH_NOT_PERFORMED_CODE,
        message: NOT_PERFORMED,
        retryable: false,
      },
      { type: 'stop', reason: 'error' },
    ];
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

  function declinedAnswer(decision: 'approved' | 'denied') {
    return answer({
      content: [
        'Here is a page.',
        '```html',
        EXPLICIT_ARTIFACT_MARKER_FOR.html,
        '<!DOCTYPE html>',
        '<html><body>',
        '',
      ].join('\n'),
      metadata: {
        webSearchRequested: true,
        webSearchAskedInText: true,
        agentActivity: searchActivity(decision),
        streamError: { code: WEB_SEARCH_NOT_PERFORMED_CODE, message: NOT_PERFORMED },
      },
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('marks its unfinished artifact Stopped, not Failed, and says no search found nothing', () => {
    render(<MessageBubble message={declinedAnswer('denied')} onRetryMessage={jest.fn()} />);
    expect(screen.getByText('Stopped')).toBeOnTheScreen();
    expect(screen.queryByText('Failed')).toBeNull();
    expect(screen.queryByText(/Web search didn't return results/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Retry this response with web search' }),
    ).toBeNull();
  });

  it('shows no search notice when a declined search ends in an answer with no error', () => {
    const events: AgentEventEnvelope['event'][] = [
      {
        type: 'approval-requested',
        approvalId: 'approval-1',
        toolCallId: 'call-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Look up the weather',
        input: { query: 'weather in Paris' },
      },
      { type: 'approval-resolved', approvalId: 'approval-1', decision: 'denied' },
      {
        type: 'tool-execution-end',
        toolCallId: 'call-1',
        name: 'web_search',
        output: 'The user denied permission to run this tool.',
        isError: false,
        elapsedMs: 0,
      },
      { type: 'text-delta', delta: 'Here is what I know without searching.' },
      { type: 'stop', reason: 'end-turn' },
    ];
    let agentActivity: AgentActivityState | undefined;
    events.forEach((event, sequence) => {
      agentActivity = applyAgentActivityEvent(agentActivity, {
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        sessionId: 'session-1',
        turnId: 'turn-1',
        sequence,
        emittedAtMs: 1_000 + sequence * 500,
        event,
      } as AgentEventEnvelope);
    });
    render(
      <MessageBubble
        message={answer({
          content: 'Here is what I know without searching.',
          metadata: { webSearchRequested: true, webSearchAskedInText: true, agentActivity },
        })}
        onRetryMessage={jest.fn()}
      />,
    );
    expect(screen.getByTestId('message-answer-body')).toBeOnTheScreen();
    expect(screen.queryByText(/Web search didn't return results/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Retry this response with web search' }),
    ).toBeNull();
  });

  it('still marks the artifact Failed when an approved search could not run', () => {
    render(<MessageBubble message={declinedAnswer('approved')} onRetryMessage={jest.fn()} />);
    expect(screen.getByText('Failed')).toBeOnTheScreen();
  });
});
