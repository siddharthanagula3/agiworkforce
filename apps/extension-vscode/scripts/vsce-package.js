#!/usr/bin/env node
/**
 * vsce-package.js — Wrapper that patches minimatch for vsce compatibility.
 *
 * Newer minimatch (v9+/v10+) removed the default export that vsce's compiled
 * CJS code expects. This wrapper monkey-patches require() to add it back,
 * then invokes vsce's programmatic API.
 *
 * Usage: node scripts/vsce-package.js [package|ls] [--no-dependencies]
 */

const Module = require('module');
const origLoad = Module._load;

Module._load = function (request, parent, isMain) {
  const result = origLoad.call(this, request, parent, isMain);
  if (request === 'minimatch' && result && !result.default) {
    result.default = result.minimatch || result;
  }
  return result;
};

const { createVSIX, listFiles } = require('@vscode/vsce');

const args = process.argv.slice(2);
const command = args[0] || 'package';
const noDeps = args.includes('--no-dependencies');

async function main() {
  if (command === 'ls') {
    const files = await listFiles({ cwd: process.cwd(), useYarn: false, dependencies: !noDeps });
    files.forEach((f) => console.log(f));
  } else {
    await createVSIX({ cwd: process.cwd(), useYarn: false, dependencies: !noDeps });
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message || err);
  process.exit(1);
});
