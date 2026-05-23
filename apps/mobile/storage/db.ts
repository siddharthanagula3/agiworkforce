import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { MIGRATION_SQL } from './migrations';

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

const DB_NAME = 'agi_mobile.db';
const DB_KEY_STORAGE_ID = 'agi_sqlcipher_db_key_v1';
const HEX_256_BIT_KEY = /^[0-9a-f]{64}$/;

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

async function readOrCreateDbKey(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DB_KEY_STORAGE_ID);
  if (stored && HEX_256_BIT_KEY.test(stored)) return stored;

  const key = await generateDbKey();
  await SecureStore.setItemAsync(DB_KEY_STORAGE_ID, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
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
    await db.execAsync(migration.sql);
    const ver = Math.floor(Number(migration.version));
    if (!Number.isFinite(ver) || ver < 0) throw new Error(`Invalid migration version: ${migration.version}`);
    await db.execAsync(`PRAGMA user_version = ${ver};`);
  }
}

async function openEncryptedDb(): Promise<DbHandle> {
  const key = await readOrCreateDbKey();
  const sqliteDb = await SQLite.openDatabaseAsync(DB_NAME, { useNewConnection: false });
  const db = asDbHandle(sqliteDb);

  await db.execAsync(`PRAGMA key = "x'${key}'";`);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await runMigrations(db);

  dbInstance = db;
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

export async function rekeyDb(newKey: string): Promise<void> {
  if (!HEX_256_BIT_KEY.test(newKey)) {
    throw new Error('SQLCipher key must be a 64-character lowercase hex string.');
  }
  const db = await getDb();
  await db.execAsync(`PRAGMA rekey = "x'${newKey}'";`);
  await SecureStore.setItemAsync(DB_KEY_STORAGE_ID, newKey, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
