import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { reportLocalDataReset } from './localDataReset';
import { MIGRATION_SQL } from './migrations';
import { deleteSetAsideCopies, SET_ASIDE_MARKER, setAsideUnreadableFiles } from './unreadableFiles';

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface DbHandle {
  runAsync(sql: string, params?: unknown[]): Promise<RunResult>;
  getAllAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  getFirstAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;
  execAsync(sql: string): Promise<void>;
  withTransactionAsync<T>(fn: () => Promise<T>): Promise<T>;
  closeAsync?(): Promise<void>;
}

const DB_BASENAME = 'agi_mobile';
const DB_NAME = `${DB_BASENAME}.db`;
const DB_COMPANION_SUFFIXES = ['-wal', '-shm'] as const;
const DB_KEY_STORAGE_ID = 'agi_sqlcipher_db_key_v1';
const HEX_256_BIT_KEY = /^[0-9a-f]{64}$/;
const SQLITE_NOT_A_DATABASE = /\bError code 26\b|file is not a database/i;

let dbInstance: DbHandle | null = null;
let dbOpenPromise: Promise<DbHandle> | null = null;

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] as number).toString(16).padStart(2, '0');
  }
  return out;
}

async function generateDbKey(): Promise<string> {
  return bytesToHex(await Crypto.getRandomBytesAsync(32));
}

async function readStoredDbKey(): Promise<string | null> {
  const stored = await SecureStore.getItemAsync(DB_KEY_STORAGE_ID);
  return stored && HEX_256_BIT_KEY.test(stored) ? stored : null;
}

async function createDbKey(): Promise<string> {
  const key = await generateDbKey();
  await SecureStore.setItemAsync(DB_KEY_STORAGE_ID, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

function databaseDirectoryUri(): string | null {
  const directory = SQLite.defaultDatabaseDirectory;
  return directory ? `file://${directory.replace(/\/+$/, '')}` : null;
}

export async function deleteSetAsideDatabases(): Promise<void> {
  const directory = databaseDirectoryUri();
  if (directory) await deleteSetAsideCopies(directory);
}

function isUnreadableWithKey(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return SQLITE_NOT_A_DATABASE.test(message);
}

/**
 * The key is kept this-device-only, so a backup restored onto another phone
 * brings the database without its key. That copy is renamed rather than
 * deleted, and the person is told why their Local data is not there.
 */
async function setAsideUnreadableDb(): Promise<boolean> {
  const directory = databaseDirectoryUri();
  if (!directory) return false;
  const base = `${directory}/${DB_BASENAME}`;
  const setAside = await setAsideUnreadableFiles({
    uri: `${base}.db`,
    asideUri: (attempt) =>
      `${base}${SET_ASIDE_MARKER}${Date.now()}${attempt > 0 ? `-${attempt}` : ''}.db`,
    companionSuffixes: DB_COMPANION_SUFFIXES,
  });
  if (setAside) reportLocalDataReset('memory');
  return setAside;
}

function asDbHandle(db: SQLite.SQLiteDatabase): DbHandle {
  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: (sql, params) => db.runAsync(sql, params),
    getAllAsync: <T = unknown>(sql: string, params?: unknown[]) => db.getAllAsync<T>(sql, params),
    getFirstAsync: <T = unknown>(sql: string, params?: unknown[]) =>
      db.getFirstAsync<T>(sql, params),
    async withTransactionAsync<T>(fn: () => Promise<T>): Promise<T> {
      let result: T | undefined;
      await db.withTransactionAsync(async () => {
        result = await fn();
      });
      return result as T;
    },
    closeAsync: () => db.closeAsync(),
  };
}

function readUserVersion(row: Record<string, unknown> | null): number {
  const raw = row?.user_version ?? row?.['PRAGMA user_version'];
  return typeof raw === 'number' ? raw : 0;
}

async function runMigrations(db: DbHandle): Promise<void> {
  const row = await db.getFirstAsync<Record<string, unknown>>('PRAGMA user_version;');
  const currentVersion = readUserVersion(row);

  for (const migration of MIGRATION_SQL) {
    if (migration.version <= currentVersion) continue;
    const ver = Math.floor(Number(migration.version));
    if (!Number.isFinite(ver) || ver < 0)
      throw new Error(`Invalid migration version: ${migration.version}`);
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      await db.execAsync(`PRAGMA user_version = ${ver};`);
    });
  }
}

async function openEncryptedDb(): Promise<DbHandle> {
  const stored = await readStoredDbKey();
  if (!stored) await setAsideUnreadableDb();
  const key = stored ?? (await createDbKey());

  let db: DbHandle;
  try {
    db = await openWithKey(key);
  } catch (err) {
    if (!isUnreadableWithKey(err) || !(await setAsideUnreadableDb())) throw err;
    db = await openWithKey(key);
  }

  dbInstance = db;
  return db;
}

async function openWithKey(key: string): Promise<DbHandle> {
  const sqliteDb = await SQLite.openDatabaseAsync(DB_NAME, { useNewConnection: false });
  const db = asDbHandle(sqliteDb);

  try {
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await runMigrations(db);
  } catch (err) {
    await db.closeAsync?.().catch(() => {});
    throw err;
  }
  return db;
}

export async function getDb(): Promise<DbHandle> {
  if (dbInstance) return dbInstance;
  dbOpenPromise ??= openEncryptedDb().finally(() => {
    dbOpenPromise = null;
  });
  return dbOpenPromise;
}

export async function closeDb(): Promise<void> {
  const db = dbInstance;
  dbInstance = null;
  dbOpenPromise = null;
  await db?.closeAsync?.();
}
