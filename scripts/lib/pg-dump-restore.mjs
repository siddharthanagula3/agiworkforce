import { join } from 'node:path';
import process from 'node:process';

const DEFAULT_PORT = '5432';
const DUMP_FORMAT = 'custom';

export function pgConnectionParams(connectionString) {
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: url.port || DEFAULT_PORT,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    sslmode: url.searchParams.get('sslmode'),
  };
}

export function withDatabase(connectionString, database) {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

export function pgEnvFromParams(params, baseEnv = process.env) {
  const env = {
    ...baseEnv,
    PGHOST: params.host,
    PGPORT: params.port,
    PGUSER: params.user,
    PGPASSWORD: params.password,
  };
  if (params.sslmode) env.PGSSLMODE = params.sslmode;
  return env;
}

export function resolveBinaryPath(binaryName, binDir) {
  return binDir ? join(binDir, binaryName) : binaryName;
}

export function buildPgDumpInvocation({ binDir, sourceParams, dumpFilePath, baseEnv }) {
  return {
    command: resolveBinaryPath('pg_dump', binDir),
    args: [
      `--format=${DUMP_FORMAT}`,
      '--no-owner',
      '--no-privileges',
      '--dbname',
      sourceParams.database,
      '--file',
      dumpFilePath,
    ],
    env: pgEnvFromParams(sourceParams, baseEnv),
  };
}

export function buildPgRestoreInvocation({ binDir, targetParams, dumpFilePath, baseEnv }) {
  return {
    command: resolveBinaryPath('pg_restore', binDir),
    args: ['--no-owner', '--no-privileges', '--dbname', targetParams.database, dumpFilePath],
    env: pgEnvFromParams(targetParams, baseEnv),
  };
}

export async function runCommand(spawnImpl, { command, args, env }) {
  const result = await spawnImpl(command, args, { env });
  if (result.code !== 0) {
    throw new Error(`${command} exited with code ${result.code}: ${result.stderr ?? ''}`.trim());
  }
  return result;
}
