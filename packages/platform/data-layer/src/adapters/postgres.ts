import { type DatabaseAdapter, NotImplementedError, type DatabaseConnectionConfig } from '../types';

const MIGRATION_GUIDE = `
1. pnpm --filter @agiworkforce/data-layer add pg @types/pg
2. Apply SQL from apps/web/db/neon/ to your target Postgres.
3. Pair with an AuthAdapter that mints JWT-like claims.
4. Set AGI_DATABASE_URL=postgresql://user:pwd@host:5432/db?sslmode=require.
5. Replace this skeleton, see the JSDoc reference implementation.

`.trim();

export class PostgresDatabaseAdapter implements DatabaseAdapter {
  constructor(_config: DatabaseConnectionConfig) {
    // Lazy. Don't connect at construction.
  }

  async query<T = Record<string, unknown>>(_sql: string, _params?: unknown[]): Promise<T[]> {
    throw new NotImplementedError('Postgres', 'query', MIGRATION_GUIDE);
  }

  async execute(_sql: string, _params?: unknown[]): Promise<number> {
    throw new NotImplementedError('Postgres', 'execute', MIGRATION_GUIDE);
  }

  async transaction<T>(_fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    throw new NotImplementedError('Postgres', 'transaction', MIGRATION_GUIDE);
  }

  withUser(_jwt: string): DatabaseAdapter {
    throw new NotImplementedError('Postgres', 'withUser', MIGRATION_GUIDE);
  }

  withOrg(_organizationId: string | null): DatabaseAdapter {
    throw new NotImplementedError('Postgres', 'withOrg', MIGRATION_GUIDE);
  }

  async dispose(): Promise<void> {
    // No-op until pooled connections exist.
  }
}
