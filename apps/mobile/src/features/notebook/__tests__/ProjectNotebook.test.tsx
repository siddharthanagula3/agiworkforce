import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockParams = { id: 'project-1', name: 'Launch research' };
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockCreateConversation = jest.fn();
const mockSendMessage = jest.fn();
const mockSetFormat = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@clerk/expo', () => ({ getClerkInstance: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
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
jest.mock('@/services/api', () => ({
  ApiHttpError: jest.requireActual('@/services/apiErrors').ApiHttpError,
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));
jest.mock('@/stores/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      createConversation: (...args: unknown[]) => mockCreateConversation(...args),
      sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    }),
  },
}));
jest.mock('@/src/features/model-picker/store', () => ({
  useModelStore: { getState: () => ({ selectedModel: 'auto' }) },
}));
jest.mock('@/src/features/chat/store/outputFormatStore', () => ({
  useOutputFormatStore: { getState: () => ({ setFormat: mockSetFormat }) },
}));

import { PROJECT_STUDIO_OUTPUTS, projectStudioOutput } from '@agiworkforce/cloud-contracts';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { ProjectNotebookScreen } from '../ProjectNotebookScreen';
import { searchNotebookSources, startStudioOutput } from '../service';

function source(id: string, fileName: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    projectId: 'project-1',
    fileName,
    mimeType: 'text/markdown',
    byteCount: 10,
    checksumSha256: 'a'.repeat(64),
    summary: null,
    sourceSurface: 'web',
    addedByUserId: 'user-1',
    addedAt: '2026-10-01T00:00:00.000Z',
    storageUri: 's3://x',
    indexing: {
      status: 'indexed',
      chunkCount: 3,
      semantic: true,
      attempts: 1,
      error: null,
      indexedAt: '2026-10-01T00:00:00.000Z',
    },
    ...extra,
  };
}

const FAILED = source('f2', 'pricing.pdf', {
  summary: 'Competitor pricing tiers',
  indexing: {
    status: 'failed',
    chunkCount: 0,
    semantic: false,
    attempts: 2,
    error: 'The PDF is password protected',
    indexedAt: null,
  },
});

describe('project notebook on mobile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockGet.mockResolvedValue({ files: [source('f1', 'interviews.md'), FAILED] });
  });

  it('offers every studio output, each grounded in the sources', () => {
    expect(PROJECT_STUDIO_OUTPUTS.map((output) => output.id)).toEqual(
      expect.arrayContaining(['quiz', 'flashcards', 'infographic', 'learning-overview']),
    );
    for (const output of PROJECT_STUDIO_OUTPUTS) {
      expect(output.prompt).toContain("Use only this project's sources.");
    }
    expect(projectStudioOutput('slide-deck')?.officeFormat).toBe('pptx');
  });

  it('searches sources by name and summary across every word', () => {
    const files = [source('f1', 'interviews.md'), FAILED] as never;
    expect(searchNotebookSources(files, 'pricing tiers').map((file) => file.id)).toEqual(['f2']);
    expect(searchNotebookSources(files, '  ')).toHaveLength(2);
  });

  it('starts a quiz as a new chat in the project and opens it', async () => {
    mockCreateConversation.mockResolvedValue('conv-9');
    mockSendMessage.mockResolvedValue(true);
    const { findByLabelText } = render(<ProjectNotebookScreen />);
    fireEvent.press(await findByLabelText('Create quiz'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/chat/[id]',
        params: { id: 'conv-9' },
      }),
    );
    expect(mockCreateConversation).toHaveBeenCalledWith('Quiz', 'project-1');
    expect(mockSendMessage.mock.calls[0]?.[1]).toMatch(/Ask one multiple-choice question/);
    expect(mockSetFormat).not.toHaveBeenCalled();
  });

  it('asks for a PowerPoint for the slide deck and clears it if the send fails', async () => {
    mockCreateConversation.mockResolvedValue('conv-1');
    mockSendMessage.mockResolvedValue(false);
    await expect(
      startStudioOutput({ projectId: 'project-1', output: projectStudioOutput('slide-deck')! }),
    ).rejects.toThrow('Could not start the slide deck.');
    expect(mockSetFormat).toHaveBeenNthCalledWith(1, 'pptx');
    expect(mockSetFormat).toHaveBeenLastCalledWith(null);
  });

  it('filters the source list and reads a failed source again', async () => {
    mockPost.mockResolvedValue({ indexing: null, dispatched: true });
    const { findByText, getByLabelText, queryByText } = render(<ProjectNotebookScreen />);
    expect(await findByText('The PDF is password protected')).toBeTruthy();
    fireEvent.changeText(getByLabelText('Search sources'), 'pricing');
    expect(queryByText('interviews.md')).toBeNull();
    fireEvent.press(getByLabelText('Read pricing.pdf again'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/api/projects/project-1/knowledge-files/f2/reindex',
        {},
      ),
    );
  });

  it('holds the outputs until the project has a source', async () => {
    mockGet.mockResolvedValue({ files: [] });
    const { findByText, getByLabelText } = render(<ProjectNotebookScreen />);
    expect(await findByText('Add a source to this project first.')).toBeTruthy();
    expect(getByLabelText('Create briefing doc').props.accessibilityState.disabled).toBe(true);
  });
});
