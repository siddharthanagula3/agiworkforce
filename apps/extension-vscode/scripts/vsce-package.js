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

function loadVsceWithCompat() {
  const Module = require('module');
  const origLoad = Module._load;

  Module._load = function (request, parent, isMain) {
    const result = origLoad.call(this, request, parent, isMain);
    if (request === 'minimatch' && result && !result.default) {
      result.default = result.minimatch || result;
    }
    return result;
  };

  try {
    return require('@vscode/vsce');
  } finally {
    Module._load = origLoad;
  }
}

const { createVSIX, listFiles, PackageManager } = loadVsceWithCompat();

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const command = args[0] || 'package';
const noDeps = args.includes('--no-dependencies');

function rejectDevelopmentArtifacts(files) {
  const forbidden = files.filter((file) => {
    const normalized = file.replaceAll('\\', '/');
    return (
      normalized.endsWith('.map') ||
      normalized.endsWith('.log') ||
      normalized.startsWith('.turbo/') ||
      normalized.startsWith('scripts/') ||
      /^tsconfig(?:\..+)?\.json$/.test(normalized) ||
      /^vitest\..+\.config\.ts$/.test(normalized) ||
      ['AGENTS.md', 'MARKETPLACE_PUBLISH_RUNBOOK.md'].includes(normalized)
    );
  });

  if (forbidden.length > 0) {
    throw new Error(`VSIX contains development-only files:\n${forbidden.join('\n')}`);
  }
}

async function main() {
  const files = await listFiles({
    cwd: process.cwd(),
    packageManager: noDeps ? PackageManager.None : PackageManager.Npm,
  });
  if (command === 'ls') {
    files.forEach((f) => console.log(f));
  } else if (command === 'package') {
    rejectDevelopmentArtifacts(files);
    await createVSIX({ cwd: process.cwd(), useYarn: false, dependencies: !noDeps });
  } else {
    throw new Error(`unsupported command: ${command}`);
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message || err);
  process.exit(1);
});
