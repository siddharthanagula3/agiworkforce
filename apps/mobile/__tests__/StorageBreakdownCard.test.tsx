import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRouter = { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), replace: jest.fn() };

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: () => icon });
});

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getFreeDiskStorageAsync: jest.fn().mockResolvedValue(1024),
  getTotalDiskCapacityAsync: jest.fn().mockResolvedValue(4096),
}));

jest.mock('@/storage/installedModels', () => ({
  listInstalledModels: jest.fn().mockResolvedValue([]),
  deleteInstalledModel: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/modelDownload', () => ({
  modelRemovalUnsupportedReason: jest.fn(),
  MODEL_BUSY_REMOVAL_MESSAGE: 'busy',
  deleteDownloadedModel: jest.fn().mockResolvedValue(undefined),
  getModelStorageBytes: jest.fn().mockResolvedValue(0),
}));

jest.mock('@/services/dsarExport', () => ({
  exportAllUserData: jest.fn(),
  wipeAllLocalData: jest.fn(),
}));

jest.mock('@/src/features/settings/data-controls/localDataSnapshot', () => ({
  LocalExportAuthorityError: class LocalExportAuthorityError extends Error {},
  buildLocalDataExportSnapshot: jest.fn().mockReturnValue({}),
  resetLocalInMemoryState: jest.fn(),
}));

jest.mock('@/src/features/settings/storageUsage', () => ({
  getDirectorySizeBytes: jest.fn().mockResolvedValue(0),
}));

jest.mock('@/services/usage', () => ({
  fetchCloudFileBreakdown: jest.fn(),
}));

import { fetchCloudFileBreakdown } from '@/services/usage';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { StorageBreakdownCard } from '@/src/features/settings/StorageBreakdownCard';
import StorageManagerScreen from '@/app/(app)/settings/storage';
import { StyleSheet } from 'react-native';
import { TextScaleContext } from '@/components/ui/textScale';
import { ROW_LABEL_TEXT_SCALE_LIMIT } from '@/src/ui/theme/tokens';

const LARGEST_ACCESSIBILITY_SCALE = 3.571;

const MB = 1024 * 1024;
const fetchBreakdown = fetchCloudFileBreakdown as jest.Mock;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function signInToCloud(userId = 'user-a') {
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: userId });
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchBreakdown.mockResolvedValue({ documentsBytes: 37 * MB, imagesBytes: 289 * MB });
  signInToCloud();
});

afterEach(() => {
  useChatAppModeStore.setState({ appMode: 'local' });
  useAuthStore.setState({ isClerkSignedIn: false, clerkUserId: null });
});

describe('the Cloud files card in Storage', () => {
  it('shows the size of documents and of images in the account', async () => {
    const screen = render(<StorageBreakdownCard />);

    await waitFor(() =>
      expect(screen.getByTestId('storage-breakdown-documents-size')).toHaveTextContent('37 MB'),
    );
    expect(screen.getByTestId('storage-breakdown-images-size')).toHaveTextContent('289 MB');
    expect(screen.getByLabelText('Documents. 37 MB')).toBeTruthy();
    expect(screen.getByLabelText('Images. 289 MB')).toBeTruthy();
  });

  it('puts each size below its label at the largest text size, so no word breaks in the middle', async () => {
    const screen = render(
      <TextScaleContext.Provider value={LARGEST_ACCESSIBILITY_SCALE}>
        <StorageBreakdownCard />
      </TextScaleContext.Provider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('storage-breakdown-documents-size')).toHaveTextContent('37 MB'),
    );
    for (const row of ['storage-breakdown-documents', 'storage-breakdown-images']) {
      const stack = screen.getByTestId(`${row}-stack`);
      expect(StyleSheet.flatten(stack.props.style)).toMatchObject({ flex: 1, minWidth: 0 });
      const [label, value] = stack.children as { props: Record<string, unknown> }[];
      expect(label?.props['maxFontSizeMultiplier']).toBe(ROW_LABEL_TEXT_SCALE_LIMIT);
      expect(value?.props['testID']).toBe(`${row}-size`);
    }
    expect(screen.getByLabelText('Documents. 37 MB')).toBeTruthy();
  });

  it('keeps the label and its size on one line at the default text size', async () => {
    const screen = render(
      <TextScaleContext.Provider value={1}>
        <StorageBreakdownCard />
      </TextScaleContext.Provider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('storage-breakdown-documents-size')).toHaveTextContent('37 MB'),
    );
    expect(screen.queryByTestId('storage-breakdown-documents-stack')).toBeNull();
    expect(
      StyleSheet.flatten(screen.getByTestId('storage-breakdown-documents-size').props.style),
    ).toMatchObject({ flexShrink: 0 });
  });

  it('shows 0 B for a kind the account has none of', async () => {
    fetchBreakdown.mockResolvedValue({ documentsBytes: 0, imagesBytes: 0 });
    const screen = render(<StorageBreakdownCard />);

    await waitFor(() =>
      expect(screen.getByTestId('storage-breakdown-documents-size')).toHaveTextContent('0 B'),
    );
    expect(screen.getByTestId('storage-breakdown-images-size')).toHaveTextContent('0 B');
  });

  it('opens the Library on documents or on images from each row', async () => {
    const screen = render(<StorageBreakdownCard />);
    await waitFor(() => screen.getByLabelText('Documents. 37 MB'));

    fireEvent.press(screen.getByLabelText('Documents. 37 MB'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/(app)/library',
      params: { filter: 'documents' },
    });
    fireEvent.press(screen.getByLabelText('Images. 289 MB'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/(app)/library',
      params: { filter: 'images' },
    });
  });

  it('stays hidden until the server sends the breakdown, so an older server shows nothing', async () => {
    const reply = deferred<null>();
    fetchBreakdown.mockReturnValue(reply.promise);
    const screen = render(<StorageBreakdownCard />);

    expect(screen.queryByTestId('storage-breakdown-card')).toBeNull();
    await act(async () => {
      reply.resolve(null);
    });
    expect(screen.queryByTestId('storage-breakdown-card')).toBeNull();
    expect(screen.queryByText('Cloud files')).toBeNull();
  });

  it('does not ask the server or show anything in Local mode', async () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const screen = render(<StorageBreakdownCard />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchBreakdown).not.toHaveBeenCalled();
    expect(screen.queryByTestId('storage-breakdown-card')).toBeNull();
  });

  it('does not ask the server when Cloud mode has no signed-in account', async () => {
    useAuthStore.setState({ isClerkSignedIn: false, clerkUserId: null });
    const screen = render(<StorageBreakdownCard />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchBreakdown).not.toHaveBeenCalled();
    expect(screen.queryByTestId('storage-breakdown-card')).toBeNull();
  });

  it('stays hidden when the first read fails, so an offline phone never shows a feature an older server cannot supply', async () => {
    fetchBreakdown.mockRejectedValueOnce(new Error('offline'));
    const screen = render(<StorageBreakdownCard />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchBreakdown).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('storage-breakdown-card')).toBeNull();
    expect(screen.queryByText('Unavailable')).toBeNull();
    expect(screen.queryByLabelText('Try reading cloud files again')).toBeNull();
  });

  it('says Unavailable with Try again when a later read fails, then Measuring while it retries', async () => {
    const screen = render(<StorageBreakdownCard />);
    await waitFor(() => screen.getByLabelText('Documents. 37 MB'));

    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
    });
    fetchBreakdown.mockRejectedValueOnce(new Error('offline'));
    act(() => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
    });

    await waitFor(() =>
      expect(screen.getByTestId('storage-breakdown-documents-size')).toHaveTextContent(
        'Unavailable',
      ),
    );
    expect(screen.getByTestId('storage-breakdown-images-size')).toHaveTextContent('Unavailable');

    const retry = deferred<{ documentsBytes: number; imagesBytes: number }>();
    fetchBreakdown.mockReturnValueOnce(retry.promise);
    fireEvent.press(screen.getByLabelText('Try reading cloud files again'));
    await waitFor(() =>
      expect(screen.getByTestId('storage-breakdown-documents-size')).toHaveTextContent(
        'Measuring…',
      ),
    );
    expect(screen.queryByLabelText('Try reading cloud files again')).toBeNull();

    await act(async () => {
      retry.resolve({ documentsBytes: 2 * MB, imagesBytes: 3 * MB });
    });
    expect(screen.getByTestId('storage-breakdown-documents-size')).toHaveTextContent('2 MB');
    expect(screen.getByTestId('storage-breakdown-images-size')).toHaveTextContent('3 MB');
    expect(screen.queryByLabelText('Try reading cloud files again')).toBeNull();
  });

  it('does not treat a failure for a new account as proof that the server sends the breakdown', async () => {
    const screen = render(<StorageBreakdownCard />);
    await waitFor(() => screen.getByLabelText('Documents. 37 MB'));

    fetchBreakdown.mockRejectedValueOnce(new Error('offline'));
    act(() => {
      useAuthStore.setState({ clerkUserId: 'user-b' });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('storage-breakdown-card')).toBeNull();
  });

  it('never shows a limit, a meter or an upgrade next to the sizes', async () => {
    const screen = render(<StorageBreakdownCard />);
    await waitFor(() => screen.getByLabelText('Documents. 37 MB'));

    expect(screen.queryByText(/\bof\b/i)).toBeNull();
    expect(screen.queryByText(/upgrade|plan|limit/i)).toBeNull();
  });

  it('drops the previous account sizes when another account signs in on the same screen', async () => {
    const second = deferred<{ documentsBytes: number; imagesBytes: number }>();
    const screen = render(<StorageBreakdownCard />);
    await waitFor(() => screen.getByLabelText('Documents. 37 MB'));

    fetchBreakdown.mockReturnValueOnce(second.promise);
    act(() => {
      useAuthStore.setState({ clerkUserId: 'user-b' });
    });
    expect(screen.queryByLabelText('Documents. 37 MB')).toBeNull();

    await act(async () => {
      second.resolve({ documentsBytes: 5 * MB, imagesBytes: 6 * MB });
    });
    expect(screen.getByLabelText('Documents. 5 MB')).toBeTruthy();
  });

  it('is placed below On This Device so the device-only notice stays beside the device totals', async () => {
    const screen = render(<StorageManagerScreen />);
    await waitFor(() => screen.getByTestId('storage-breakdown-card'));

    const titles = screen
      .getAllByText(/^(Cloud files|On This Device)$/)
      .map((n) => n.props.children);
    expect(titles).toEqual(['On This Device', 'Cloud files']);
  });

  it('is absent from the Storage screen in Local mode', async () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const screen = render(<StorageManagerScreen />);
    await waitFor(() => screen.getByTestId('storage-cache-bytes'));

    expect(screen.queryByTestId('storage-breakdown-card')).toBeNull();
    expect(fetchBreakdown).not.toHaveBeenCalled();
  });
});
