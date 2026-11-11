import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSocketPostgresTestClient, type LocalPostgresTestClient } from './adapters/postgres';
import { DataLayerConfigError } from './types';

export type { LocalPostgresTestClient, LocalPostgresTestResult } from './adapters/postgres';

export function createLocalPostgresTestClient(config: {
  host?: string;
  database?: string;
  user?: string;
  port?: number;
  password?: string;
  connectionString?: string;
}): LocalPostgresTestClient {
  const url = config.connectionString ? new URL(config.connectionString) : null;
  const host = url ? url.searchParams.get('host') : config.host;
  if (!host || !path.isAbsolute(host)) {
    throw new DataLayerConfigError('The PostgreSQL test client requires a temporary Unix socket');
  }
  const socket = fs.realpathSync(host);
  const temporaryRoots = [os.tmpdir(), '/tmp'].filter((root) => fs.existsSync(root));
  if (
    !temporaryRoots.some((root) => {
      const relative = path.relative(fs.realpathSync(root), socket);
      return (
        relative.length > 0 &&
        relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
      );
    })
  ) {
    throw new DataLayerConfigError(
      'The PostgreSQL test client refuses sockets outside a temporary fixture',
    );
  }
  const database = url ? decodeURIComponent(url.pathname.slice(1)) : config.database;
  if (!database) throw new DataLayerConfigError('The PostgreSQL test database is required');
  return createSocketPostgresTestClient({
    host: socket,
    database,
    ...(url?.username
      ? { user: decodeURIComponent(url.username) }
      : config.user
        ? { user: config.user }
        : {}),
    ...(url?.password
      ? { password: decodeURIComponent(url.password) }
      : config.password
        ? { password: config.password }
        : {}),
    ...(url?.port
      ? { port: Number(url.port) }
      : config.port !== undefined
        ? { port: config.port }
        : {}),
  });
}
