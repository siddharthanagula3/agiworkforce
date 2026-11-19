/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WUTDO',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32).fill(9)),
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///data/app/Documents/',
  getInfoAsync: jest.fn(),
  moveAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

jest.mock('@/src/platform/backupExclusion', () => ({
  excludeFromBackup: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => {
    const values = new Map<string, string>();
    return {
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
      delete: (key: string) => values.delete(key),
    };
  }),
}));

const STORE = 'file:///data/app/Documents/mmkv/agiworkforce-mobile';
const NOW = 1_700_000_000_000;
const ASIDE = `${STORE}.unreadable-${NOW}`;

interface Loaded {
  mmkv: typeof import('@/lib/mmkv');
  reset: typeof import('@/storage/localDataReset');
  getItemAsync: jest.Mock;
  moveAsync: jest.Mock;
  deleteAsync: jest.Mock;
  MMKV: jest.Mock;
  files: Set<string>;
}

function load(storedKey: () => Promise<string | null>, existing: string[] = []): Loaded {
  jest.resetModules();
  const files = new Set(existing);
  const secureStore = require('expo-secure-store') as { getItemAsync: jest.Mock };
  const fileSystem = require('expo-file-system/legacy') as {
    getInfoAsync: jest.Mock;
    moveAsync: jest.Mock;
    deleteAsync: jest.Mock;
  };
  secureStore.getItemAsync.mockImplementation(storedKey);
  fileSystem.getInfoAsync.mockImplementation(async (uri: string) => ({ exists: files.has(uri) }));
  fileSystem.moveAsync.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
    files.delete(from);
    files.add(to);
  });
  return {
    mmkv: require('@/lib/mmkv') as typeof import('@/lib/mmkv'),
    reset: require('@/storage/localDataReset') as typeof import('@/storage/localDataReset'),
    getItemAsync: secureStore.getItemAsync,
    moveAsync: fileSystem.moveAsync,
    deleteAsync: fileSystem.deleteAsync,
    MMKV: (require('react-native-mmkv') as { MMKV: jest.Mock }).MMKV,
    files,
  };
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('encrypted key-value store restored from another phone', () => {
  it('sets the restored store aside before opening a fresh one, and says Local chats were not restored', async () => {
    const { mmkv, reset, moveAsync, deleteAsync, MMKV } = load(
      async () => null,
      [STORE, `${STORE}.crc`],
    );

    await mmkv.initMmkvEncryption();

    expect(moveAsync).toHaveBeenCalledWith({ from: STORE, to: ASIDE });
    expect(moveAsync).toHaveBeenCalledWith({ from: `${STORE}.crc`, to: `${ASIDE}.crc` });
    const moveOrder = Math.max(...moveAsync.mock.invocationCallOrder);
    expect(MMKV.mock.invocationCallOrder[0]).toBeGreaterThan(moveOrder);
    expect(deleteAsync).not.toHaveBeenCalled();
    expect(reset.useLocalDataResetStore.getState().pending).toEqual(['chats']);
    expect(mmkv.storage.getString('agi-local-data-reset-pending-v1')).toBe('["chats"]');
  });

  it('opens the store in place when this phone holds its key', async () => {
    const { mmkv, reset, moveAsync, files } = load(async () => 'd'.repeat(64), [STORE]);

    await mmkv.initMmkvEncryption();

    expect(moveAsync).not.toHaveBeenCalled();
    expect(files.has(STORE)).toBe(true);
    expect(reset.useLocalDataResetStore.getState().pending).toEqual([]);
  });

  it('starts a first install without a notice', async () => {
    const { mmkv, reset, moveAsync } = load(async () => null);

    await mmkv.initMmkvEncryption();

    expect(moveAsync).not.toHaveBeenCalled();
    expect(reset.useLocalDataResetStore.getState().pending).toEqual([]);
  });

  it('keeps the store when the keychain cannot be read', async () => {
    const { mmkv, moveAsync, MMKV } = load(async () => {
      throw new Error('User interaction is not allowed.');
    }, [STORE]);

    await expect(mmkv.initMmkvEncryption()).rejects.toThrow('User interaction is not allowed.');

    expect(moveAsync).not.toHaveBeenCalled();
    expect(MMKV).not.toHaveBeenCalled();
  });
});
