import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockConnectorsReleased = jest.fn(() => true);
const mockParams: { name?: string } = {};
const mockCatalog = jest.fn();
const mockInstalled = jest.fn();
const mockBody = jest.fn();
const mockFiles = jest.fn();
const mockFileText = jest.fn();
const mockInstall = jest.fn();
const mockDelete = jest.fn();
const mockCreate = jest.fn();
const mockGuardedFetch = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: mockReplace,
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@clerk/expo', () => ({ getClerkInstance: () => null }));
jest.mock('@agiworkforce/types', () => ({
  ...jest.requireActual('@agiworkforce/types'),
  connectorsReleased: () => mockConnectorsReleased(),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, style }: { children: React.ReactNode; style?: unknown }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { View } = require('react-native');
    return <View style={style as never}>{children}</View>;
  },
}));
jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);
jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback: () => void) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));
jest.mock('@/lib/egressGuard', () => ({
  guardedFetch: (...args: unknown[]) => mockGuardedFetch(...args),
}));
jest.mock('@/services/authSession', () => ({
  getAuthHeaders: jest.fn(async () => ({ Authorization: 'Bearer token' })),
}));
jest.mock('@/services/connectors', () => ({
  fetchConnectorDirectory: jest.fn(async () => ({ connectors: [] })),
}));
jest.mock('../service', () => ({
  ...jest.requireActual('../service'),
  fetchSkillCatalog: (...args: unknown[]) => mockCatalog(...args),
  fetchInstalledSkillNames: (...args: unknown[]) => mockInstalled(...args),
  fetchSkillBody: (...args: unknown[]) => mockBody(...args),
  fetchSkillFiles: (...args: unknown[]) => mockFiles(...args),
  fetchSkillFileText: (...args: unknown[]) => mockFileText(...args),
  installSkill: (...args: unknown[]) => mockInstall(...args),
  deletePersonalSkill: (...args: unknown[]) => mockDelete(...args),
  createPersonalSkill: (...args: unknown[]) => mockCreate(...args),
}));

import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { colors as darkColors, lightColors } from '@/src/ui/theme/tokens';
import { SkillDetailScreen } from '../SkillDetailScreen';

const { importSkillFile, isTextSkillFile, skillFilePath } = jest.requireActual('../service');

const BUNDLED = {
  name: 'pdf-reader',
  description: 'Read PDFs',
  source: 'bundled',
  lifecycle: 'included',
  downloadable: true,
  requiredConnectors: ['google-drive'],
};
const PERSONAL = {
  name: 'weekly-report',
  description: 'Write my weekly report',
  source: 'personal',
  lifecycle: 'included',
  downloadable: false,
};

describe('mobile skill detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockCatalog.mockResolvedValue([BUNDLED, PERSONAL]);
    mockInstalled.mockResolvedValue(new Set());
    mockBody.mockResolvedValue('# Steps');
    mockFiles.mockResolvedValue([
      { path: 'SKILL.md', size: 7 },
      { path: 'scripts/extract.py', size: 2048 },
      { path: 'assets/logo.png', size: 4096 },
    ]);
  });

  it('shows the bundle, what it needs, and turns a catalog skill on', async () => {
    mockParams.name = 'pdf-reader';
    mockInstall.mockResolvedValue(new Set(['pdf-reader']));
    mockFileText.mockResolvedValue('print("hi")');
    const { findByText, getByLabelText } = render(<SkillDetailScreen />);

    expect(await findByText('Read PDFs')).toBeTruthy();
    expect(getByLabelText('Connect google-drive')).toBeTruthy();
    expect(getByLabelText('assets/logo.png, no preview')).toBeTruthy();

    fireEvent.press(getByLabelText('Open scripts/extract.py'));
    expect(await findByText('print("hi")')).toBeTruthy();
    expect(mockFileText).toHaveBeenCalledWith('pdf-reader', 'scripts/extract.py');

    fireEvent(getByLabelText('Turned on'), 'valueChange', true);
    await waitFor(() => expect(mockInstall).toHaveBeenCalledWith('pdf-reader'));
  });

  it.each([
    ['dark', darkColors.background],
    ['light', lightColors.surfaceBase],
  ] as const)('paints the %s page root with the right surface', async (themeMode, expected) => {
    mockParams.name = 'pdf-reader';
    useCloudSettingsStore.setState({ themeMode });
    try {
      const screen = render(<SkillDetailScreen />);
      await screen.findByText('Read PDFs');
      const tree = screen.toJSON();
      const root = Array.isArray(tree) ? tree[0] : tree;
      expect(StyleSheet.flatten(root?.props.style).backgroundColor).toBe(expected);
    } finally {
      useCloudSettingsStore.setState({ themeMode: 'system' });
    }
  });

  it('starts a new personal skill from a catalog skill used as a template', async () => {
    mockParams.name = 'pdf-reader';
    mockCreate.mockResolvedValue(undefined);
    const { findByText, getByLabelText } = render(<SkillDetailScreen />);
    fireEvent.press(await findByText('Use as a template'));
    expect(getByLabelText('Skill name').props.value).toBe('pdf-reader-copy');
    expect(getByLabelText('Skill instructions').props.value).toBe('# Steps');
    fireEvent.press(getByLabelText('Create skill'));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        name: 'pdf-reader-copy',
        description: 'Read PDFs',
        body: '# Steps',
      }),
    );
  });

  it('deletes an authored skill only after the consequence is confirmed', async () => {
    mockParams.name = 'weekly-report';
    mockDelete.mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, body, buttons) => {
      expect(body).toMatch(/cannot be undone/);
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    const { findByText } = render(<SkillDetailScreen />);
    fireEvent.press(await findByText('Delete skill'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('weekly-report'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/skills');
    alert.mockRestore();
  });
});

describe('skill service helpers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('encodes nested bundle paths and recognises previewable files', () => {
    expect(skillFilePath('my skill', 'scripts/run me.py')).toBe(
      '/api/skills/my%20skill/files/scripts/run%20me.py',
    );
    expect(isTextSkillFile('scripts/run.py')).toBe(true);
    expect(isTextSkillFile('logo.png')).toBe(false);
  });

  it('imports a SKILL.md as multipart and reports the server refusal', async () => {
    mockGuardedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'That name is taken.' } }), { status: 409 }),
    );
    await expect(
      importSkillFile({ uri: 'file:///SKILL.md', name: 'SKILL.md', mimeType: 'text/markdown' }),
    ).rejects.toThrow('That name is taken.');
    const [url, init] = mockGuardedFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/skills$/);
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).not.toHaveProperty('Content-Type');
  });
});
