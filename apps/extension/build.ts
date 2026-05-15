#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Extension build orchestrator.
 *
 * Builds each Chrome extension entry point as a self-contained IIFE bundle
 * by invoking Vite once per entry with the EXTENSION_ENTRY env var set.
 *
 * This prevents Rollup from extracting shared dependencies into separate
 * chunks, which would break Chrome MV3 content scripts (they cannot use
 * ES module imports).
 */

import { build } from 'vite';
import { extensionEntries } from './vite.config.js';

async function main() {
  const mode = process.env['NODE_ENV'] === 'development' ? 'development' : 'production';

  for (const entry of extensionEntries) {
    console.log(`\n  Building ${entry.name} → ${entry.output}`);
    process.env['EXTENSION_ENTRY'] = entry.name;

    await build({
      mode,
      configFile: new URL('./vite.config.ts', import.meta.url).pathname,
    });
  }

  delete process.env['EXTENSION_ENTRY'];
  console.log('\n  All entries built successfully.\n');
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
