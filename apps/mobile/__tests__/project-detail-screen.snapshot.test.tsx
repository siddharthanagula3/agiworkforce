/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Round-17 mobile snapshot — project-detail screen.
 *
 * Locks the RN tree shape of the `(app)/projects/[id].tsx` screen landed in
 * round 16. Mirrors the mock pattern used in `shared-primitives.snapshot.test.tsx`
 * + `onboarding.test.tsx`. Discharges the visual-verification gap for the
 * mobile surface — RN doesn't have a headless PNG pipeline in this repo, so
 * a frozen RN tree is the closest structural-parity check we can run in CI.
 *
 * Three variants: success state (rendered ProjectHeader), local-only fallback
 * (FEATURES.auth=false → no-auth error), and loading state.
 *
 * 2026-05-22 round-17 capture sweep.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDispatch = jest.fn();

let mockSearchParams: { id?: string } = { id: 'proj_snapshot' };
let mockFeaturesAuth = true;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    canGoBack: () => false,
    back: mockBack,
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ dispatch: mockDispatch }),
  DrawerActions: { openDrawer: () => ({ type: 'OPEN_DRAWER' }) },
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => {
    const { View } = require('react-native');
    return <View {...rest}>{children}</View>;
  },
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = (name: string) => (props: Record<string, unknown>) => (
    <RN.View testID={`icon-${name}`} {...props} />
  );
  return {
    ArrowLeft: factory('arrow-left'),
    Clock: factory('clock'),
    FileText: factory('file-text'),
    Folder: factory('folder'),
    KeyRound: factory('key-round'),
    Lock: factory('lock'),
    LogIn: factory('log-in'),
    Menu: factory('menu'),
    MessageSquare: factory('message-square'),
    Plus: factory('plus'),
    Trash2: factory('trash-2'),
    Users: factory('users'),
  };
});

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => ({
    background: '#000',
    textPrimary: '#fff',
    textSecondary: '#aaa',
    textMuted: '#777',
    border: '#333',
    surfaceElevated: '#1a1a1a',
    surfaceOverlay: '#0e0e0e',
    teal: '#10b981',
  }),
  colors: {
    textPrimary: '#fff',
    textSecondary: '#aaa',
    textMuted: '#777',
    border: '#333',
    surfaceElevated: '#1a1a1a',
    surfaceOverlay: '#0e0e0e',
  },
}));

jest.mock('@/lib/v1FeatureFlags', () => ({
  get FEATURES() {
    return { auth: mockFeaturesAuth };
  },
}));

const mockFetchProject = jest.fn();
jest.mock('@/src/features/projects/service', () => ({
  fetchProject: (id: string) => mockFetchProject(id),
}));

jest.mock('@/src/features/projects/store', () => ({
  useProjectStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      projects: [{ id: 'proj_snapshot', name: 'Snapshot project', sources: [] }],
      activeProjectId: null,
      setActiveProject: jest.fn(),
      addSource: jest.fn(),
      removeSource: jest.fn(),
    }),
}));

jest.mock('@/stores/chatStore', () => ({
  useChatMessageStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ conversations: [] }),
}));

import ProjectDetailScreen from '@/app/(app)/projects/[id]';

const FIXTURE_PROJECT = {
  id: 'proj_snapshot',
  ownerUserId: 'user_1',
  name: 'Snapshot project',
  description: 'Stays on this device.',
  defaultPrivacyMode: 'local' as const,
  defaultProviderMode: 'Local' as const,
  allowedSurfaces: ['web', 'desktop', 'mobile'] as Array<'web' | 'desktop' | 'mobile'>,
  knowledgeFileCount: 2,
  memberCount: 1,
  importedFrom: 'manual' as const,
  accentColor: 'emerald' as const,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-20T00:00:00Z',
};

describe('Mobile project-detail screen snapshots (round-17)', () => {
  beforeEach(() => {
    mockSearchParams = { id: 'proj_snapshot' };
    mockFeaturesAuth = true;
    mockFetchProject.mockReset();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockBack.mockReset();
    mockDispatch.mockReset();
  });

  it('locks the success tree after fetchProject resolves', async () => {
    mockFetchProject.mockResolvedValueOnce(FIXTURE_PROJECT);
    const { toJSON, getByTestId } = render(<ProjectDetailScreen />);
    await waitFor(() => getByTestId('project-detail-scroll'));
    expect(toJSON()).toMatchSnapshot();
  });

  it('locks the local-only fallback tree when FEATURES.auth is false', async () => {
    mockFeaturesAuth = false;
    const { toJSON, getByTestId } = render(<ProjectDetailScreen />);
    await waitFor(() => getByTestId('project-detail-local-fallback'));
    expect(toJSON()).toMatchSnapshot();
  });

  it('locks the no-id empty tree when no params are provided', () => {
    mockSearchParams = {};
    const { toJSON } = render(<ProjectDetailScreen />);
    expect(toJSON()).toMatchSnapshot();
  });
});
