#!/usr/bin/env node
/**
 * vsce-package.js — Wrapper that patches minimatch for vsce compatibility.
 *
 * Newer minimatch (v9+/v10+) removed the default export that vsce's compiled
 * CJS code expects. This wrapper monkey-patches require() to add it back,
 * then invokes vsce's programmatic API.
 *
 * Usage: node scripts/vsce-package.js [package|ls] [--no-dependencies] [--out <path>]
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

const PACKAGED_RUNTIME_OUTPUT_ALLOWLIST = Object.freeze([
  'out/extension.js',
  'out/webview/render.js',
  'out/codicons/codicon.css',
  'out/codicons/codicon.ttf',
]);

function validatePackagedRuntimeOutput(files, { requireAll = true } = {}) {
  const allowed = new Set(PACKAGED_RUNTIME_OUTPUT_ALLOWLIST);
  const runtimeFiles = files
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => file.startsWith('out/'));
  const unexpected = runtimeFiles.filter((file) => !allowed.has(file));
  const missing = requireAll
    ? PACKAGED_RUNTIME_OUTPUT_ALLOWLIST.filter((file) => !runtimeFiles.includes(file))
    : [];

  if (unexpected.length > 0 || missing.length > 0) {
    const details = [];
    if (unexpected.length > 0) {
      details.push(`unexpected:\n${unexpected.join('\n')}`);
    }
    if (missing.length > 0) {
      details.push(`missing:\n${missing.join('\n')}`);
    }
    throw new Error(
      `VSIX runtime output does not match the release allowlist:\n${details.join('\n')}`,
    );
  }
}

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

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a path`);
  }
  return value;
}

async function main() {
  const { createVSIX, listFiles, PackageManager } = loadVsceWithCompat();
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const command = args[0] || 'package';
  const noDeps = args.includes('--no-dependencies');
  const packagePath = readOption(args, '--out');
  const files = await listFiles({
    cwd: process.cwd(),
    packageManager: noDeps ? PackageManager.None : PackageManager.Npm,
  });
  if (command === 'ls') {
    rejectDevelopmentArtifacts(files);
    validatePackagedRuntimeOutput(files, { requireAll: false });
    files.forEach((f) => console.log(f));
  } else if (command === 'package') {
    rejectDevelopmentArtifacts(files);
    validatePackagedRuntimeOutput(files);
    await createVSIX({
      cwd: process.cwd(),
      useYarn: false,
      dependencies: !noDeps,
      ...(packagePath ? { packagePath } : {}),
    });
  } else {
    throw new Error(`unsupported command: ${command}`);
  }
}

module.exports = {
  PACKAGED_RUNTIME_OUTPUT_ALLOWLIST,
  validatePackagedRuntimeOutput,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('ERROR:', err.message || err);
    process.exit(1);
  });
}
