/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@clerk/expo', () => ({ getClerkInstance: jest.fn() }));
jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn().mockResolvedValue(true) }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);
jest.mock('@react-navigation/native', () => ({
  DrawerActions: { openDrawer: jest.fn(() => ({ type: 'OPEN_DRAWER' })) },
  useNavigation: () => ({ getParent: () => null, dispatch: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useNavigation: () => ({ getParent: () => null, dispatch: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/services/api', () => ({
  ...jest.requireActual('@/services/api'),
  api: {
    ...jest.requireActual('@/services/api').api,
    post: jest.fn(),
    get: jest.fn().mockResolvedValue({ artifacts: [], workspace: null }),
  },
}));
jest.mock('@/src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: () => null,
}));
jest.mock('@/src/features/chat/components/GeneratedImage', () => ({
  GeneratedImage: () => null,
}));

import { ArtifactsGalleryScreen } from '../index';
import {
  canonicalToMobileArtifact,
  deriveAndMapToMobileArtifacts,
  generatedImageToMobileArtifact,
  useArtifactStore,
} from '../store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import type { MobileArtifact } from '../types';

const THEME = {
  teal: '#000001',
  terraCotta: '#000002',
  agentThinking: '#000003',
  agentActive: '#000004',
};
const MINUTE = 60_000;

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * MINUTE).toISOString();
}

function artifactMadeAt(createdAt: string | undefined): MobileArtifact {
  return {
    id: 'derived-artifact-age',
    messageId: 'msg-age',
    title: 'Sorting helper',
    kind: 'code',
    language: 'ts',
    content: 'export function sortAll(values: number[]) {\n  return [...values].sort();\n}',
    ageLabel: 'just now',
    ...(createdAt ? { createdAt } : {}),
    sourceLabel: 'Chat',
    accentColor: THEME.teal,
    previewLines: ['export function sortAll'],
    provenance: { scope: 'cloud', ownerId: 'user-1' },
  };
}

describe('artifact card ages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useArtifactStore.setState({ artifacts: [], cloudArtifacts: [], cloudArtifactsOwnerId: null });
  });

  it('shows how long ago the artifact was made, not the label frozen when it was saved', () => {
    useArtifactStore.setState({ artifacts: [artifactMadeAt(minutesAgo(30))] });
    const screen = render(<ArtifactsGalleryScreen />);

    expect(screen.getByText('30 min ago')).toBeTruthy();
    expect(screen.queryByText('just now')).toBeNull();
    expect(screen.getByLabelText('Open artifact Sorting helper, 30 min ago')).toBeTruthy();
  });

  it('keeps the stored label for an artifact saved before its time was recorded', () => {
    useArtifactStore.setState({ artifacts: [artifactMadeAt(undefined)] });
    const screen = render(<ArtifactsGalleryScreen />);

    expect(screen.getByLabelText('Open artifact Sorting helper, just now')).toBeTruthy();
  });

  it('records when each artifact was made', () => {
    const madeAt = minutesAgo(45);
    const derived = deriveAndMapToMobileArtifacts(
      '```html\n<!-- @artifact -->\n<!DOCTYPE html>\n<title>Counter</title>\n<button>Add</button>\n```',
      'conv-1',
      'msg-1',
      madeAt,
      'Chat',
      { scope: 'local' },
    );
    expect(derived[0]?.createdAt).toBe(madeAt);
    expect(
      canonicalToMobileArtifact(
        { id: 'a-1', type: 'document', title: 'Plan', content: '# Plan' },
        madeAt,
        'Chat',
        THEME,
        { scope: 'local' },
      ).createdAt,
    ).toBe(madeAt);
    expect(
      generatedImageToMobileArtifact({
        messageId: 'msg-2',
        imagePath: '/api/files/abc',
        createdAt: madeAt,
        conversationTitle: 'Chat',
        provenance: { scope: 'local' },
        accentColor: THEME.terraCotta,
      }).createdAt,
    ).toBe(madeAt);
  });
});
