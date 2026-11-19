/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
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
jest.mock('@/src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: () => ({ source: null, status: 'error' }),
}));
jest.mock('@/components/ui/Badge', () => ({ Badge: jest.fn(() => null) }));

import { Badge } from '@/components/ui/Badge';
import { ArtifactsGalleryScreen } from '../index';
import { useArtifactStore } from '../store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import type { MobileArtifact } from '../types';
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/features/chat/components/WorkModeSwitch';
import { LARGEST_IOS_TEXT_SCALE, setTextScale } from '@/test-utils/textScale';

const OWNER = { scope: 'cloud', ownerId: 'user-1' } as const;
const PREVIEW = ['line one', 'line two', 'line three', 'line four', 'line five', 'line six'];

const code: MobileArtifact = {
  id: 'tile-code',
  messageId: 'msg-tile',
  title: 'Sorting helper',
  kind: 'code',
  language: 'ts',
  content: PREVIEW.join('\n'),
  ageLabel: 'just now',
  createdAt: new Date().toISOString(),
  sourceLabel: 'Chat',
  accentColor: '#000001',
  previewLines: PREVIEW,
  provenance: OWNER,
};

const picture: MobileArtifact = {
  id: 'generated-image-msg-tile',
  title: 'Generated image',
  kind: 'image',
  language: 'PNG',
  content: '/api/files/abc',
  ageLabel: 'just now',
  createdAt: new Date().toISOString(),
  sourceLabel: 'Chat',
  accentColor: '#000002',
  previewLines: ['A kite'],
  provenance: OWNER,
};

describe('artifact gallery tiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useArtifactStore.setState({
      artifacts: [code, picture],
      cloudArtifacts: [],
      cloudArtifactsOwnerId: null,
    });
  });

  it('name the kind as plain text with no badge, and give pictures no kind label', () => {
    const screen = render(<ArtifactsGalleryScreen />);

    const kind = screen.getByTestId(`artifact-kind-${code.id}`);
    expect(kind.props.children).toBe('ts');
    expect(StyleSheet.flatten(kind.props.style).backgroundColor).toBeUndefined();
    expect(screen.queryByTestId(`artifact-kind-${picture.id}`)).toBeNull();
    expect(Badge).not.toHaveBeenCalled();
  });

  it('keep the preview clear of the kind label', () => {
    const screen = render(<ArtifactsGalleryScreen />);

    for (const line of PREVIEW.slice(0, 4)) expect(screen.getByText(line)).toBeTruthy();
    expect(screen.queryByText('line five')).toBeNull();
  });

  describe.each([
    ['the default text size', 1],
    ['the largest text size', LARGEST_IOS_TEXT_SCALE],
  ])('at %s', (_name, scale) => {
    const startingScale = Dimensions.get('window').fontScale;

    beforeEach(() => setTextScale(scale));
    afterEach(() => setTextScale(startingScale));

    it('start the preview below the kind label instead of under it', () => {
      const screen = render(<ArtifactsGalleryScreen />);

      const labelRow = screen.getByTestId(`artifact-kind-row-${code.id}`);
      const preview = screen.getByTestId(`artifact-preview-${code.id}`);
      expect(String(labelRow.props.className)).not.toMatch(/\babsolute\b/);
      expect(String(preview.props.className)).not.toMatch(/\babsolute\b/);
      expect(String(preview.props.className)).toMatch(/\bflex-1\b/);
      expect(String(preview.props.className)).toMatch(/\boverflow-hidden\b/);
      const tileOrder = screen
        .getByTestId(`artifact-tile-${code.id}`)
        .findAll((node) => typeof node.props.testID === 'string')
        .map((node) => node.props.testID);
      expect(tileOrder.indexOf(`artifact-kind-row-${code.id}`)).toBeGreaterThanOrEqual(0);
      expect(tileOrder.indexOf(`artifact-kind-row-${code.id}`)).toBeLessThan(
        tileOrder.indexOf(`artifact-preview-${code.id}`),
      );
    });

    it('cap the kind label the way header text is capped, on one line', () => {
      const screen = render(<ArtifactsGalleryScreen />);

      const kind = screen.getByTestId(`artifact-kind-${code.id}`);
      expect(kind.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      expect(kind.props.numberOfLines).toBe(1);
    });

    it('give the header a minimum height and a capped title so the title is never cut', () => {
      const screen = render(<ArtifactsGalleryScreen />);

      const header = screen.getByTestId('artifacts-header');
      expect(String(header.props.className)).toMatch(/\bmin-h-12\b/);
      expect(String(header.props.className)).not.toMatch(/(^|\s)h-12\b/);
      const title = screen.getByRole('header', { name: 'Artifacts' });
      expect(title.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
    });
  });
});
