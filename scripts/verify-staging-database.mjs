#!/usr/bin/env node

import console from 'node:console';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL, URL } from 'node:url';
import { parseEnv } from 'node:util';

export function verifyStagingDatabase(content, expected, environment) {
  if (
    typeof expected !== 'string' ||
    !expected ||
    expected.trim() !== expected ||
    /[\r\n\0]/u.test(expected)
  ) {
    throw new Error('The protected staging database URL is required and must be a single line');
  }
  let database;
  try {
    database = new URL(expected);
  } catch {
    throw new Error('The protected staging database URL must be a PostgreSQL URL');
  }
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !database.hostname ||
    database.pathname.length < 2
  ) {
    throw new Error('The protected staging database URL must identify a PostgreSQL database');
  }
  const aliases = ['AGI_DATABASE_URL', 'DATABASE_URL'];
  for (const name of aliases) {
    if (environment?.[name] !== expected) {
      throw new Error(`${name} must equal the protected staging database`);
    }
  }
  const preview = parseEnv(content);
  const configured = aliases.filter((name) => Object.hasOwn(preview, name));
  if (configured.length === 0) {
    throw new Error('The pulled preview settings must configure a database URL');
  }
  for (const name of configured) {
    if (preview[name] !== expected && preview[name] !== '' && preview[name] !== '[SENSITIVE]') {
      throw new Error(
        `${name} in the pulled preview settings differs from the protected staging database`,
      );
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    verifyStagingDatabase(
      readFileSync('.vercel/.env.preview.local', 'utf8'),
      process.env.AGI_STAGING_DATABASE_URL,
      process.env,
    );
    console.log('Protected staging database binding verified');
  } catch {
    console.error(
      'Staging database binding failed; verify the protected secret and pulled preview aliases',
    );
    process.exitCode = 1;
  }
}
