/**
 * Guards the package's internal import graph against require cycles.
 *
 * A runtime cycle here is not cosmetic: Metro logs it on every Mobile boot and,
 * depending on which module a bundler evaluates first, one side sees the other's
 * exports as `undefined` — a Zod schema that is `undefined` at parse time turns
 * a contract violation into a crash. Type-only edges are excluded because they
 * are erased before any bundler sees them.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

/**
 * Relative specifiers that survive type erasure. `import type ...` /
 * `export type ...` statements and inline `type` specifiers are excluded; a
 * statement that names at least one value still counts as a runtime edge.
 */
function readRuntimeRelativeImports(source: string): string[] {
  // The clause may wrap across lines but never contains `;` or `=`, which stops
  // the lazy match from running past a statement that has no `from` at all.
  const statement =
    /(?:^|\n)\s*(?:import|export)(?<clause>[^;=]*?)from\s*['"](?<specifier>\.[^'"]*)['"]/g;
  const specifiers: string[] = [];
  for (const match of source.matchAll(statement)) {
    const clause = match.groups?.['clause'] ?? '';
    const specifier = match.groups?.['specifier'];
    if (!specifier) continue;
    if (/^\s+type\s/.test(clause)) continue;
    const named = /\{([^}]*)\}/.exec(clause);
    if (named?.[1] !== undefined) {
      const values = named[1]
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && !/^type\s/.test(entry));
      if (values.length === 0) continue;
    }
    specifiers.push(specifier);
  }
  return specifiers;
}

function moduleId(absolutePath: string): string {
  return absolutePath.slice(SOURCE_ROOT.length + 1).replace(/\.ts$/, '');
}

function buildGraph(): Map<string, string[]> {
  const files = listSourceFiles(SOURCE_ROOT);
  const known = new Set(files.map(moduleId));
  const graph = new Map<string, string[]>();
  for (const file of files) {
    const id = moduleId(file);
    const edges = readRuntimeRelativeImports(readFileSync(file, 'utf8'))
      .map((specifier) => moduleId(resolve(join(file, '..'), specifier)))
      .filter((target) => known.has(target));
    graph.set(id, edges);
  }
  return graph;
}

/** Every cycle reachable from any module, reported as readable paths. */
function findCycles(graph: Map<string, string[]>): string[] {
  const cycles = new Set<string>();
  const onStack = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function walk(id: string): void {
    if (onStack.has(id)) {
      const start = stack.indexOf(id);
      cycles.add([...stack.slice(start), id].join(' -> '));
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    onStack.add(id);
    stack.push(id);
    for (const next of graph.get(id) ?? []) walk(next);
    stack.pop();
    onStack.delete(id);
  }

  for (const id of graph.keys()) walk(id);
  return [...cycles];
}

describe('cloud-contracts module graph', () => {
  it('sees the modules it is meant to guard', () => {
    const graph = buildGraph();
    expect(graph.get('managed-cloud-agent-runs-client')).toContain('tool-approval-resume');
    expect(graph.get('tool-approval-resume')).toContain('managed-cloud-agent-run-reference');
    expect(graph.size).toBeGreaterThan(20);
  });

  it('has no runtime require cycle', () => {
    expect(findCycles(buildGraph())).toEqual([]);
  });
});
