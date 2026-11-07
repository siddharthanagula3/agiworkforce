/* eslint-disable @typescript-eslint/no-require-imports */
import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockExport = jest.fn();
const mockSnapshot = jest.fn();
let mockEpochChanged: () => void;
let mockBlur: (() => void) | undefined;
let mockFocus: () => void;
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => () => void) => {
    const React = require('react');
    React.useEffect(() => {
      mockFocus = () => { mockBlur = callback(); };
      mockFocus();
      return () => mockBlur?.();
    }, [callback]);
  },
}));
jest.mock('../services/dsarExport', () => ({
  exportAllUserData: (...args: unknown[]) => mockExport(...args),
}));
jest.mock('../src/features/settings/data-controls/localDataSnapshot', () => ({
  buildLocalDataExportSnapshot: () => mockSnapshot(),
  LocalExportAuthorityError: class LocalExportAuthorityError extends Error {},
}));
jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  subscribeCloudAccountEpochChange: (listener: () => void) => {
    mockEpochChanged = listener;
    return jest.fn();
  },
}));
import { useLocalDataExport } from '../src/features/settings/data-controls/useLocalDataExport';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('local data export caller lifetime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSnapshot.mockReturnValue({});
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('retires work on blur and does not let its completion reset a newer export', async () => {
    const old = deferred();
    const next = deferred();
    mockExport.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const { result } = renderHook(() => useLocalDataExport());
    let oldRun!: Promise<void>;
    act(() => { oldRun = result.current.handleExport(); });
    const oldAssert = mockExport.mock.calls[0][2] as () => void;
    act(() => { mockBlur?.(); mockFocus(); });
    expect(oldAssert).toThrow('no longer active');
    let nextRun!: Promise<void>;
    act(() => { nextRun = result.current.handleExport(); });
    await act(async () => { old.reject(new Error('late error')); await oldRun; });
    expect(result.current.exporting).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    await act(async () => { next.resolve(); await nextRun; });
    expect(result.current.exporting).toBe(false);
  });

  it('retires Cloud-owned work on epoch change but keeps device-only work active', async () => {
    let valid = true;
    mockSnapshot.mockReturnValueOnce({ assertAuthority: () => {
      if (!valid) throw new Error('stale');
    } }).mockReturnValueOnce({});
    const cloud = deferred();
    const local = deferred();
    mockExport.mockReturnValueOnce(cloud.promise).mockReturnValueOnce(local.promise);
    const { result } = renderHook(() => useLocalDataExport());
    let cloudRun!: Promise<void>;
    act(() => { cloudRun = result.current.handleExport(); });
    act(() => { valid = false; mockEpochChanged(); });
    expect(result.current.exporting).toBe(false);
    let localRun!: Promise<void>;
    act(() => { localRun = result.current.handleExport(); mockEpochChanged(); });
    expect(result.current.exporting).toBe(true);
    await act(async () => { cloud.reject(new Error('stale')); await cloudRun; });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(result.current.exporting).toBe(true);
    await act(async () => { local.resolve(); await localRun; });
  });
});
