/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { render } from '@testing-library/react-native';

const mockGeneratedImage = jest.fn();

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
jest.mock('@/src/features/chat/components/GeneratedImage', () => ({
  GeneratedImage: (props: Record<string, unknown>) => {
    mockGeneratedImage(props);
    return null;
  },
}));

import { ArtifactsGalleryScreen } from '../index';
import { useArtifactStore } from '../store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { spacing } from '@/src/ui/theme/tokens';
import type { MobileArtifact } from '../types';

const IMAGE: MobileArtifact = {
  id: 'generated-image-msg-9',
  title: 'Image: a lighthouse at dusk',
  kind: 'image',
  language: 'PNG',
  content: '/api/files/3f9a0c1e-1b2c-4d5e-8f90-a1b2c3d4e5f6',
  ageLabel: 'just now',
  sourceLabel: 'AGI Cloud',
  accentColor: '#da7756',
  previewLines: ['a lighthouse at dusk'],
  provenance: { scope: 'cloud', ownerId: 'user-1' },
};

function WindowWidth({ onWidth }: { onWidth: (width: number) => void }) {
  onWidth(useWindowDimensions().width);
  return null;
}

describe('image artifact viewer layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useArtifactStore.setState({ artifacts: [], cloudArtifacts: [], cloudArtifactsOwnerId: null });
  });

  it('centres the picture with equal side margins instead of a fixed width pinned left', () => {
    let windowWidth = 0;
    useArtifactStore.setState({ artifacts: [IMAGE] });
    const screen = render(
      <>
        <WindowWidth onWidth={(width) => (windowWidth = width)} />
        <ArtifactsGalleryScreen initialArtifactId={IMAGE.id} />
      </>,
    );

    const content = StyleSheet.flatten(screen.getByTestId('artifact-preview-content').props.style);
    expect(content?.alignItems).toBe('center');

    const scroll = StyleSheet.flatten(
      screen.getByTestId('artifact-preview-scroll').props.contentContainerStyle,
    );
    expect(scroll?.paddingLeft ?? scroll?.paddingHorizontal).toBe(spacing.xl);
    expect(scroll?.paddingRight ?? scroll?.paddingHorizontal).toBe(spacing.xl);

    expect(mockGeneratedImage).toHaveBeenCalled();
    const { width } = mockGeneratedImage.mock.calls.at(-1)?.[0] as { width: number };
    expect(width).toBe(windowWidth - 2 * spacing.xl);
  });
});
