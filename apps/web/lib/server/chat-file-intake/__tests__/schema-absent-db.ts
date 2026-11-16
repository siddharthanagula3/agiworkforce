import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const SCHEMA_PROBE = /\bto_regclass\s*\(|\binformation_schema\s*\.\s*columns\b/i;
const NAMES_CHAT_FILE_SCHEMA = /chat_file_|scanned_sha256/i;

const ABSENT_PROBE_ROW = Object.freeze({
  intakes_table: false,
  preparations_table: false,
  scanned_sha256_column: false,
});

export class ChatFileSchemaReachedError extends Error {
  constructor(readonly sql: string) {
    super(`A database without migration 0422 was sent: ${sql.replace(/\s+/g, ' ').slice(0, 200)}`);
    this.name = 'ChatFileSchemaReachedError';
  }
}

type DelegateAdapter = Pick<DatabaseAdapter, 'query'> & Partial<DatabaseAdapter>;

function refuseChatFileSchema(sql: string): void {
  if (NAMES_CHAT_FILE_SCHEMA.test(sql)) throw new ChatFileSchemaReachedError(sql);
}

function missing(method: string): never {
  throw new Error(`The adapter given to createSchemaAbsentDb has no ${method}.`);
}

/**
 * A database that has not had 0422 applied: probes of the chat file schema answer absent,
 * any other statement naming a chat file table or the scan verdict column
 * throws, and everything else goes to the adapter the test supplies.
 */
export function createSchemaAbsentDb(delegate: DelegateAdapter): DatabaseAdapter {
  return {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
      if (SCHEMA_PROBE.test(sql) && NAMES_CHAT_FILE_SCHEMA.test(sql)) {
        return [{ ...ABSENT_PROBE_ROW } as T];
      }
      refuseChatFileSchema(sql);
      return params === undefined ? delegate.query<T>(sql) : delegate.query<T>(sql, params);
    },
    async execute(sql: string, params?: unknown[]): Promise<number> {
      refuseChatFileSchema(sql);
      if (!delegate.execute) return missing('execute');
      return params === undefined ? delegate.execute(sql) : delegate.execute(sql, params);
    },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
      if (!delegate.transaction) return fn(createSchemaAbsentDb(delegate));
      return delegate.transaction((tx) => fn(createSchemaAbsentDb(tx)));
    },
    withUser(jwt: string): DatabaseAdapter {
      if (!delegate.withUser) return missing('withUser');
      return createSchemaAbsentDb(delegate.withUser(jwt));
    },
    withOrg(organizationId: string | null): DatabaseAdapter {
      if (!delegate.withOrg) return missing('withOrg');
      return createSchemaAbsentDb(delegate.withOrg(organizationId));
    },
    async dispose(): Promise<void> {
      await delegate.dispose?.();
    },
  };
}
