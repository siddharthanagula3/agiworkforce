jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/services/cloudSyncEngine', () => ({ markProjectForSync: jest.fn() }));
jest.mock('@/services/authSession', () => ({ getAuthHeaders: jest.fn().mockResolvedValue({}) }));
jest.mock('@/lib/egressGuard', () => ({
  guardedFetch: jest.fn().mockResolvedValue({ ok: true, status: 200 }),
}));

const mockUploadAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  createUploadTask: jest.fn(() => ({ uploadAsync: mockUploadAsync })),
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
}));

jest.mock('@/services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { validateAttachmentMeta } from '@agiworkforce/types';
import { managedCloudProjectKnowledgePath } from '@agiworkforce/cloud-contracts';
import { getInfoAsync, readAsStringAsync } from 'expo-file-system/legacy';
import { api } from '@/services/api';
import { guardedFetch } from '@/lib/egressGuard';
import { useCloudProjectStore, type CloudProject } from '@/stores/projects/cloudProjectStore';
import { useProjectStore } from '@/src/features/projects/store';
import { PROJECT_SOURCE_MIME_TYPES } from '../components/ProjectSourcesTab';

const CLOUD_PROJECT_ID = '01920000-0000-7000-8000-000000000001';
const STORAGE_KEY = `knowledge-files/projects/${CLOUD_PROJECT_ID}/notes.md`;

// sha256 of the single byte 0x68 ("h", base64 "aA==")
const FILE_SHA256 = 'aaa9402664f1a41f40ebbc52c9993eb66aeb366602958fdfaa283b71e64db123';

const PICKED_SOURCE = {
  name: 'notes.md',
  mimeType: 'text/markdown',
  size: 1,
  uri: 'file:///cache/notes.md',
};

function cloudProject(overrides: Partial<CloudProject> = {}): CloudProject {
  return {
    id: CLOUD_PROJECT_ID,
    name: 'Cloud project',
    description: null,
    instructions: null,
    color: null,
    isArchived: false,
    metadata: null,
    source: 'mobile',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function registeredFile() {
  return {
    file: {
      id: 'kf_1',
      projectId: CLOUD_PROJECT_ID,
      fileName: PICKED_SOURCE.name,
      mimeType: PICKED_SOURCE.mimeType,
      byteCount: 1,
      checksumSha256: FILE_SHA256,
      sourceSurface: 'mobile',
      addedByUserId: 'user_1',
      addedAt: '2026-08-15T00:00:00.000Z',
      storageUri: STORAGE_KEY,
    },
  };
}

function primeHappyPath() {
  (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, isDirectory: false, size: 1 });
  (readAsStringAsync as jest.Mock).mockResolvedValue('aA==');
  mockUploadAsync.mockResolvedValue({ status: 200 });
  (api.post as jest.Mock).mockImplementation(async (path: string) =>
    path === '/api/uploads/presign'
      ? {
          uploadUrl: 'https://storage.example.com/knowledge/notes.md?sig=1',
          uploadMethod: 'PUT',
          uploadHeaders: { 'Content-Type': 'text/markdown' },
          storageKey: STORAGE_KEY,
        }
      : registeredFile(),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useProjectStore.setState({ projects: [], activeProjectId: null });
  useCloudProjectStore.setState({ projects: [cloudProject()], activeProjectId: null });
});

describe('adding sources to a cloud project', () => {
  it('presigns, uploads the bytes, and registers the file instead of silently dropping it', async () => {
    primeHappyPath();

    await useProjectStore.getState().addSource(CLOUD_PROJECT_ID, PICKED_SOURCE);

    expect(api.post).toHaveBeenCalledWith('/api/uploads/presign', {
      kind: 'knowledge-file',
      projectId: CLOUD_PROJECT_ID,
      fileName: 'notes.md',
      mimeType: 'text/markdown',
      byteCount: 1,
    });
    expect(mockUploadAsync).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(managedCloudProjectKnowledgePath(CLOUD_PROJECT_ID), {
      fileName: 'notes.md',
      mimeType: 'text/markdown',
      byteCount: 1,
      checksumSha256: FILE_SHA256,
      sourceSurface: 'mobile',
      storageUri: STORAGE_KEY,
    });
    expect(useProjectStore.getState().projects).toHaveLength(0);
  });

  it('refuses a non-https upload destination', async () => {
    primeHappyPath();
    (api.post as jest.Mock).mockImplementation(async (path: string) =>
      path === '/api/uploads/presign'
        ? {
            uploadUrl: 'http://storage.example.com/knowledge/notes.md',
            uploadMethod: 'PUT',
            uploadHeaders: {},
            storageKey: STORAGE_KEY,
          }
        : registeredFile(),
    );

    await expect(
      useProjectStore.getState().addSource(CLOUD_PROJECT_ID, PICKED_SOURCE),
    ).rejects.toThrow(/insecure upload destination/i);
    expect(mockUploadAsync).not.toHaveBeenCalled();
  });

  it('releases the presigned object when registration fails', async () => {
    primeHappyPath();
    (api.post as jest.Mock).mockImplementation(async (path: string) => {
      if (path === '/api/uploads/presign') {
        return {
          uploadUrl: 'https://storage.example.com/knowledge/notes.md?sig=1',
          uploadMethod: 'PUT',
          uploadHeaders: {},
          storageKey: STORAGE_KEY,
        };
      }
      throw new Error('Project knowledge storage limit reached.');
    });

    await expect(
      useProjectStore.getState().addSource(CLOUD_PROJECT_ID, PICKED_SOURCE),
    ).rejects.toThrow('Project knowledge storage limit reached.');
    expect(guardedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/uploads/presign'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('rejects a file type the server would refuse before uploading anything', async () => {
    primeHappyPath();

    await expect(
      useProjectStore.getState().addSource(CLOUD_PROJECT_ID, {
        ...PICKED_SOURCE,
        name: 'logo.svg',
        mimeType: 'image/svg+xml',
      }),
    ).rejects.toThrow(/not an accepted attachment type/i);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('removes a cloud source through the knowledge endpoint', async () => {
    await useProjectStore.getState().removeSource(CLOUD_PROJECT_ID, 'kf_1');
    expect(api.delete).toHaveBeenCalledWith(
      `${managedCloudProjectKnowledgePath(CLOUD_PROJECT_ID)}/kf_1`,
    );
  });
});

describe('adding sources to a project that is neither local nor cloud', () => {
  it('surfaces an error instead of no-oping', async () => {
    await expect(
      useProjectStore.getState().addSource('proj_missing', PICKED_SOURCE),
    ).rejects.toThrow(/no longer available/i);
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('local projects keep writing to the on-device store', () => {
  it('stores the picked file locally without touching the network', async () => {
    useProjectStore.setState({
      projects: [
        {
          id: 'proj_local',
          name: 'Local',
          description: '',
          instructions: '',
          sources: [],
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      activeProjectId: null,
    });

    await useProjectStore.getState().addSource('proj_local', PICKED_SOURCE);

    expect(api.post).not.toHaveBeenCalled();
    expect(useProjectStore.getState().projects[0]?.sources).toHaveLength(1);
  });
});

describe('the document picker filter', () => {
  it.each([...PROJECT_SOURCE_MIME_TYPES])(
    'advertises only types the shared validator accepts: %s',
    (mimeType) => {
      expect(validateAttachmentMeta('picked', mimeType, 1024).ok).toBe(true);
    },
  );

  it('covers every family the server allowlist permits', () => {
    expect(PROJECT_SOURCE_MIME_TYPES).toEqual(
      expect.arrayContaining(['image/png', 'application/pdf', 'text/*', 'application/json']),
    );
  });

  it('is passed to expo-document-picker', () => {
    const source = readFileSync(
      join(__dirname, '..', 'components', 'ProjectSourcesTab.tsx'),
      'utf8',
    );
    expect(source).toContain('type: [...PROJECT_SOURCE_MIME_TYPES]');
  });
});
