import type { Pool, QueryResult } from '@neondatabase/serverless';

export async function queryWithStatementTimeout(
  pool: Pick<Pool, 'connect'>,
  sql: string,
  params: unknown[],
  timeoutMs: number,
  reportTransportError: (error: unknown) => void,
): Promise<QueryResult> {
  const client = await pool.connect();
  client.on('error', reportTransportError);
  let releaseError: Error | undefined;
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('statement_timeout', $1, true)", [String(timeoutMs)]);
    const result = await client.query(sql, params);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    releaseError =
      error instanceof Error ? error : new Error('Signaling database transaction failed');
    throw error;
  } finally {
    try {
      client.release(releaseError);
    } finally {
      client.off('error', reportTransportError);
    }
  }
}
