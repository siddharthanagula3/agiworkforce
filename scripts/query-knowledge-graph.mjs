#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { queryKnowledgeGraph } from './knowledge-graph.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...rest] = process.argv.slice(2);
const text = queryKnowledgeGraph(repoRoot, command || 'stats', rest.join(' '));
console.log(text);
if (/^(Unknown command|No |Usage:|Knowledge graph is not generated)/.test(text)) {
  process.exitCode = 1;
}
