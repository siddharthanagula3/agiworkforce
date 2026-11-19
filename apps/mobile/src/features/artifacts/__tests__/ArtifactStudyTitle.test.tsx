/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

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
jest.mock('react-native-webview', () => ({ WebView: () => null }));
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
import { useArtifactStore } from '../store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import type { MobileArtifact } from '../types';

const QUIZ_CONTENT = [
  '<!-- @artifact -->',
  '~~~quiz',
  '{"title":"Photosynthesis check","questions":[{"type":"multiple_choice","question":"Where does it happen?","options":["Leaf","Root"],"answer":0}]}',
  '~~~',
].join('\n');

function studySet(title: string): MobileArtifact {
  return {
    id: 'study-set-1',
    messageId: 'msg-study',
    title,
    kind: 'document',
    language: 'markdown',
    content: QUIZ_CONTENT,
    ageLabel: 'just now',
    sourceLabel: 'Chat',
    accentColor: '#000001',
    previewLines: [title],
    provenance: { scope: 'cloud', ownerId: 'user-1' },
  };
}

describe('a study set opened from the Artifacts gallery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useArtifactStore.setState({ artifacts: [], cloudArtifacts: [], cloudArtifactsOwnerId: null });
  });

  it('is titled by its own title in the viewer header, never by a stored fence line', () => {
    useArtifactStore.setState({ artifacts: [studySet('~~~quiz')] });
    const screen = render(<ArtifactsGalleryScreen />);

    fireEvent.press(screen.getByLabelText(/^Open artifact ~~~quiz/));

    expect(screen.getByLabelText('Photosynthesis check · MARKDOWN')).toBeTruthy();
    expect(screen.queryByLabelText('~~~quiz · MARKDOWN')).toBeNull();
  });

  it('is titled Study set when the study set has no title of its own', () => {
    const untitled = QUIZ_CONTENT.replace('"title":"Photosynthesis check",', '');
    useArtifactStore.setState({ artifacts: [{ ...studySet('~~~quiz'), content: untitled }] });
    const screen = render(<ArtifactsGalleryScreen />);

    fireEvent.press(screen.getByLabelText(/^Open artifact/));

    expect(screen.getByLabelText('Study set · MARKDOWN')).toBeTruthy();
    expect(screen.queryByLabelText('~~~quiz · MARKDOWN')).toBeNull();
  });

  it('keeps the stored title for an artifact that is not a study set', () => {
    useArtifactStore.setState({
      artifacts: [{ ...studySet('Lesson plan'), content: '# Lesson plan\n\nWeek one.' }],
    });
    const screen = render(<ArtifactsGalleryScreen />);

    fireEvent.press(screen.getByLabelText(/^Open artifact Lesson plan/));

    expect(screen.getByLabelText('Lesson plan · MARKDOWN')).toBeTruthy();
  });
});
