jest.mock('@/lib/mmkv', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/services/cloudSyncEngine', () => ({ markProjectForSync: jest.fn() }));
jest.mock('@/services/authSession', () => ({ getAuthHeaders: jest.fn() }));
jest.mock('@/lib/egressGuard', () => ({
  guardedFetch: jest.fn().mockResolvedValue({ ok: true, status: 200 }),
}));

const mockUploadAsync = jest.fn();
const mockCancelAsync = jest.fn();
const mockUploadProgress: {
  current?: (data: { totalBytesSent: number; totalBytesExpectedToSend: number }) => void;
} = {};
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  createUploadTask: jest.fn(
    (
      _url: string,
      _uri: string,
      _options: unknown,
      callback?: (data: { totalBytesSent: number; totalBytesExpectedToSend: number }) => void,
    ) => {
      mockUploadProgress.current = callback;
      return { uploadAsync: mockUploadAsync, cancelAsync: mockCancelAsync };
    },
  ),
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
}));

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

jest.mock('@/services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { validateAttachmentMeta } from '@agiworkforce/types';
import { managedCloudProjectKnowledgePath } from '@agiworkforce/cloud-contracts';
import { Alert, Modal } from 'react-native';
import { getDocumentAsync } from 'expo-document-picker';
import {
  createUploadTask,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { api } from '@/services/api';
import { ownerHandler } from '@/test-utils/ownerProps';
import { getAuthHeaders } from '@/services/authSession';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  invalidateCloudAccount,
  __resetCloudAccountSessionForTests,
  StaleCloudAccountOperationError,
} from '@/src/features/auth/services/cloudAccountSession';
import { guardedFetch } from '@/lib/egressGuard';
import { useCloudProjectStore, type CloudProject } from '@/stores/projects/cloudProjectStore';
import {
  cloudProjectSources,
  ProjectSourceCancelledError,
  ProjectSourceError,
  useProjectStore,
} from '@/src/features/projects/store';
import {
  PROJECT_SOURCE_MIME_TYPES,
  ProjectSourcesTab,
  projectSourceErrorMessage,
} from '../components/ProjectSourcesTab';

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

function registeredFile(): { file: Awaited<ReturnType<typeof cloudProjectSources.upload>> } {
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
  __resetCloudAccountSessionForTests();
  activateCloudAccount('user_1');
  (getAuthHeaders as jest.Mock)
    .mockReset()
    .mockResolvedValue({ Authorization: 'Bearer original-test-token' });
  mockCancelAsync.mockReset().mockResolvedValue(undefined);
  mockUploadProgress.current = undefined;
  useProjectStore.setState({ projects: [], activeProjectId: null });
  useCloudProjectStore.setState({ projects: [cloudProject()], activeProjectId: null });
});

describe('adding sources to a cloud project', () => {
  it('sends the encryption headers the presign returned with the native upload', async () => {
    primeHappyPath();
    (api.post as jest.Mock).mockImplementation(async (path: string) =>
      path === '/api/uploads/presign'
        ? {
            uploadUrl:
              'https://storage.example.com/knowledge/notes.md?X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost%3Bx-amz-server-side-encryption',
            uploadMethod: 'PUT',
            uploadHeaders: {
              'Content-Type': 'text/markdown',
              'x-amz-server-side-encryption': 'AES256',
            },
            storageKey: STORAGE_KEY,
          }
        : registeredFile(),
    );

    await useProjectStore.getState().addSource(CLOUD_PROJECT_ID, PICKED_SOURCE);

    const options = (createUploadTask as jest.Mock).mock.calls[0]?.[2] as {
      headers: Record<string, string>;
    };
    expect(options.headers).toEqual({
      'content-type': 'text/markdown',
      'x-amz-server-side-encryption': 'AES256',
    });
    expect(mockUploadAsync).toHaveBeenCalledTimes(1);
  });

  it('does not upload when the presigned url needs a header the presign did not return', async () => {
    primeHappyPath();
    (api.post as jest.Mock).mockImplementation(async (path: string) =>
      path === '/api/uploads/presign'
        ? {
            uploadUrl:
              'https://storage.example.com/knowledge/notes.md?X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost%3Bx-amz-server-side-encryption',
            uploadMethod: 'PUT',
            uploadHeaders: { 'Content-Type': 'text/markdown' },
            storageKey: STORAGE_KEY,
          }
        : registeredFile(),
    );

    await expect(
      useProjectStore.getState().addSource(CLOUD_PROJECT_ID, PICKED_SOURCE),
    ).rejects.toThrow(/x-amz-server-side-encryption/);
    expect(createUploadTask).not.toHaveBeenCalled();
    expect(mockUploadAsync).not.toHaveBeenCalled();
    expect(knowledgeRegistrations()).toHaveLength(0);
  });

  it('presigns, uploads the bytes, and registers the file instead of silently dropping it', async () => {
    primeHappyPath();

    await useProjectStore.getState().addSource(CLOUD_PROJECT_ID, PICKED_SOURCE);

    expect(api.post).toHaveBeenCalledWith(
      '/api/uploads/presign',
      {
        kind: 'knowledge-file',
        uploadProtocolVersion: 2,
        projectId: CLOUD_PROJECT_ID,
        fileName: 'notes.md',
        mimeType: 'text/markdown',
        byteCount: 1,
        checksumSha256: FILE_SHA256,
      },
      expect.objectContaining({
        accountEpoch: captureCloudAccountEpoch(),
        signal: expect.anything(),
      }),
    );
    expect(mockUploadAsync).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(
      managedCloudProjectKnowledgePath(CLOUD_PROJECT_ID),
      {
        fileName: 'notes.md',
        mimeType: 'text/markdown',
        byteCount: 1,
        checksumSha256: FILE_SHA256,
        sourceSurface: 'mobile',
        storageUri: STORAGE_KEY,
      },
      expect.objectContaining({
        accountEpoch: captureCloudAccountEpoch(),
        signal: expect.anything(),
      }),
    );
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

  it('retains the object when registration may have committed despite a failed response', async () => {
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
    expect(guardedFetch).not.toHaveBeenCalled();
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
      { accountEpoch: captureCloudAccountEpoch() },
    );
  });
});

function hangUploadUntilCancelled() {
  mockUploadAsync.mockImplementation(
    () =>
      new Promise((resolve) => {
        mockCancelAsync.mockImplementation(async () => resolve(undefined));
      }),
  );
}

function knowledgeRegistrations() {
  return (api.post as jest.Mock).mock.calls.filter(
    ([path]) => path === managedCloudProjectKnowledgePath(CLOUD_PROJECT_ID),
  );
}

describe('upload progress and cancellation', () => {
  it('reports byte progress from the upload task', async () => {
    primeHappyPath();
    mockUploadAsync.mockImplementation(async () => {
      mockUploadProgress.current?.({ totalBytesSent: 1, totalBytesExpectedToSend: 4 });
      return { status: 200 };
    });
    const onProgress = jest.fn();

    await useProjectStore.getState().addSource(CLOUD_PROJECT_ID, PICKED_SOURCE, { onProgress });

    expect(onProgress).toHaveBeenCalledWith({ bytesSent: 1, totalBytes: 4 });
  });

  it('cancels the in-flight upload, releases the presign and registers nothing', async () => {
    primeHappyPath();
    hangUploadUntilCancelled();
    const controller = new AbortController();

    const pending = useProjectStore
      .getState()
      .addSource(CLOUD_PROJECT_ID, PICKED_SOURCE, { signal: controller.signal });
    await waitFor(() => expect(mockUploadAsync).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(ProjectSourceCancelledError);
    expect(mockCancelAsync).toHaveBeenCalledTimes(1);
    expect(guardedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/uploads/presign'),
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({
          kind: 'knowledge-file',
          projectId: CLOUD_PROJECT_ID,
          storageKey: STORAGE_KEY,
        }),
      }),
    );
    expect(knowledgeRegistrations()).toHaveLength(0);
  });

  it('touches nothing when the signal is already aborted', async () => {
    primeHappyPath();
    const controller = new AbortController();
    controller.abort();

    await expect(
      useProjectStore
        .getState()
        .addSource(CLOUD_PROJECT_ID, PICKED_SOURCE, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(ProjectSourceCancelledError);
    expect(api.post).not.toHaveBeenCalled();
    expect(createUploadTask).not.toHaveBeenCalled();
  });
});

describe('the sources tab upload queue', () => {
  const pickedAssets = [
    { name: 'notes.md', mimeType: 'text/markdown', size: 1, uri: 'file:///cache/notes.md' },
    { name: 'plan.md', mimeType: 'text/markdown', size: 1, uri: 'file:///cache/plan.md' },
  ];

  beforeEach(() => {
    primeHappyPath();
    (api.get as jest.Mock).mockResolvedValue({ files: [] });
    (getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: pickedAssets });
  });

  async function startAdding() {
    const screen = render(React.createElement(ProjectSourcesTab, { projectId: CLOUD_PROJECT_ID }));
    await waitFor(() => expect(screen.getByText('No sources added yet')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Add sources'));
    await waitFor(() => expect(mockUploadAsync).toHaveBeenCalledTimes(1));
    return screen;
  }

  it('shows which file is uploading and its byte progress', async () => {
    hangUploadUntilCancelled();
    const screen = await startAdding();

    expect(screen.getByText('Adding notes.md')).toBeTruthy();
    await act(async () => {
      mockUploadProgress.current?.({ totalBytesSent: 1, totalBytesExpectedToSend: 4 });
    });

    expect(screen.getByText('Uploading notes.md, 25%')).toBeTruthy();
    expect(screen.getByText('File 1 of 2')).toBeTruthy();
    screen.unmount();
  });

  it('cancel stops the queue without reporting an error', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    hangUploadUntilCancelled();
    const screen = await startAdding();

    const cancel = screen.getByLabelText('Cancel adding sources');
    expect(cancel.props.accessibilityRole).toBe('button');
    await act(async () => {
      fireEvent.press(cancel);
    });

    await waitFor(() => expect(screen.queryByTestId('project-source-upload-progress')).toBeNull());
    expect(mockCancelAsync).toHaveBeenCalledTimes(1);
    expect(createUploadTask).toHaveBeenCalledTimes(1);
    expect(knowledgeRegistrations()).toHaveLength(0);
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('cancels the in-flight upload when the tab unmounts', async () => {
    hangUploadUntilCancelled();
    const screen = await startAdding();

    screen.unmount();

    await waitFor(() => expect(mockCancelAsync).toHaveBeenCalledTimes(1));
    expect(createUploadTask).toHaveBeenCalledTimes(1);
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

describe('project source failure copy', () => {
  it('keeps service diagnostics private while preserving local validation guidance', () => {
    expect(projectSourceErrorMessage(new Error('private storage URL'), 'Try again.')).toBe(
      'Try again.',
    );
    expect(
      projectSourceErrorMessage(
        new ProjectSourceError('This file type is not supported.'),
        'Try again.',
      ),
    ).toBe('This file type is not supported.');
  });

  it('offers a retry after a failed Cloud source load', async () => {
    (api.get as jest.Mock)
      .mockRejectedValueOnce(new Error('private storage path'))
      .mockResolvedValueOnce({ files: [] });

    const screen = render(React.createElement(ProjectSourcesTab, { projectId: CLOUD_PROJECT_ID }));

    await waitFor(() => expect(screen.getByText('Could not load sources')).toBeTruthy());
    expect(screen.queryByText('private storage path')).toBeNull();
    fireEvent.press(screen.getByLabelText('Retry loading project sources'));

    await waitFor(() => expect(screen.getByText('No sources added yet')).toBeTruthy());
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('ignores a stale source failure after changing projects', async () => {
    const otherProjectId = '01920000-0000-7000-8000-000000000002';
    useCloudProjectStore.setState({
      projects: [cloudProject(), cloudProject({ id: otherProjectId })],
    });
    let rejectPrevious!: (reason: Error) => void;
    (api.get as jest.Mock)
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectPrevious = reject;
          }),
      )
      .mockResolvedValueOnce({ files: [] });

    const screen = render(React.createElement(ProjectSourcesTab, { projectId: CLOUD_PROJECT_ID }));
    screen.rerender(React.createElement(ProjectSourcesTab, { projectId: otherProjectId }));
    await waitFor(() => expect(screen.getByText('No sources added yet')).toBeTruthy());

    await act(async () => rejectPrevious(new Error('previous account details')));

    expect(screen.queryByText('Could not load sources')).toBeNull();
    expect(screen.getByText('No sources added yet')).toBeTruthy();
  });
});

function deferredSource<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('project upload operation ownership', () => {
  it.each(['info', 'hash', 'credentials'])(
    'stops an account switch during %s before presigning',
    async (stage) => {
      primeHappyPath();
      const pendingStage = deferredSource<unknown>();
      const mock =
        stage === 'info' ? getInfoAsync : stage === 'hash' ? readAsStringAsync : getAuthHeaders;
      (mock as jest.Mock).mockImplementationOnce(() => pendingStage.promise);
      const pending = cloudProjectSources.upload(CLOUD_PROJECT_ID, PICKED_SOURCE);
      const rejected = expect(pending).rejects.toBeInstanceOf(StaleCloudAccountOperationError);
      await waitFor(() => expect(mock).toHaveBeenCalled());
      activateCloudAccount('user_2');
      pendingStage.resolve(
        stage === 'info'
          ? { exists: true, size: 1 }
          : stage === 'hash'
            ? 'aA=='
            : { Authorization: 'Bearer replacement-test-token' },
      );
      await rejected;
      expect(api.post).not.toHaveBeenCalled();
      expect(createUploadTask).not.toHaveBeenCalled();
      expect(guardedFetch).not.toHaveBeenCalled();
    },
  );

  it('rejects a returned presign after account retirement without acquiring cleanup credentials', async () => {
    primeHappyPath();
    const presign = deferredSource<unknown>();
    (api.post as jest.Mock).mockImplementationOnce(() => presign.promise);
    const pending = cloudProjectSources.upload(CLOUD_PROJECT_ID, PICKED_SOURCE);
    const rejected = expect(pending).rejects.toBeInstanceOf(StaleCloudAccountOperationError);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    invalidateCloudAccount();
    activateCloudAccount('user_1');
    presign.resolve({
      uploadUrl: 'https://storage.example.com/file',
      uploadMethod: 'PUT',
      uploadHeaders: {},
      storageKey: STORAGE_KEY,
    });
    await rejected;
    expect(createUploadTask).not.toHaveBeenCalled();
    expect(getAuthHeaders).toHaveBeenCalledTimes(1);
    expect(guardedFetch).not.toHaveBeenCalled();
  });

  it('cancels native work and drops late progress after an account switch', async () => {
    primeHappyPath();
    hangUploadUntilCancelled();
    const onProgress = jest.fn();
    const pending = cloudProjectSources.upload(CLOUD_PROJECT_ID, PICKED_SOURCE, { onProgress });
    const rejected = expect(pending).rejects.toBeInstanceOf(StaleCloudAccountOperationError);
    await waitFor(() => expect(mockUploadAsync).toHaveBeenCalled());
    activateCloudAccount('user_2');
    mockUploadProgress.current?.({ totalBytesSent: 1, totalBytesExpectedToSend: 1 });
    await rejected;
    expect(mockCancelAsync).toHaveBeenCalledTimes(1);
    expect(onProgress).not.toHaveBeenCalled();
    expect(knowledgeRegistrations()).toHaveLength(0);
    expect(guardedFetch).not.toHaveBeenCalled();
  });

  it('uses only captured credentials for cleanup after a storage failure', async () => {
    primeHappyPath();
    (getAuthHeaders as jest.Mock)
      .mockResolvedValueOnce({ Authorization: 'Bearer captured-test-token' })
      .mockResolvedValue({ Authorization: 'Bearer later-test-token' });
    mockUploadAsync.mockResolvedValue({ status: 500 });
    await expect(
      cloudProjectSources.upload(CLOUD_PROJECT_ID, PICKED_SOURCE),
    ).rejects.toBeInstanceOf(ProjectSourceError);
    expect(getAuthHeaders).toHaveBeenCalledTimes(1);
    expect(guardedFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer captured-test-token' }),
        signal: expect.anything(),
      }),
    );
  });

  it.each(['cancel-success', 'stale-success', 'cancel-failure', 'mismatch'])(
    'retains dispatched registration on %s',
    async (outcome) => {
      primeHappyPath();
      const registration = deferredSource<unknown>();
      const originalPost = (api.post as jest.Mock).getMockImplementation()!;
      (api.post as jest.Mock).mockImplementation((path: string, ...args: unknown[]) =>
        path === managedCloudProjectKnowledgePath(CLOUD_PROJECT_ID)
          ? registration.promise
          : originalPost(path, ...args),
      );
      const controller = new AbortController();
      const pending = cloudProjectSources.upload(CLOUD_PROJECT_ID, PICKED_SOURCE, {
        signal: controller.signal,
      });
      const settled = pending.then(
        (value) => ({ value, error: null }),
        (error: unknown) => ({ value: null, error }),
      );
      await waitFor(() => expect(knowledgeRegistrations()).toHaveLength(1));
      if (outcome === 'stale-success') activateCloudAccount('user_2');
      else controller.abort();
      if (outcome === 'cancel-failure') registration.reject(new Error('Response lost'));
      else if (outcome === 'mismatch')
        registration.resolve({ file: { ...registeredFile().file, byteCount: 2 } });
      else registration.resolve(registeredFile());
      const result = await settled;
      if (outcome === 'cancel-success') expect(result.value).toEqual(registeredFile().file);
      else expect(result.error).toBeInstanceOf(Error);
      expect(guardedFetch).not.toHaveBeenCalled();
      expect(getAuthHeaders).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects Cloud context instead of retargeting to an on-device project', async () => {
    const accountEpoch = captureCloudAccountEpoch();
    useCloudProjectStore.setState({ projects: [] });
    useProjectStore.setState({
      projects: [
        {
          id: CLOUD_PROJECT_ID,
          name: 'Local',
          description: '',
          instructions: '',
          createdAt: '',
          updatedAt: '',
          sources: [],
        },
      ],
    });
    await expect(
      useProjectStore.getState().addSource(CLOUD_PROJECT_ID, PICKED_SOURCE, { accountEpoch }),
    ).rejects.toThrow('Cloud project is no longer available');
    expect(useProjectStore.getState().projects[0]?.sources).toEqual([]);
  });
});

describe('source picker ownership before preparation', () => {
  it.each(['account', 'project', 'unmount'])(
    'does not upload a picker result after %s changes',
    async (change) => {
      primeHappyPath();
      (api.get as jest.Mock).mockResolvedValue({ files: [] });
      const picker = deferredSource<unknown>();
      (getDocumentAsync as jest.Mock).mockReturnValue(picker.promise);
      const screen = render(
        React.createElement(ProjectSourcesTab, { projectId: CLOUD_PROJECT_ID }),
      );
      await waitFor(() => expect(screen.getByText('No sources added yet')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('Add sources'));
      await waitFor(() => expect(getDocumentAsync).toHaveBeenCalled());
      await act(async () => {
        if (change === 'account') activateCloudAccount('user_2');
        else if (change === 'project')
          screen.rerender(React.createElement(ProjectSourcesTab, { projectId: 'missing-project' }));
        else screen.unmount();
      });
      await act(async () => {
        picker.resolve({ canceled: false, assets: [PICKED_SOURCE] });
      });
      expect(getInfoAsync).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
      if (change !== 'unmount') screen.unmount();
    },
  );

  it('does not upload text whose cache write outlives its account', async () => {
    primeHappyPath();
    (api.get as jest.Mock).mockResolvedValue({ files: [] });
    const write = deferredSource<void>();
    (writeAsStringAsync as jest.Mock).mockReturnValue(write.promise);
    const screen = render(React.createElement(ProjectSourcesTab, { projectId: CLOUD_PROJECT_ID }));
    await waitFor(() => expect(screen.getByText('No sources added yet')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Add text'));
    fireEvent.changeText(
      screen.getByPlaceholderText('Paste or type the text this project should use'),
      'original account text',
    );
    fireEvent.press(screen.getByLabelText('Add'));
    await waitFor(() => expect(writeAsStringAsync).toHaveBeenCalled());
    await act(async () => {
      activateCloudAccount('user_2');
      write.resolve();
    });
    expect(api.post).not.toHaveBeenCalled();
    expect(getInfoAsync).not.toHaveBeenCalled();
    screen.unmount();
  });
});

describe('source cancellation and delayed removal', () => {
  it('stops hashing after a cancelled chunk without starting another read', async () => {
    primeHappyPath();
    (getInfoAsync as jest.Mock).mockResolvedValue({
      exists: true,
      isDirectory: false,
      size: 4 * 1024 * 1024,
    });
    const chunk = deferredSource<string>();
    (readAsStringAsync as jest.Mock).mockReturnValueOnce(chunk.promise);
    const controller = new AbortController();
    const pending = cloudProjectSources.upload(CLOUD_PROJECT_ID, PICKED_SOURCE, {
      signal: controller.signal,
    });
    const rejected = expect(pending).rejects.toBeInstanceOf(ProjectSourceCancelledError);
    await waitFor(() => expect(readAsStringAsync).toHaveBeenCalledTimes(1));
    controller.abort();
    chunk.resolve('aA==');
    await rejected;
    expect(readAsStringAsync).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('does not deliver progress after a completed upload', async () => {
    primeHappyPath();
    const onProgress = jest.fn();
    await cloudProjectSources.upload(CLOUD_PROJECT_ID, PICKED_SOURCE, { onProgress });
    mockUploadProgress.current?.({ totalBytesSent: 1, totalBytesExpectedToSend: 1 });
    expect(onProgress).not.toHaveBeenCalled();
    activateCloudAccount('user_2');
    expect(mockCancelAsync).not.toHaveBeenCalled();
  });

  it('does not reuse an original-account remove confirmation after switching accounts', async () => {
    (api.get as jest.Mock).mockResolvedValue({ files: [registeredFile().file] });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(React.createElement(ProjectSourcesTab, { projectId: CLOUD_PROJECT_ID }));
    await waitFor(() => expect(screen.getByLabelText('Remove notes.md')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Remove notes.md'));
    const confirm = alert.mock.calls
      .find(([title]) => title === 'Remove source')?.[2]
      ?.find((button) => button.text === 'Remove');
    expect(confirm?.onPress).toBeDefined();
    await act(async () => {
      activateCloudAccount('user_2');
      confirm?.onPress?.();
    });
    expect(api.delete).not.toHaveBeenCalled();
    screen.unmount();
    alert.mockRestore();
  });

  it('does not refresh or alert for a removal response from a retired account', async () => {
    (api.get as jest.Mock).mockResolvedValue({ files: [registeredFile().file] });
    const removal = deferredSource<unknown>();
    (api.delete as jest.Mock).mockReturnValue(removal.promise);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(React.createElement(ProjectSourcesTab, { projectId: CLOUD_PROJECT_ID }));
    await waitFor(() => expect(screen.getByLabelText('Remove notes.md')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Remove notes.md'));
    const confirm = alert.mock.calls
      .find(([title]) => title === 'Remove source')?.[2]
      ?.find((button) => button.text === 'Remove');
    await act(async () => {
      confirm?.onPress?.();
    });
    expect(api.delete).toHaveBeenCalledTimes(1);
    alert.mockClear();
    await act(async () => {
      activateCloudAccount('user_2');
    });
    const currentLoads = (api.get as jest.Mock).mock.calls.length;
    await act(async () => {
      removal.resolve({});
    });
    expect(api.get).toHaveBeenCalledTimes(currentLoads);
    expect(alert).not.toHaveBeenCalled();
    screen.unmount();
    alert.mockRestore();
  });
});

describe('source view concurrent work', () => {
  it('opens only one picker when pressed twice before a render', async () => {
    (api.get as jest.Mock).mockResolvedValue({ files: [] });
    const picker = deferredSource<unknown>();
    (getDocumentAsync as jest.Mock).mockReturnValue(picker.promise);
    const screen = render(React.createElement(ProjectSourcesTab, { projectId: CLOUD_PROJECT_ID }));
    await waitFor(() => expect(screen.getByText('No sources added yet')).toBeTruthy());
    const button = screen.getByLabelText('Add sources');
    act(() => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    expect(getDocumentAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      picker.resolve({ canceled: true, assets: null });
    });
    screen.unmount();
  });

  it('drops a list response when the account changed without a project rerender', async () => {
    const listing = deferredSource<unknown>();
    (api.get as jest.Mock).mockReturnValueOnce(listing.promise).mockResolvedValue({ files: [] });
    const screen = render(React.createElement(ProjectSourcesTab, { projectId: CLOUD_PROJECT_ID }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    await act(async () => {
      activateCloudAccount('user_2');
      listing.resolve({ files: [registeredFile().file] });
    });
    expect(screen.queryByText('notes.md')).toBeNull();
    expect(screen.queryByText('Could not load sources')).toBeNull();
    screen.unmount();
  });
});

describe('retained source action callbacks', () => {
  it('does not let an old text save adopt a replacement epoch before rerender', async () => {
    (api.get as jest.Mock).mockResolvedValue({ files: [] });
    (writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
    const screen = render(React.createElement(ProjectSourcesTab, { projectId: CLOUD_PROJECT_ID }));
    await waitFor(() => expect(screen.getByText('No sources added yet')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Add text'));
    fireEvent.changeText(
      screen.getByPlaceholderText('Paste or type the text this project should use'),
      'original private text',
    );
    const oldSave = ownerHandler(screen.getByLabelText('Add'), 'onPress');
    await act(async () => {
      activateCloudAccount('user_2');
      activateCloudAccount('user_1');
      oldSave();
    });
    expect(writeAsStringAsync).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    screen.unmount();
  });

  it('does not let a retained picker callback adopt an A to B to A project return', async () => {
    const otherProjectId = '01920000-0000-7000-8000-000000000002';
    useCloudProjectStore.setState({
      projects: [cloudProject(), cloudProject({ id: otherProjectId })],
    });
    (api.get as jest.Mock).mockResolvedValue({ files: [] });
    const screen = render(React.createElement(ProjectSourcesTab, { projectId: CLOUD_PROJECT_ID }));
    await waitFor(() => expect(screen.getByText('No sources added yet')).toBeTruthy());
    const oldPick = ownerHandler(screen.getByLabelText('Add sources'), 'onPress');
    screen.rerender(React.createElement(ProjectSourcesTab, { projectId: otherProjectId }));
    screen.rerender(React.createElement(ProjectSourcesTab, { projectId: CLOUD_PROJECT_ID }));
    await act(async () => oldPick());
    expect(getDocumentAsync).not.toHaveBeenCalled();
    screen.unmount();
  });
});

describe('text source editor revisions', () => {
  async function openDraft() {
    (api.get as jest.Mock).mockResolvedValue({ files: [] });
    (writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
    const screen = render(React.createElement(ProjectSourcesTab, { projectId: CLOUD_PROJECT_ID }));
    await waitFor(() => expect(screen.getByText('No sources added yet')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Add text'));
    fireEvent.changeText(screen.getByLabelText('Text source title'), 'Original title');
    fireEvent.changeText(screen.getByLabelText('Text source content'), 'Original body');
    return screen;
  }

  it.each(['title', 'body'])(
    'preserves newer %s input after an accepted upload succeeds',
    async (field) => {
      const upload = deferredSource<ReturnType<typeof registeredFile>['file']>();
      const uploadSource = jest
        .spyOn(cloudProjectSources, 'upload')
        .mockReturnValue(upload.promise);
      const screen = await openDraft();
      try {
        fireEvent.press(screen.getByLabelText('Add'));
        await waitFor(() => expect(uploadSource).toHaveBeenCalledTimes(1));
        fireEvent.changeText(
          screen.getByLabelText(`Text source ${field === 'title' ? 'title' : 'content'}`),
          'Newer input',
        );
        await act(async () => {
          upload.resolve(registeredFile().file);
        });
        expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
        expect(
          screen.getByLabelText(`Text source ${field === 'title' ? 'title' : 'content'}`).props
            .value,
        ).toBe('Newer input');
        expect(uploadSource).toHaveBeenCalledTimes(1);
        expect(guardedFetch).not.toHaveBeenCalled();
      } finally {
        screen.unmount();
        uploadSource.mockRestore();
      }
    },
  );

  it('closes an unchanged editor after a successful same-session save', async () => {
    const uploadSource = jest
      .spyOn(cloudProjectSources, 'upload')
      .mockResolvedValue(registeredFile().file);
    const screen = await openDraft();
    try {
      fireEvent.press(screen.getByLabelText('Add'));
      await waitFor(() => expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false));
      expect(uploadSource).toHaveBeenCalledTimes(1);
    } finally {
      screen.unmount();
      uploadSource.mockRestore();
    }
  });

  it('preserves a reopened editor when an earlier accepted save settles', async () => {
    const upload = deferredSource<ReturnType<typeof registeredFile>['file']>();
    const uploadSource = jest.spyOn(cloudProjectSources, 'upload').mockReturnValue(upload.promise);
    const screen = await openDraft();
    const reopen = ownerHandler(screen.getByLabelText('Add text'), 'onPress');
    try {
      fireEvent.press(screen.getByLabelText('Add'));
      await waitFor(() => expect(uploadSource).toHaveBeenCalledTimes(1));
      fireEvent.press(screen.getByLabelText('Cancel'));
      act(() => reopen());
      fireEvent.changeText(screen.getByLabelText('Text source content'), 'Reopened draft');
      await act(async () => {
        upload.resolve(registeredFile().file);
      });
      expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
      expect(screen.getByLabelText('Text source content').props.value).toBe('Reopened draft');
      expect(uploadSource).toHaveBeenCalledTimes(1);
    } finally {
      screen.unmount();
      uploadSource.mockRestore();
    }
  });

  it('rejects a retained pre-edit save callback before writing its old text', async () => {
    const screen = await openDraft();
    try {
      const oldSave = ownerHandler(screen.getByLabelText('Add'), 'onPress');
      const edit = screen.getByLabelText('Text source content').props.onChangeText as (
        text: string,
      ) => void;
      await act(async () => {
        edit('Newer input before rerender');
        oldSave();
      });
      expect(writeAsStringAsync).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Text source content').props.value).toBe(
        'Newer input before rerender',
      );
    } finally {
      screen.unmount();
    }
  });

  it('does not show an old save failure over newer text', async () => {
    const upload = deferredSource<ReturnType<typeof registeredFile>['file']>();
    const uploadSource = jest.spyOn(cloudProjectSources, 'upload').mockReturnValue(upload.promise);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = await openDraft();
    try {
      fireEvent.press(screen.getByLabelText('Add'));
      await waitFor(() => expect(uploadSource).toHaveBeenCalledTimes(1));
      fireEvent.changeText(screen.getByLabelText('Text source content'), 'Newer draft');
      await act(async () => {
        upload.reject(new Error('Original upload failed'));
      });
      expect(alert).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Text source content').props.value).toBe('Newer draft');
      expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
    } finally {
      screen.unmount();
      uploadSource.mockRestore();
      alert.mockRestore();
    }
  });
});
