import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findDrift } from './check-agent-context-indexes.mjs';
import { serialize } from './generate-agent-context-indexes.mjs';

const roots = [];

const INDEXES = { 'repo-map.json': { units: [1] } };
const GRAPH = {
  'knowledge-graph/manifest.json': '{"shards":["knowledge-graph/files/root.jsonl"]}\n',
  'knowledge-graph/files/root.jsonl': '{"path":"a"}\n',
};

function write(root, relative, content) {
  const absolute = path.join(root, relative);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

function committed(overrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'agent-context-indexes-'));
  roots.push(root);
  write(root, 'repo-map.json', serialize(INDEXES['repo-map.json']));
  for (const [relative, content] of Object.entries(GRAPH)) write(root, relative, content);
  for (const [relative, content] of Object.entries(overrides)) write(root, relative, content);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a tree that matches a fresh render has no drift', () => {
  assert.deepEqual(findDrift({ root: committed(), indexes: INDEXES, graphFiles: GRAPH }), []);
});

test('a knowledge graph shard edited by hand is drift', () => {
  const root = committed({ 'knowledge-graph/files/root.jsonl': '{"path":"b"}\n' });
  assert.deepEqual(findDrift({ root, indexes: INDEXES, graphFiles: GRAPH }), [
    'changed knowledge-graph/files/root.jsonl',
  ]);
});

test('a knowledge graph file missing from the tree is drift', () => {
  const root = committed();
  const fresh = { ...GRAPH, 'knowledge-graph/files/apps.jsonl': '{"path":"c"}\n' };
  assert.deepEqual(findDrift({ root, indexes: INDEXES, graphFiles: fresh }), [
    'missing knowledge-graph/files/apps.jsonl',
  ]);
});

test('a knowledge graph file the render no longer produces is drift', () => {
  const root = committed({ 'knowledge-graph/files/gone.jsonl': '{"path":"d"}\n' });
  assert.deepEqual(findDrift({ root, indexes: INDEXES, graphFiles: GRAPH }), [
    'stale knowledge-graph/files/gone.jsonl (no longer generated)',
  ]);
});

test('a top-level index that changed or is stale is still drift', () => {
  const root = committed({ 'old.json': '{}\n', 'repo-map.json': '{}\n' });
  assert.deepEqual(findDrift({ root, indexes: INDEXES, graphFiles: GRAPH }), [
    'stale old.json (no longer generated)',
    'changed repo-map.json',
  ]);
});
