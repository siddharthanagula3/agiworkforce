/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Regression: the "Show performance chip in chat" setting
 * (app/(app)/settings/performance.tsx, PERF_CHIP_SHOW_KEY, default true)
 * promises "Shows tok/s and TTFT under each assistant response," but the
 * chip never rendered for ANY message. MessageBubble's render condition
 * required message.runtimeTier to be truthy — a field chatExecutionStore
 * never sets on local completions (only tokensPerSecond is populated) — so
 * PerformanceChip was unreachable regardless of the setting or of real
 * tokensPerSecond data being available.
 */

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
jest.mock('@/src/features/chat/components/ThinkingChip', () => ({ ThinkingChip: () => null }));
jest.mock('@/src/features/chat/components/InlineArtifactCard', () => ({
  InlineArtifactCard: () => null,
}));
jest.mock('@/src/features/chat/components/ArtifactFullScreen', () => ({
  ArtifactFullScreen: () => null,
}));
jest.mock('@/src/features/chat/components/ApprovalCard', () => ({ ApprovalCard: () => null }));
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
jest.mock('@/src/features/chat/components/ReportFlagButton', () => ({
  ReportFlagButton: () => null,
}));

jest.mock('@/src/features/chat/components/PerformanceChip', () => {
  const RN = require('react-native');
  return {
    PerformanceChip: (props: { tokensPerSecond?: number }) =>
      props.tokensPerSecond !== undefined ? (
        <RN.Text testID="performance-chip">{props.tokensPerSecond} tok/s</RN.Text>
      ) : null,
  };
});

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
    content: 'Hi',
    createdAt: new Date().toISOString(),
    model: 'AGI Lite',
    tokensPerSecond: 7,
    ...overrides,
  };
}

describe('MessageBubble performance chip', () => {
  beforeEach(() => {
    mockGetString.mockReset();
  });

  it('renders the chip when tokensPerSecond is present, even without runtimeTier', () => {
    mockGetString.mockReturnValue(undefined); // setting unset -> default on
    const message = makeMessage(); // no runtimeTier set — matches real chatExecutionStore output

    const { getByTestId } = render(<MessageBubble message={message} />);

    expect(getByTestId('performance-chip')).toBeTruthy();
  });

  it('does not render the chip when the user has turned the setting off', () => {
    mockGetString.mockReturnValue('false');
    const message = makeMessage();

    const { queryByTestId } = render(<MessageBubble message={message} />);

    expect(queryByTestId('performance-chip')).toBeNull();
  });

  it('does not render the chip when isStreaming is true', () => {
    mockGetString.mockReturnValue(undefined);
    const message = makeMessage({ isStreaming: true });

    const { queryByTestId } = render(<MessageBubble message={message} />);

    expect(queryByTestId('performance-chip')).toBeNull();
  });
});
