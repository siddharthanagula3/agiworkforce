/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => {
  const colors = {
    teal: '#21808D',
    textPrimary: '#fff',
    textSecondary: '#aaa',
    textMuted: '#777',
    border: '#333',
    borderLight: '#2a2a2a',
    background: '#080808',
    surfaceBase: '#111',
    surfaceHover: '#111',
    surfaceElevated: '#1a1a1a',
    neutralSurface: '#242424',
    accentSurface: '#162b31',
    agentError: '#ef4444',
    agentSuccess: '#22c55e',
    agentWarning: '#fbbf24',
    purple: '#a78bfa',
    white: '#fff',
    scrim: 'rgba(0,0,0,0.6)',
  };
  return {
    colors,
    useThemeColors: () => colors,
  };
});

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = (name: string) => (props: Record<string, unknown>) => (
    <RN.View testID={`icon-${name}`} {...props} />
  );
  return {
    Pin: factory('pin'),
    Trash2: factory('trash2'),
    X: factory('x'),
    Copy: factory('copy'),
    Check: factory('check'),
    Share2: factory('share2'),
    RefreshCw: factory('refresh-cw'),
    Code2: factory('code2'),
    Mail: factory('mail'),
    BookOpen: factory('book-open'),
    Image: factory('image'),
    FileText: factory('file-text'),
    BarChart3: factory('bar-chart'),
    Eye: factory('eye'),
    Code: factory('code'),
    Download: factory('download'),
    Globe: factory('globe'),
  };
});

jest.mock('@/services/api', () => ({
  api: { post: jest.fn() },
}));

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  return {
    __esModule: true,
    default: { View: RN.View },
    FadeIn: { duration: () => ({ duration: () => ({}) }) },
    useReducedMotion: () => false,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const RN = require('react-native');
  return {
    Swipeable: ({ children }: { children: React.ReactNode }) => <RN.View>{children}</RN.View>,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium', Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/stores/chatStore', () => ({
  useChatStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      deleteConversation: jest.fn(),
      renameConversation: jest.fn(),
      pinConversation: jest.fn(),
    }),
  ),
}));

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ hapticsEnabled: false }),
  ),
}));

jest.mock('@agiworkforce/utils/format', () => ({
  formatRelativeTime: () => '2h ago',
  truncate: (s: string, n: number) => s.slice(0, n),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('@agiworkforce/types', () => ({
  summarizeGeneratedFileBundle: () => ({
    title: 'test.py',
    fileName: 'test.py',
    kindLabel: 'Python',
    primaryUri: null,
    privacyLabel: null,
    privacyShortLabel: null,
    providerLabel: null,
    sourceSurfaceLabel: null,
    sourceSessionLabel: null,
  }),
}));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/services/fileCreation', () => ({
  shareFile: jest.fn(),
  exportToText: jest.fn().mockResolvedValue({ uri: 'file:///tmp/export.txt' }),
  exportToMarkdown: jest.fn().mockResolvedValue({ uri: 'file:///tmp/export.md' }),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: jest.fn().mockReturnValue(null),
}));

jest.mock('@/src/features/chat/components/GeneratedFileCard', () => ({
  GeneratedFileCard: jest.fn().mockReturnValue(null),
}));

import { ArtifactFullScreen } from '../src/features/chat/components/ArtifactFullScreen';
import type { Artifact } from '../types/chat';

const codeArtifact: Artifact = {
  id: 'art-snap-1',
  type: 'code',
  title: 'fibonacci.py',
  language: 'python',
  content: 'def fib(n):\n    return n if n < 2 else fib(n-1) + fib(n-2)',
};

describe('ArtifactFullScreen snapshots', () => {
  it('locks the tree without onRegenerate (no Refresh button)', () => {
    const { toJSON } = render(
      <ArtifactFullScreen artifact={codeArtifact} visible={true} onClose={jest.fn()} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('locks the tree with onRegenerate (shows Refresh button)', () => {
    const { toJSON } = render(
      <ArtifactFullScreen
        artifact={codeArtifact}
        visible={true}
        onClose={jest.fn()}
        onRegenerate={jest.fn()}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
