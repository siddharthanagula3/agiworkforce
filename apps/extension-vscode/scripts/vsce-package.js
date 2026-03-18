#!/usr/bin/env node
/**
 * vsce-package.js — Wrapper that patches minimatch for vsce compatibility.
 *
 * Newer minimatch (v9+/v10+) removed the default export that vsce's compiled
 * CJS code expects. This wrapper monkey-patches require() to add it back.
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

// Forward CLI args to vsce
const vsceMain = require.resolve('@vscode/vsce/out/main');
process.argv = [process.argv[0], vsceMain, ...process.argv.slice(2)];
require(vsceMain);
