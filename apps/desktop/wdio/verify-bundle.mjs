#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '../dist');
const WDIO_MARKER = '[WDIO Tauri Plugin] Initializing...';

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return extname(entry.name) === '.js' ? [path] : [];
  });
}

const bridgeBundle = javascriptFiles(DIST).find((path) =>
  readFileSync(path, 'utf8').includes(WDIO_MARKER),
);

if (!bridgeBundle) {
  throw new Error(
    `${DIST}: bundled WDIO build omitted @wdio/tauri-plugin. ` +
      'Build the harness with VITE_WDIO_E2E=1.',
  );
}

process.stdout.write(`Verified bundled WDIO frontend bridge: ${bridgeBundle}\n`);
