#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { missingRouteTableMigrations } from './lib/route-table-contract.mjs';

const root = process.cwd();
const errors = [];
const migrationsDir = 'apps/web/db/neon';

function absolute(relativePath) {
  return path.join(root, relativePath);
}

if (!fs.existsSync(absolute(migrationsDir))) {
  errors.push(`Missing Neon migration directory: ${migrationsDir}`);
} else {
  const files = fs
    .readdirSync(absolute(migrationsDir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    errors.push(`${migrationsDir} must contain at least one SQL migration.`);
  }

  // Ordinals must be unique. Two files sharing one number apply in an order
  // decided by the rest of the filename, which is not the order anyone reading
  // `0067` expects, and it silently diverges from any tracker keyed on the
  // ordinal alone. Two files both shipped as `0067` before this check existed;
  // the later-authored one was renumbered to 0074 when the guard caught it.
  const byOrdinal = new Map();
  for (const filename of files) {
    if (!/^\d{4}_.+\.sql$/.test(filename)) {
      errors.push(`${migrationsDir}/${filename} must use <sequence>_<name>.sql naming.`);
      continue;
    }
    const ordinal = filename.slice(0, 4);
    if (!byOrdinal.has(ordinal)) byOrdinal.set(ordinal, []);
    byOrdinal.get(ordinal).push(filename);
  }
  for (const [ordinal, group] of byOrdinal) {
    if (group.length > 1) {
      errors.push(
        `${migrationsDir} has ${group.length} migrations sharing ordinal ${ordinal}: ` +
          `${group.join(', ')}. Renumber all but one — apply order must be unambiguous.`,
      );
    }
  }

  const migrationHistory = files
    .map((filename) => fs.readFileSync(absolute(path.join(migrationsDir, filename)), 'utf8'))
    .join('\n')
    .toLowerCase();
  const requiredProjectColumns = [
    'organization_id',
    'default_privacy_mode',
    'default_provider_mode',
    'allowed_surfaces',
    'default_model_id',
    'last_used_at',
    'icon_emoji',
    'accent_color',
    'imported_from',
  ];
  for (const column of requiredProjectColumns) {
    if (!migrationHistory.includes(`add column if not exists ${column}`)) {
      errors.push(
        `${migrationsDir} has production code for user_projects.${column} but no canonical ADD COLUMN migration.`,
      );
    }
  }
}

for (const missing of missingRouteTableMigrations(root)) {
  const evidence = missing.locations
    .slice(0, 3)
    .map((location) => `${location.file}:${location.line}`)
    .join(', ');
  errors.push(
    `Route code references ${missing.table}, but canonical migrations create no table/view with that name (${evidence}).`,
  );
}

const retiredDbDir = 'supa' + 'base';
for (const removedDir of [retiredDbDir, `apps/web/${retiredDbDir}`]) {
  if (fs.existsSync(absolute(removedDir))) {
    errors.push(`${removedDir} must not exist. Neon migrations live in ${migrationsDir}.`);
  }
}

if (errors.length > 0) {
  console.error('Neon migration check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Neon migration check passed.');
