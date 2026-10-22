/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
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
    renderMarkdownContent: (content: string) => <RN.Text>{content}</RN.Text>,
  };
});

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const fadeBuilder = { duration: () => ({ springify: () => undefined }) };
  return {
    __esModule: true,
    default: { View: RN.View },
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
    ReportFlagButton: (props: Record<string, unknown>) => {
      mockReportProps(props);
      return <RN.View testID="report-flag-button" />;
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

    expect(screen.getByTestId('report-flag-button')).toBeTruthy();
    expect(mockReportProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messageId: 'm-1',
        contentExcerpt: 'a red fox',
        asset: { kind: 'image', url: 'https://cdn.example.com/img-1.png' },
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
      expect.objectContaining({ asset: { kind: 'video', url: 'https://cdn.example.com/v-1.mp4' } }),
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
      expect.objectContaining({ asset: { kind: 'image', url: 'data:image/png;base64' } }),
    );
  });

  it('hides Report on an empty assistant turn and while streaming', () => {
    const { rerender } = render(<MessageBubble message={makeMessage()} />);
    expect(screen.queryByTestId('report-flag-button')).toBeNull();

    rerender(
      <MessageBubble
        message={makeMessage({ imageUrl: 'https://cdn.example.com/img-1.png', isStreaming: true })}
      />,
    );
    expect(screen.queryByTestId('report-flag-button')).toBeNull();
  });
});
