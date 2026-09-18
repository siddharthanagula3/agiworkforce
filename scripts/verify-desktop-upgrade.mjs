#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const SQLITE_MAGIC = Buffer.from([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
]);

function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      options._.push(token);
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`missing value for --${key}`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

// SQLite's write-ahead and rollback sidecars are transient: a crash leaves them
// behind and the next clean open removes them. Counting them as user data would
// report a recovered crash as an upgrade that deleted something.
const TRANSIENT_SUFFIXES = ['-journal', '-wal', '-shm'];

function listFiles(root) {
  const entries = [];
  const walk = (directory, prefix) => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(absolute, relative);
      } else if (
        entry.isFile() &&
        !TRANSIENT_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
      ) {
        entries.push({ path: relative, absolute });
      }
    }
  };
  walk(root, '');
  return entries;
}

export function readSchemaVersion(databasePath) {
  const handle = fs.openSync(databasePath, 'r');
  try {
    const header = Buffer.alloc(16);
    fs.readSync(handle, header, 0, 16, 0);
    if (!header.equals(SQLITE_MAGIC)) {
      return { readable: false, reason: 'encrypted-or-not-sqlite' };
    }
  } finally {
    fs.closeSync(handle);
  }

  // A crash leaves a hot journal, and a read-only open refuses to roll it back.
  // That is an unreadable database, not a reason to abandon the check.
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const rows = database
      .prepare("select name from sqlite_master where type = 'table' and name = 'schema_version'")
      .all();
    if (rows.length === 0) {
      return { readable: false, reason: 'no-schema-version-table' };
    }
    const [row] = database.prepare('select max(version) as version from schema_version').all();
    return { readable: true, version: Number(row?.version ?? 0) };
  } catch {
    return { readable: false, reason: 'locked-or-hot-journal' };
  } finally {
    database.close();
  }
}

export function snapshot(dataDir, { database } = {}) {
  const files = listFiles(dataDir).map((entry) => ({
    path: entry.path,
    size: fs.statSync(entry.absolute).size,
    digest: createHash('sha256').update(fs.readFileSync(entry.absolute)).digest('hex'),
  }));
  const databasePath = database ? path.join(dataDir, database) : null;
  return {
    dataDir,
    files,
    schema:
      databasePath && fs.existsSync(databasePath)
        ? readSchemaVersion(databasePath)
        : { readable: false, reason: 'missing-database' },
  };
}

export function compareUpgrade(before, after, { preserve = [] } = {}) {
  const failures = [];
  const afterByPath = new Map(after.files.map((entry) => [entry.path, entry]));

  for (const entry of before.files) {
    if (!afterByPath.has(entry.path)) {
      failures.push(`upgrade removed user data: ${entry.path}`);
    }
  }
  for (const relative of preserve) {
    const beforeEntry = before.files.find((entry) => entry.path === relative);
    const afterEntry = afterByPath.get(relative);
    if (!beforeEntry) {
      failures.push(`seeded fixture is missing before the upgrade: ${relative}`);
      continue;
    }
    if (!afterEntry) {
      failures.push(`upgrade removed a preserved file: ${relative}`);
      continue;
    }
    if (beforeEntry.digest !== afterEntry.digest) {
      failures.push(`upgrade rewrote a file that must survive byte-for-byte: ${relative}`);
    }
  }

  if (!before.schema.readable && before.schema.reason === 'missing-database') {
    failures.push('the previous version never created its database, so no migration was exercised');
  }
  if (
    before.schema.readable &&
    after.schema.readable &&
    after.schema.version < before.schema.version
  ) {
    failures.push(
      `schema went backwards during upgrade: ${before.schema.version} -> ${after.schema.version}`,
    );
  }
  if (before.schema.readable && !after.schema.readable) {
    failures.push(`upgrade left the database unreadable: ${after.schema.reason}`);
  }

  return failures;
}

/**
 * Where an installed build keeps the data an upgrade has to preserve. The Linux
 * job was the only one that ever ran, so the other two paths were never named
 * anywhere and could not be checked. The identifier is the one tauri.conf.json
 * declares, never a second copy of it.
 */
export function platformDataDir(platform, identifier, env = process.env, home = os.homedir()) {
  if (!identifier) throw new Error('platformDataDir needs the bundle identifier');
  if (platform === 'linux') {
    const base = env.XDG_DATA_HOME || path.join(home, '.local', 'share');
    return path.join(base, identifier);
  }
  if (platform === 'macos') {
    return path.join(home, 'Library', 'Application Support', identifier);
  }
  if (platform === 'windows') {
    const base = env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(base, identifier);
  }
  throw new Error(`unknown platform ${platform}; expected linux, macos or windows`);
}

function constantFrom(source, name) {
  const match = new RegExp(`pub const ${name}: u32 = (\\d+);`).exec(source);
  if (!match) throw new Error(`${name} is no longer declared in the upgrade module`);
  return Number.parseInt(match[1], 10);
}

/**
 * The bundled llama.cpp runtime is a compile-time feature, so without its own
 * number it inherits the app version and an updater cannot tell a runtime
 * change from a UI change. This is what keeps the two in step.
 */
export function runtimeVersionFailures({ upgradeSource, cargoToml }) {
  const failures = [];
  const runtime = constantFrom(upgradeSource, 'LOCAL_RUNTIME_VERSION');
  const floor = constantFrom(upgradeSource, 'MIN_COMPATIBLE_RUNTIME_VERSION');
  const dataFormat = constantFrom(upgradeSource, 'LOCAL_DATA_FORMAT_VERSION');
  const sidecar = constantFrom(upgradeSource, 'SIDECAR_DAEMON_VERSION');

  if (floor > runtime) {
    failures.push(
      `MIN_COMPATIBLE_RUNTIME_VERSION ${floor} is above LOCAL_RUNTIME_VERSION ${runtime}, so this build refuses its own runtime`,
    );
  }
  if (dataFormat < 1 || sidecar < 1) {
    failures.push('LOCAL_DATA_FORMAT_VERSION and SIDECAR_DAEMON_VERSION must start at 1');
  }
  if (!/llama-cpp-2\s*=/.test(cargoToml)) {
    failures.push('llama-cpp-2 is no longer a dependency; retire LOCAL_RUNTIME_VERSION with it');
    return failures;
  }
  const declared = /llama-cpp-2\s*=\s*\{\s*version\s*=\s*"([^"]+)"/.exec(cargoToml)?.[1];
  if (!declared) {
    failures.push('the llama-cpp-2 dependency no longer declares a version');
    return failures;
  }
  const reviewed = /pub const LOCAL_RUNTIME_DEPENDENCY: &str = "([^"]+)";/.exec(upgradeSource)?.[1];
  if (reviewed === undefined) {
    failures.push('LOCAL_RUNTIME_DEPENDENCY is no longer declared in the upgrade module');
  } else if (reviewed !== declared) {
    failures.push(
      `llama-cpp-2 is at ${declared} but LOCAL_RUNTIME_DEPENDENCY still records ${reviewed}; ` +
        'bump LOCAL_RUNTIME_VERSION so the updater can tell the runtime moved',
    );
  }
  return failures;
}

export function compareRollback(afterUpgrade, afterRollback, { preserve = [] } = {}) {
  const failures = [];
  const byPath = new Map(afterRollback.files.map((entry) => [entry.path, entry]));
  for (const relative of preserve) {
    if (!byPath.has(relative)) {
      failures.push(`rollback lost a preserved file: ${relative}`);
    }
  }
  if (afterUpgrade.schema.readable && !afterRollback.schema.readable) {
    failures.push(`rollback left the database unreadable: ${afterRollback.schema.reason}`);
  }
  return failures;
}

function repoRootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function bundleIdentifier() {
  const config = JSON.parse(
    fs.readFileSync(path.join(repoRootDir(), 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'),
  );
  if (!config.identifier) throw new Error('tauri.conf.json declares no bundle identifier');
  return config.identifier;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0];
  const preserve = options.preserve ? options.preserve.split(',').filter(Boolean) : [];

  if (command === 'runtime') {
    const repoRoot = repoRootDir();
    const failures = runtimeVersionFailures({
      upgradeSource: fs.readFileSync(
        path.join(repoRoot, 'apps/desktop/src-tauri/src/upgrade/mod.rs'),
        'utf8',
      ),
      cargoToml: fs.readFileSync(path.join(repoRoot, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8'),
    });
    if (failures.length > 0) {
      for (const failure of failures) process.stderr.write(`ERROR: ${failure}\n`);
      process.exit(1);
    }
    process.stdout.write('local runtime, data format and sidecar versions are consistent\n');
    return;
  }

  if (command === 'datadir') {
    if (!options.platform) throw new Error('datadir requires --platform');
    process.stdout.write(`${platformDataDir(options.platform, bundleIdentifier())}\n`);
    return;
  }

  if (command === 'snapshot') {
    const dataDir =
      options['data-dir'] ??
      (options.platform && platformDataDir(options.platform, bundleIdentifier()));
    if (!dataDir || !options.out) {
      throw new Error('snapshot requires --out and one of --data-dir or --platform');
    }
    const result = snapshot(dataDir, { database: options.database });
    fs.writeFileSync(options.out, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(
      `${options.out}: ${result.files.length} files, schema ${JSON.stringify(result.schema)}\n`,
    );
    return;
  }

  if (command === 'compare') {
    if (!options.before || !options.after) {
      throw new Error('compare requires --before and --after');
    }
    const before = JSON.parse(fs.readFileSync(options.before, 'utf8'));
    const after = JSON.parse(fs.readFileSync(options.after, 'utf8'));
    const failures = options.rollback
      ? compareRollback(before, after, { preserve })
      : compareUpgrade(before, after, { preserve });
    if (failures.length > 0) {
      for (const failure of failures) {
        process.stderr.write(`ERROR: ${failure}\n`);
      }
      process.exit(1);
    }
    process.stdout.write('desktop upgrade invariants hold\n');
    return;
  }

  throw new Error('usage: verify-desktop-upgrade.mjs <snapshot|compare|runtime|datadir> [options]');
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exit(1);
  }
}
