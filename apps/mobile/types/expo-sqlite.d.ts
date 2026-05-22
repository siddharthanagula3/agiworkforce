/**
 * Type shim for expo-sqlite ~15.2.x (Expo SDK 55).
 * Active until the package is installed and provides its own types.
 * When expo-sqlite is installed, delete this file — the real types take over.
 */

declare module 'expo-sqlite' {
  export interface RunResult {
    lastInsertRowId: number;
    changes: number;
  }

  export interface SQLiteDatabase {
    execAsync(sql: string): Promise<void>;
    runAsync(sql: string, params?: unknown[]): Promise<RunResult>;
    getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
    getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
    withTransactionAsync(fn: () => Promise<void>): Promise<void>;
    closeAsync(): Promise<void>;
  }

  export interface OpenDatabaseOptions {
    useNewConnection?: boolean;
  }

  export function openDatabaseAsync(
    name: string,
    options?: OpenDatabaseOptions,
  ): Promise<SQLiteDatabase>;
}
