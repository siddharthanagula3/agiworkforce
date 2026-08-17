#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';

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
      } else if (entry.isFile()) {
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0];
  const preserve = options.preserve ? options.preserve.split(',').filter(Boolean) : [];

  if (command === 'snapshot') {
    if (!options['data-dir'] || !options.out) {
      throw new Error('snapshot requires --data-dir and --out');
    }
    const result = snapshot(options['data-dir'], { database: options.database });
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

  throw new Error('usage: verify-desktop-upgrade.mjs <snapshot|compare> [options]');
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exit(1);
  }
}
