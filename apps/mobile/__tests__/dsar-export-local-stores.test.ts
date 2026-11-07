jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'local-export-id') }));
const mockWriteAsStringAsync = jest.fn().mockResolvedValue(undefined);
const mockShareAsync = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  EncodingType: { UTF8: 'utf8' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { version: '1.0.0' },
    platform: { ios: {} },
  },
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: {
    getString: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    clearAll: jest.fn(),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../storage/conversations', () => ({
  listConversations: jest.fn().mockResolvedValue([]),
}));

jest.mock('../storage/messages', () => ({
  getMessagesForConversation: jest.fn().mockResolvedValue([]),
}));

jest.mock('../storage/memory', () => ({
  listMemoryFacts: jest.fn().mockResolvedValue([]),
}));

jest.mock('../storage/customInstructions', () => ({
  listCustomInstructions: jest.fn().mockResolvedValue([]),
}));

jest.mock('../storage/settingsDb', () => ({
  getAllSettings: jest.fn().mockResolvedValue({}),
}));

jest.mock('../storage/installedModels', () => ({
  listInstalledModels: jest.fn().mockResolvedValue([]),
}));

jest.mock('../services/complianceLedger', () => ({
  mmkvDisclosureLedger: { read: jest.fn().mockReturnValue(null) },
  mmkvConsentLedger: { getNamedProviderConsent: jest.fn().mockReturnValue(null) },
}));

import { hasAiGeneratedMarker } from '@agiworkforce/compliance';
import { buildMarkedTranscript, exportAllUserData } from '../services/dsarExport';
import { buildLocalDataExportSnapshot } from '../src/features/settings/data-controls/localDataSnapshot';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useProjectStore } from '../src/features/projects/store';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useArtifactStore } from '../src/features/artifacts/store';
import { activateCloudAccount, invalidateCloudAccount, __resetCloudAccountSessionForTests } from '../src/features/auth/services/cloudAccountSession';
import { SYNTHETIC_LOCAL_MODEL_ID } from '../test-utils/modelFixtures';

describe('DSAR export local stores', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    useChatAppModeStore.setState({ appMode: 'local' });
    useArtifactStore.setState({ artifacts: [] });
    useChatMessageStore.setState({
      conversations: [
        {
          id: 'local-conv-1',
          title: 'Local chat',
          createdAt: '2026-06-11T10:00:00.000Z',
          updatedAt: '2026-06-11T10:01:00.000Z',
          messageCount: 1,
          pinned: false,
          model: SYNTHETIC_LOCAL_MODEL_ID,
          provider: 'local',
          executionMode: 'local',
        },
      ],
      currentConversationId: 'local-conv-1',
      messages: {
        'local-conv-1': [
          {
            id: 'msg-1',
            conversationId: 'local-conv-1',
            role: 'user',
            content: 'hello from local',
            createdAt: '2026-06-11T10:01:00.000Z',
            model: SYNTHETIC_LOCAL_MODEL_ID,
          },
        ],
      },
      isLoadingConversations: false,
      isLoadingMessages: false,
    });
    useProjectStore.setState({
      projects: [
        {
          id: 'project-1',
          name: 'Local project',
          description: 'private',
          instructions: 'stay local',
          sources: [],
          createdAt: '2026-06-11T09:00:00.000Z',
          updatedAt: '2026-06-11T09:30:00.000Z',
        },
      ],
      activeProjectId: 'project-1',
    });
    useLocalSettingsStore.setState({
      accentColor: 'blue',
      referencePastChats: false,
      generateMemoryFromHistory: false,
      personalization: {
        fullName: 'Sid',
        nickname: '',
        occupation: 'Founder',
        instructions: 'be direct',
        style: 'default',
        warmth: 50,
        enthusiasm: 50,
        headersLists: 50,
        emoji: 0,
      },
    });
    useSettingsStore.setState({ reduceSensitiveContent: true });
  });

  it('keeps device-owned exports account-free even across account changes', () => {
    const snapshot = buildLocalDataExportSnapshot();
    expect(snapshot.assertAuthority).toBeUndefined();
    activateCloudAccount('account-b');
    expect(snapshot.conversations?.[0]?.id).toBe('local-conv-1');
  });

  it('binds captured Cloud settings to the original account without serializing authority', () => {
    activateCloudAccount('account-a');
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const snapshot = buildLocalDataExportSnapshot();
    expect(snapshot.assertAuthority).toBeDefined();
    expect(JSON.stringify(snapshot)).not.toContain('assertAuthority');
    invalidateCloudAccount();
    expect(() => snapshot.assertAuthority?.()).toThrow('Cloud account changed');
  });

  it('refuses mismatched Cloud artifacts without deleting device records', () => {
    activateCloudAccount('account-a');
    useArtifactStore.setState({ artifacts: [{
      id: 'foreign', title: 'Foreign', kind: 'code', content: 'private',
      ageLabel: '', sourceLabel: '', accentColor: '', previewLines: [],
      provenance: { scope: 'cloud', ownerId: 'account-b' },
    }] });
    expect(() => buildLocalDataExportSnapshot()).toThrow('matched to the active account');
    expect(useArtifactStore.getState().artifacts).toHaveLength(1);
  });

  it('does not write a captured Cloud snapshot after logout', async () => {
    activateCloudAccount('account-a');
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const snapshot = buildLocalDataExportSnapshot();
    invalidateCloudAccount();
    await expect(exportAllUserData(undefined, snapshot)).rejects.toThrow('Cloud account changed');
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('stops a captured Cloud snapshot while SQLite collection is pending', async () => {
    const { listConversations } = jest.requireMock('../storage/conversations');
    let release!: (rows: unknown[]) => void;
    listConversations.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    activateCloudAccount('account-a');
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const exporting = exportAllUserData(undefined, buildLocalDataExportSnapshot());
    const rejected = expect(exporting).rejects.toThrow('Cloud account changed');
    invalidateCloudAccount();
    release([]);
    await rejected;
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('exports MMKV-backed local conversations, projects, and settings', async () => {
    await exportAllUserData(undefined, buildLocalDataExportSnapshot());

    expect(mockWriteAsStringAsync).toHaveBeenCalled();
    const payload = JSON.parse(mockWriteAsStringAsync.mock.calls[0][1] as string);
    expect(payload.conversations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'local-conv-1',
          default_mode: 'local',
          messages: [
            expect.objectContaining({
              id: 'msg-1',
              content: 'hello from local',
              mode: 'local',
            }),
          ],
        }),
      ]),
    );
    expect(payload.local_projects).toEqual([
      expect.objectContaining({ id: 'project-1', name: 'Local project' }),
    ]);
    expect(payload.mobile_settings).toEqual(
      expect.objectContaining({
        accent_color: 'blue',
        reduce_sensitive_content: true,
        personalization: expect.objectContaining({ full_name: 'Sid' }),
        capabilities: expect.objectContaining({
          referencePastChats: false,
          generateMemoryFromHistory: false,
        }),
      }),
    );
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///cache/dsar_exports/local-export-id/agi_data_export.json',
      expect.objectContaining({ mimeType: 'application/json' }),
    );
  });
});

/**
 * The Article 50 legal screen tells a reader their on-device data export marks
 * each chat transcript as AI generated. The marker comes from a shared package
 * behind a guarded require, so one that stopped loading would leave the claim
 * false and nothing else red.
 */
describe('the transcript the on-device data export writes', () => {
  const transcript = buildMarkedTranscript([
    {
      role: 'user',
      content: 'Summarise this.',
      provider: null,
      model: null,
      created_at: '2026-09-21T10:00:00.000Z',
    },
    {
      role: 'assistant',
      content: 'Here is the summary.',
      provider: 'fixture-provider',
      model: 'fixture-model',
      created_at: '2026-09-21T10:00:05.000Z',
    },
  ]);

  it('carries the machine readable AI generated marker the legal screen names', () => {
    expect(hasAiGeneratedMarker(transcript)).toBe(true);
    expect(transcript).toMatch(/<meta\s+name="agi:ai-generated"/);
    expect(transcript).toContain('agi:ai-generated:c2pa-claim');
  });

  it('names the provider and model that wrote the last answer', () => {
    expect(transcript).toContain('fixture-provider');
    expect(transcript).toContain('fixture-model');
  });

  it('keeps the conversation readable inside the marker', () => {
    expect(transcript).toContain('You: Summarise this.');
    expect(transcript).toContain('AGI: Here is the summary.');
  });
});
