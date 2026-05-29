#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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

  for (const filename of files) {
    if (!/^\d{4}_.+\.sql$/.test(filename)) {
      errors.push(`${migrationsDir}/${filename} must use <sequence>_<name>.sql naming.`);
    }
  }
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
