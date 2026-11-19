jest.mock('expo-sqlite', () => ({
  defaultDatabaseDirectory: '/data/app/Documents/SQLite',
  openDatabaseAsync: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WUTDO',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32).fill(7)),
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  getInfoAsync: jest.fn(),
  moveAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

jest.mock('@/src/platform/backupExclusion', () => ({
  excludeFromBackup: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/mmkv', () => {
  const values = new Map<string, string>();
  return {
    whenMmkvReady: (cb: () => void) => cb(),
    storage: {
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
      delete: (key: string) => values.delete(key),
    },
  };
});

import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { deleteAsync, getInfoAsync, moveAsync } from 'expo-file-system/legacy';
import { excludeFromBackup } from '@/src/platform/backupExclusion';
import { closeDb, getDb } from '@/storage/db';
import { acknowledgeLocalDataReset, useLocalDataResetStore } from '@/storage/localDataReset';

const DB = 'file:///data/app/Documents/SQLite/agi_mobile.db';
const NOW = 1_700_000_000_000;
const ASIDE = `file:///data/app/Documents/SQLite/agi_mobile.unreadable-${NOW}.db`;
const WRONG_KEY =
  "Call to function 'NativeDatabase.execAsync' has been rejected.\n→ Caused by: Error code 26: file is not a database";

const getItemAsync = SecureStore.getItemAsync as jest.Mock;
const setItemAsync = SecureStore.setItemAsync as jest.Mock;
const openDatabaseAsync = SQLite.openDatabaseAsync as jest.Mock;

let files: Set<string>;

function fakeDatabase(failure?: string) {
  return {
    execAsync: jest.fn(async (sql: string) => {
      if (failure && !sql.startsWith('PRAGMA key')) throw new Error(failure);
    }),
    runAsync: jest.fn(),
    getFirstAsync: jest.fn().mockResolvedValue({ user_version: 999 }),
    getAllAsync: jest.fn().mockResolvedValue([]),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    closeAsync: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await closeDb();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  files = new Set();
  (getInfoAsync as jest.Mock).mockImplementation(async (uri: string) => ({
    exists: files.has(uri),
  }));
  (moveAsync as jest.Mock).mockImplementation(
    async ({ from, to }: { from: string; to: string }) => {
      files.delete(from);
      files.add(to);
    },
  );
  openDatabaseAsync.mockReset().mockResolvedValue(fakeDatabase());
  getItemAsync.mockReset();
  acknowledgeLocalDataReset(['chats', 'memory']);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await closeDb();
});

describe('Local database restored from another phone', () => {
  it('sets the old database aside, starts a fresh one and tells the person why', async () => {
    getItemAsync.mockResolvedValue(null);
    files.add(DB);
    files.add(`${DB}-wal`);

    await expect(getDb()).resolves.toBeDefined();

    expect(moveAsync).toHaveBeenCalledWith({ from: DB, to: ASIDE });
    expect(moveAsync).toHaveBeenCalledWith({ from: `${DB}-wal`, to: `${ASIDE}-wal` });
    expect(files.has(ASIDE)).toBe(true);
    expect(deleteAsync).not.toHaveBeenCalled();
    expect(setItemAsync).toHaveBeenCalledWith(
      'agi_sqlcipher_db_key_v1',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      { keychainAccessible: 'WUTDO' },
    );
    expect(useLocalDataResetStore.getState().pending).toEqual(['memory']);
    expect(excludeFromBackup).toHaveBeenCalledWith([ASIDE, `${ASIDE}-wal`]);
  });

  it('recovers a database the stored key cannot open instead of failing on every launch', async () => {
    getItemAsync.mockResolvedValue('c'.repeat(64));
    files.add(DB);
    const unreadable = fakeDatabase(WRONG_KEY);
    const fresh = fakeDatabase();
    openDatabaseAsync.mockResolvedValueOnce(unreadable).mockResolvedValueOnce(fresh);

    await expect(getDb()).resolves.toBeDefined();

    expect(unreadable.closeAsync).toHaveBeenCalled();
    expect(moveAsync).toHaveBeenCalledWith({ from: DB, to: ASIDE });
    expect(openDatabaseAsync).toHaveBeenCalledTimes(2);
    expect(fresh.execAsync).toHaveBeenCalledWith(`PRAGMA key = "x'${'c'.repeat(64)}'";`);
    expect(setItemAsync).not.toHaveBeenCalled();
    expect(useLocalDataResetStore.getState().pending).toEqual(['memory']);
  });

  it('leaves the database in place when it fails for any reason other than the key', async () => {
    getItemAsync.mockResolvedValue('c'.repeat(64));
    files.add(DB);
    openDatabaseAsync.mockResolvedValue(fakeDatabase('Error code 5: database is locked'));

    await expect(getDb()).rejects.toThrow('database is locked');

    expect(moveAsync).not.toHaveBeenCalled();
    expect(files.has(DB)).toBe(true);
    expect(useLocalDataResetStore.getState().pending).toEqual([]);
  });

  it('never sets the database aside when the keychain cannot be read', async () => {
    getItemAsync.mockRejectedValue(new Error('User interaction is not allowed.'));
    files.add(DB);

    await expect(getDb()).rejects.toThrow('User interaction is not allowed.');

    expect(moveAsync).not.toHaveBeenCalled();
    expect(setItemAsync).not.toHaveBeenCalled();
  });

  it('starts a first install without a notice', async () => {
    getItemAsync.mockResolvedValue(null);

    await getDb();

    expect(moveAsync).not.toHaveBeenCalled();
    expect(useLocalDataResetStore.getState().pending).toEqual([]);
  });

  it('never replaces an earlier copy that was set aside', async () => {
    getItemAsync.mockResolvedValue(null);
    files.add(DB);
    files.add(ASIDE);

    await getDb();

    const second = `file:///data/app/Documents/SQLite/agi_mobile.unreadable-${NOW}-1.db`;
    expect(moveAsync).toHaveBeenCalledWith({ from: DB, to: second });
    expect(files.has(ASIDE)).toBe(true);
    expect(files.has(second)).toBe(true);
  });
});
