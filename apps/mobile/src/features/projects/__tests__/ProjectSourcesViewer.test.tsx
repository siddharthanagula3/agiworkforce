/* eslint-disable @typescript-eslint/no-require-imports */
const mockDownloadGeneratedFile = jest.fn();
const mockShareFile = jest.fn().mockResolvedValue(undefined);
const mockReadAsStringAsync = jest.fn();

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
jest.mock('@/lib/egressGuard', () => ({ guardedFetch: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  createUploadTask: jest.fn(),
  getInfoAsync: jest.fn(),
  readAsStringAsync: (uri: string) => mockReadAsStringAsync(uri),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('@/services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock('@/services/fileCreation', () => ({
  downloadGeneratedFile: (...args: unknown[]) => mockDownloadGeneratedFile(...args),
  viewerFileCopy: (...args: unknown[]) => mockDownloadGeneratedFile(...args),
  shareFile: (uri: string) => mockShareFile(uri),
  exportSourceFile: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        name === '__esModule' ? true : (props: Record<string, unknown>) => <RN.View {...props} />,
    },
  );
});

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ProjectKnowledgeIndexState } from '@agiworkforce/types';
import {
  KNOWLEDGE_INDEX_IN_PROGRESS_STATUSES,
  isKnowledgeIndexInProgress,
  managedCloudProjectKnowledgeReindexPath,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';
import { API_URL } from '@/lib/constants';
import {
  activateCloudAccount,
  __resetCloudAccountSessionForTests,
} from '@/src/features/auth/services/cloudAccountSession';
import { useCloudProjectStore, type CloudProject } from '@/stores/projects/cloudProjectStore';
import { useProjectStore } from '@/src/features/projects/store';
import {
  ProjectSourcesTab,
  sourceIndexStatus,
} from '@/src/features/projects/components/ProjectSourcesTab';

const PROJECT_ID = '01920000-0000-7000-8000-000000000001';
const BASE = API_URL.replace(/\/+$/, '');

function cloudProject(): CloudProject {
  return {
    id: PROJECT_ID,
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
  };
}

function indexing(status: ProjectKnowledgeIndexState['status']): ProjectKnowledgeIndexState {
  return { status, chunkCount: 0, semantic: false, attempts: 1, error: null, indexedAt: null };
}

function knowledgeFile(
  id: string,
  fileName: string,
  mimeType: string,
  state?: ProjectKnowledgeIndexState,
) {
  return {
    id,
    projectId: PROJECT_ID,
    fileName,
    mimeType,
    byteCount: 2048,
    checksumSha256: 'a'.repeat(64),
    sourceSurface: 'web',
    addedByUserId: 'user_1',
    addedAt: '2026-08-15T00:00:00.000Z',
    storageUri: `knowledge-files/${id}`,
    ...(state ? { indexing: state } : {}),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('user_1');
  useProjectStore.setState({ projects: [], activeProjectId: null });
  useCloudProjectStore.setState({ projects: [cloudProject()], activeProjectId: null });
  jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
});

describe('project sources viewer', () => {
  it('opens a tapped source in the viewer and shares it under its own name', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      files: [knowledgeFile('kf-1', 'notes.md', 'text/markdown')],
    });
    mockDownloadGeneratedFile.mockResolvedValue('file:///exports/notes.md');
    mockReadAsStringAsync.mockResolvedValue('Launch on Friday');
    render(<ProjectSourcesTab projectId={PROJECT_ID} />);

    fireEvent.press(await screen.findByLabelText('Open notes.md'));

    expect(await screen.findByText('Launch on Friday')).toBeTruthy();
    const url = `${BASE}/api/projects/${PROJECT_ID}/knowledge-files/kf-1`;
    expect(mockDownloadGeneratedFile).toHaveBeenCalledWith(url, 'notes.md');

    await act(async () => {
      fireEvent.press(screen.getByTestId('file-viewer-share'));
    });
    expect(mockShareFile).toHaveBeenCalledWith('file:///exports/notes.md');
  });

  it('opens the cited file at its page when asked to', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      files: [
        knowledgeFile('kf-1', 'notes.md', 'text/markdown'),
        knowledgeFile('kf-2', 'report.txt', 'text/plain'),
      ],
    });
    mockDownloadGeneratedFile.mockReturnValue(new Promise(() => undefined));
    render(<ProjectSourcesTab projectId={PROJECT_ID} openFileId="kf-2" openPage={12} />);

    const viewer = await screen.findByTestId('file-viewer-screen');
    expect(within(viewer).getByRole('header', { name: 'report.txt' })).toBeTruthy();
    expect(within(viewer).getByText('2 KB · Page 12')).toBeTruthy();
    expect(screen.getAllByText('report.txt', { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.getAllByText('report.txt')).toHaveLength(1);
  });

  it('says a pending source is indexing and a failed one could not be read', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      files: [
        knowledgeFile('kf-1', 'pending.md', 'text/markdown', indexing('pending')),
        knowledgeFile('kf-2', 'broken.pdf', 'application/pdf', indexing('failed')),
        knowledgeFile('kf-3', 'ready.md', 'text/markdown', indexing('indexed')),
      ],
    });
    render(<ProjectSourcesTab projectId={PROJECT_ID} />);

    expect(await screen.findByTestId('project-source-index-kf-1')).toHaveTextContent('Indexing');
    expect(screen.getByTestId('project-source-index-kf-2')).toHaveTextContent('Couldn’t read');
    expect(screen.queryByTestId('project-source-index-kf-3')).toBeNull();
    expect(screen.queryByTestId('project-source-retry-index-kf-1')).toBeNull();
  });

  it('retries indexing a failed source and shows the state the server returned', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      files: [knowledgeFile('kf-2', 'broken.pdf', 'application/pdf', indexing('failed'))],
    });
    (api.post as jest.Mock).mockResolvedValue({ indexing: indexing('indexing'), dispatched: true });
    render(<ProjectSourcesTab projectId={PROJECT_ID} />);

    const retry = await screen.findByLabelText('Retry indexing broken.pdf');
    await act(async () => {
      fireEvent.press(retry);
    });

    expect(api.post).toHaveBeenCalledWith(
      `/api/projects/${PROJECT_ID}/knowledge-files/kf-2/reindex`,
      undefined,
      expect.objectContaining({ accountEpoch: expect.objectContaining({ ownerId: 'user_1' }) }),
    );
    expect((api.post as jest.Mock).mock.calls[0][0]).toBe(
      managedCloudProjectKnowledgeReindexPath(PROJECT_ID, 'kf-2'),
    );
    await waitFor(() =>
      expect(screen.getByTestId('project-source-index-kf-2')).toHaveTextContent('Indexing'),
    );
    expect(screen.queryByLabelText('Retry indexing broken.pdf')).toBeNull();
  });

  it('opens a local source from the device without fetching it', async () => {
    useCloudProjectStore.setState({ projects: [], activeProjectId: null });
    useProjectStore.setState({
      projects: [
        {
          id: 'local-1',
          name: 'Local',
          description: '',
          instructions: '',
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
          sources: [
            {
              id: 'src-1',
              name: 'plan.txt',
              mimeType: 'text/plain',
              size: 12,
              uri: 'file:///cache/plan.txt',
              addedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        },
      ],
      activeProjectId: null,
    });
    mockReadAsStringAsync.mockResolvedValue('Local plan');
    render(<ProjectSourcesTab projectId="local-1" />);

    fireEvent.press(screen.getByLabelText('Open plan.txt'));

    expect(await screen.findByText('Local plan')).toBeTruthy();
    expect(mockReadAsStringAsync).toHaveBeenCalledWith('file:///cache/plan.txt');
    expect(mockDownloadGeneratedFile).not.toHaveBeenCalled();
  });
});

describe('sourceIndexStatus', () => {
  it('maps every index state to what a person sees', () => {
    expect(sourceIndexStatus(null)).toBeNull();
    expect(sourceIndexStatus(indexing('indexed'))).toBeNull();
    expect(sourceIndexStatus(indexing('stale'))).toEqual({ label: 'Indexing', failed: false });
    expect(sourceIndexStatus(indexing('indexing'))).toEqual({ label: 'Indexing', failed: false });
    expect(sourceIndexStatus(indexing('failed'))).toEqual({ label: 'Couldn’t read', failed: true });
    expect(sourceIndexStatus(indexing('failed'), true)).toEqual({
      label: 'Indexing',
      failed: false,
    });
  });

  it('shows Indexing for exactly the states the shared index rule counts as in progress', () => {
    const states: ProjectKnowledgeIndexState['status'][] = [
      ...KNOWLEDGE_INDEX_IN_PROGRESS_STATUSES,
      'indexed',
      'failed',
    ];
    for (const status of states) {
      const state = indexing(status);
      expect(sourceIndexStatus(state)?.label === 'Indexing').toBe(
        isKnowledgeIndexInProgress(state),
      );
    }
  });
});
