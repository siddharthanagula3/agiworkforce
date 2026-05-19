// AUDIT-FIX: storage layer is half-shipped from the mobile reorg. This is a
// no-op stub so the workspace typechecks; the real SQLite database wiring
// is tracked as a follow-up. Callers that depend on persistence will
// degrade gracefully (in-memory only / first-call-rebuilds-the-state).

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface DbHandle {
  runAsync(sql: string, ...params: unknown[]): Promise<RunResult>;
  getAllAsync<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T = unknown>(sql: string, ...params: unknown[]): Promise<T | null>;
  execAsync(sql: string): Promise<void>;
  withTransactionAsync<T>(fn: () => Promise<T>): Promise<T>;
  closeAsync?(): Promise<void>;
}

const noopHandle: DbHandle = {
  async runAsync() {
    return { changes: 0, lastInsertRowId: 0 };
  },
  async getAllAsync() {
    return [];
  },
  async getFirstAsync() {
    return null;
  },
  async execAsync() {
    /* no-op */
  },
  async withTransactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  },
};

export async function getDb(): Promise<DbHandle> {
  return noopHandle;
}

export async function closeDb(): Promise<void> {
  /* no-op */
}

export async function rekeyDb(_newKey: string): Promise<void> {
  /* no-op */
}
