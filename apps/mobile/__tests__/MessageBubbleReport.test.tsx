/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
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
    renderMarkdownContent: (content: string) => <RN.Text>{content}</RN.Text>,
  };
});

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const fadeBuilder = { duration: () => ({ springify: () => undefined }) };
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
  return { Image: (props: Record<string, unknown>) => <RN.View testID="expo-image" {...props} /> };
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
jest.mock('@/src/features/chat/components/ThinkingChip', () => ({ ThinkingChip: () => null }));
jest.mock('@/src/features/chat/components/InlineArtifactCard', () => ({
  InlineArtifactCard: () => null,
}));
jest.mock('@/src/features/chat/components/ArtifactFullScreen', () => ({
  ArtifactFullScreen: () => null,
}));
jest.mock('@/src/features/chat/components/StatusStep', () => ({ StatusStep: () => null }));
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
jest.mock('@/src/features/chat/components/ProvenanceFooter', () => ({
  ProvenanceFooter: () => null,
}));
const mockReportProps = jest.fn();
jest.mock('@/src/features/chat/components/ReportFlagButton', () => {
  const RN = require('react-native');
  return {
    ReportSheet: (props: Record<string, unknown>) => {
      mockReportProps(props);
      return <RN.View testID="report-sheet" />;
    },
  };
});
const mockGeneratedVideo = jest.fn();
jest.mock('@/src/features/chat/components/GeneratedVideo', () => ({
  GeneratedVideo: (props: Record<string, unknown>) => {
    mockGeneratedVideo(props);
    return null;
  },
}));

jest.mock('@/src/features/chat/components/PerformanceChip', () => ({
  PerformanceChip: () => null,
}));

const mockGetString = jest.fn();
jest.mock('@/lib/mmkv', () => ({
  storage: { getString: (key: string) => mockGetString(key) },
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { MessageBubble } from '@/src/features/chat/components/MessageBubble';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-1',
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function chooseReportFromMore(): void {
  fireEvent.press(screen.getByRole('button', { name: /^More message actions for / }));
  const menu = screen
    .UNSAFE_getAllByType(Modal)
    .find((modal) => modal.props.visible && modal.props.onDismiss);
  fireEvent.press(screen.getByTestId('message-action-report'));
  act(() => menu!.props.onDismiss());
}

describe('MessageBubble report control', () => {
  beforeEach(() => {
    mockGetString.mockReset();
    mockReportProps.mockReset();
  });

  it('offers Report on an image-only assistant turn and sends the image reference', () => {
    render(
      <MessageBubble
        message={makeMessage({
          type: 'image',
          imageUrl: 'https://cdn.example.com/img-1.png',
          revisedPrompt: 'a red fox',
        })}
      />,
    );

    expect(screen.queryByText('Report')).toBeNull();
    expect(mockReportProps).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }));

    chooseReportFromMore();

    expect(mockReportProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        target: expect.objectContaining({
          messageId: 'm-1',
          contentExcerpt: 'a red fox',
          asset: { kind: 'image', url: 'https://cdn.example.com/img-1.png' },
        }),
      }),
    );
  });

  it('reports a text answer under its own conversation, not under the message id', () => {
    render(
      <MessageBubble
        message={makeMessage({ conversationId: 'c-9', content: 'An answer worth reporting.' })}
      />,
    );

    chooseReportFromMore();

    expect(mockReportProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        target: expect.objectContaining({
          messageId: 'm-1',
          conversationId: 'c-9',
          subject: { kind: 'chat-message', id: 'm-1' },
        }),
      }),
    );
  });

  it('offers Report on a video-only assistant turn and sends the video reference', () => {
    render(
      <MessageBubble
        message={makeMessage({ type: 'video', videoUrl: 'https://cdn.example.com/v-1.mp4' })}
      />,
    );

    expect(mockReportProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          asset: { kind: 'video', url: 'https://cdn.example.com/v-1.mp4' },
        }),
      }),
    );
    expect(mockGeneratedVideo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reportTarget: expect.objectContaining({
          messageId: 'm-1',
          asset: { kind: 'video', url: 'https://cdn.example.com/v-1.mp4' },
        }),
      }),
    );
  });

  it('keeps inline image bytes on the device', () => {
    render(
      <MessageBubble
        message={makeMessage({ type: 'image', imageUrl: 'data:image/png;base64,AAAA' })}
      />,
    );

    expect(mockReportProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ asset: { kind: 'image', url: 'data:image/png;base64' } }),
      }),
    );
  });

  it('hides Report on an empty assistant turn and while streaming', () => {
    const { rerender } = render(<MessageBubble message={makeMessage()} />);
    expect(screen.queryByTestId('report-sheet')).toBeNull();
    expect(screen.queryByRole('button', { name: /^More message actions for / })).toBeNull();

    rerender(
      <MessageBubble
        message={makeMessage({ imageUrl: 'https://cdn.example.com/img-1.png', isStreaming: true })}
      />,
    );
    expect(screen.queryByTestId('report-sheet')).toBeNull();
    expect(screen.queryByRole('button', { name: /^More message actions for / })).toBeNull();
  });
});
