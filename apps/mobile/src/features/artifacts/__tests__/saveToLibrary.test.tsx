/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPost = jest.fn();

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
    post: (...args: unknown[]) => mockPost(...args),
    get: jest.fn().mockResolvedValue({ artifacts: [], workspace: null }),
  },
}));

import { artifactLibraryFile } from '@agiworkforce/cloud-contracts';
import { ArtifactsGalleryScreen } from '../index';
import { canSaveArtifactToLibrary } from '../libraryService';
import { useArtifactStore } from '../store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import type { MobileArtifact } from '../types';

const CLOUD_DOC: MobileArtifact = {
  id: 'cloud-doc',
  title: 'Launch plan',
  kind: 'document',
  content: '# Launch plan\n\nShip it.',
  ageLabel: 'just now',
  sourceLabel: 'Cloud chat',
  accentColor: '#21808d',
  previewLines: ['# Launch plan'],
  provenance: { scope: 'cloud', ownerId: 'user-1' },
};

describe('save an artifact to the Library from mobile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useArtifactStore.setState({ artifacts: [], cloudArtifacts: [], cloudArtifactsOwnerId: null });
  });

  it('names files the way the web Library expects', () => {
    expect(artifactLibraryFile({ title: 'Plan', type: 'document', content: 'x' })).toEqual({
      fileName: 'Plan.md',
      content: 'x',
    });
    expect(
      artifactLibraryFile({ title: 'page', type: 'code', language: 'html', content: '<p/>' }),
    ).toEqual({ fileName: 'page.html', content: '<p/>' });
    expect(
      artifactLibraryFile({ title: 'App', type: 'code', language: 'zig', content: 'const x;' })
        .fileName,
    ).toBe('App.md');
  });

  it('keeps Local artifacts out of the cloud Library', () => {
    expect(canSaveArtifactToLibrary({ ...CLOUD_DOC, provenance: { scope: 'local' } })).toBe(false);
    expect(canSaveArtifactToLibrary({ ...CLOUD_DOC, kind: 'image' })).toBe(false);
    expect(canSaveArtifactToLibrary(CLOUD_DOC)).toBe(true);
  });

  it('saves a Cloud document from the preview and confirms it', async () => {
    mockPost.mockResolvedValue({ id: 'file-1' });
    useArtifactStore.setState({ artifacts: [CLOUD_DOC] });
    const screen = render(<ArtifactsGalleryScreen initialArtifactId="cloud-doc" />);
    fireEvent.press(screen.getByLabelText('Save to Library'));
    await waitFor(() => expect(screen.getByLabelText('Saved to Library')).toBeTruthy());
    expect(mockPost).toHaveBeenCalledWith('/api/library', {
      fileName: 'Launch plan.md',
      content: '# Launch plan\n\nShip it.',
    });
  });
});
