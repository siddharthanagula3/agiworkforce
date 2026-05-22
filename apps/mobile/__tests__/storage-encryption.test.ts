/**
 * Encryption-at-rest tests for the SQLite storage layer (PRD-MOBILE §12, §13).
 *
 * Verifies:
 * 1. SQLCipher key derived from Crypto.getRandomBytesAsync(32) — full 256-bit entropy.
 * 2. Key stored in SecureStore with WHEN_UNLOCKED_THIS_DEVICE_ONLY access class.
 * 3. PRAGMA key applied before any other SQL (before WAL, before migrations).
 * 4. Existing key reused from SecureStore without re-generating.
 * 5. DB opened as "agi_mobile.db".
 * 6. WAL mode enabled after keying.
 * 7. Singleton: getDb() returns same instance on repeated calls.
 *
 * Physical encryption ("file is opaque without key") is enforced by SQLCipher
 * and validated on-device via Detox (task mobile-detox).
 */

// Mocks must be declared before imports — jest hoists jest.mock() calls.
// Use jest.fn() inside the factory instead of referencing outer variables.
jest.mock('expo-sqlite', () => {
  const execAsync = jest.fn().mockResolvedValue(undefined);
  const runAsync = jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
  const getFirstAsync = jest.fn().mockResolvedValue(null);
  const getAllAsync = jest.fn().mockResolvedValue([]);
  const withTransactionAsync = jest
    .fn()
    .mockImplementation(async (fn: () => Promise<void>) => fn());
  const closeAsync = jest.fn().mockResolvedValue(undefined);

  const db = { execAsync, runAsync, getFirstAsync, getAllAsync, withTransactionAsync, closeAsync };
  return { openDatabaseAsync: jest.fn().mockResolvedValue(db) };
});

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WUTDO',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { getDb, closeDb } from '../storage/db';

const getItemAsync = SecureStore.getItemAsync as jest.MockedFunction<
  typeof SecureStore.getItemAsync
>;
const setItemAsync = SecureStore.setItemAsync as jest.MockedFunction<
  typeof SecureStore.setItemAsync
>;
const getRandomBytesAsync = Crypto.getRandomBytesAsync as jest.MockedFunction<
  typeof Crypto.getRandomBytesAsync
>;
const openDatabaseAsync = SQLite.openDatabaseAsync as jest.MockedFunction<
  typeof SQLite.openDatabaseAsync
>;

function makeBytes(len = 32): Uint8Array {
  const b = new Uint8Array(len);
  for (let i = 0; i < len; i++) b[i] = i;
  return b;
}

// Grab the mock db instance that openDatabaseAsync resolves with.
function getMockDb() {
  return openDatabaseAsync.mock.results[0]?.value as Promise<{
    execAsync: jest.Mock;
    runAsync: jest.Mock;
    getFirstAsync: jest.Mock;
    getAllAsync: jest.Mock;
    withTransactionAsync: jest.Mock;
    closeAsync: jest.Mock;
  }>;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await closeDb();

  getItemAsync.mockResolvedValue(null);
  getRandomBytesAsync.mockResolvedValue(makeBytes());
});

afterEach(async () => {
  await closeDb();
});

describe('SQLCipher key derivation', () => {
  it('uses Crypto.getRandomBytesAsync(32) to generate a new key', async () => {
    await getDb();
    expect(getRandomBytesAsync).toHaveBeenCalledWith(32);
  });

  it('stores the generated key in SecureStore with WHEN_UNLOCKED_THIS_DEVICE_ONLY', async () => {
    await getDb();
    expect(setItemAsync).toHaveBeenCalledWith(
      'agi_sqlcipher_db_key_v1',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      { keychainAccessible: 'WUTDO' },
    );
  });

  it('reuses an existing key from SecureStore without generating a new one', async () => {
    getItemAsync.mockResolvedValue('a'.repeat(64));
    await getDb();
    expect(getRandomBytesAsync).not.toHaveBeenCalled();
    expect(setItemAsync).not.toHaveBeenCalled();
  });

  it('generated key is exactly 64 lowercase hex chars (256 bits)', async () => {
    await getDb();
    const storedKey = (setItemAsync.mock.calls[0] as unknown[])[1] as string;
    expect(storedKey).toHaveLength(64);
    expect(storedKey).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('PRAGMA key application', () => {
  it('applies PRAGMA key as the first execAsync call', async () => {
    await getDb();
    const db = await getMockDb();
    const calls = db.execAsync.mock.calls as string[][];
    const keyIdx = calls.findIndex((args) => args[0]?.includes('PRAGMA key ='));
    expect(keyIdx).toBe(0);
  });

  it('WAL pragma comes after the key pragma', async () => {
    await getDb();
    const db = await getMockDb();
    const calls = db.execAsync.mock.calls as string[][];
    const keyIdx = calls.findIndex((args) => args[0]?.includes('PRAGMA key ='));
    const walIdx = calls.findIndex((args) => args[0]?.includes('PRAGMA journal_mode = WAL'));
    expect(walIdx).toBeGreaterThan(keyIdx);
  });

  it('PRAGMA key value matches the SecureStore key', async () => {
    const testKey = 'b'.repeat(64);
    getItemAsync.mockResolvedValue(testKey);
    await getDb();
    const db = await getMockDb();
    const calls = db.execAsync.mock.calls as string[][];
    const keyCall = calls.find((args) => args[0]?.includes('PRAGMA key ='));
    expect(keyCall?.[0]).toContain(`PRAGMA key = '${testKey}'`);
  });
});

describe('DB open target', () => {
  it('opens "agi_mobile.db"', async () => {
    await getDb();
    expect(openDatabaseAsync).toHaveBeenCalledWith('agi_mobile.db', expect.any(Object));
  });
});

describe('WAL mode', () => {
  it('executes WAL journal_mode pragma on init', async () => {
    await getDb();
    const db = await getMockDb();
    const calls = db.execAsync.mock.calls as string[][];
    const hasWal = calls.some((args) => args[0]?.includes('PRAGMA journal_mode = WAL'));
    expect(hasWal).toBe(true);
  });
});

describe('Singleton behaviour', () => {
  it('returns the same db instance on repeated calls', async () => {
    const db1 = await getDb();
    const db2 = await getDb();
    expect(db1).toBe(db2);
    expect(openDatabaseAsync).toHaveBeenCalledTimes(1);
  });
});
