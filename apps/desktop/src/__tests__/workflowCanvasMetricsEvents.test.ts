import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SURFACES = [
  '../hooks/useWorkflows.ts',
  '../features/roi-dashboard/roiStore.ts',
  '../features/dynamic-canvas/DynamicCanvas.tsx',
];

const TAURI_SRC = resolve(__dirname, '../../src-tauri/src');

function collectRustSources(dir: string): string[] {
  const sources: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      sources.push(...collectRustSources(full));
    } else if (entry.endsWith('.rs')) {
      sources.push(readFileSync(full, 'utf8'));
    }
  }
  return sources;
}

const rustSources = collectRustSources(TAURI_SRC);

function listenedEventNames(relativePath: string): string[] {
  const source = readFileSync(resolve(__dirname, relativePath), 'utf8');
  const names = new Set<string>();
  for (const match of source.matchAll(/\blisten\s*(?:<[^>]*>)?\s*\(\s*'([^']+)'/g)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names];
}

function hasEmitter(eventName: string): boolean {
  const pattern = new RegExp(
    `\\bemit\\w*\\s*\\(\\s*(?:[^;()]{0,60}?,\\s*)?"${eventName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
  );
  return rustSources.some((source) => pattern.test(source));
}

const liveSurfaces = SURFACES.filter((relativePath) =>
  existsSync(resolve(__dirname, relativePath)),
);

describe('workflow / ROI / canvas event contract', () => {
  it('still guards at least one surface', () => {
    expect(liveSurfaces).toContain('../hooks/useWorkflows.ts');
  });

  it.each(liveSurfaces)('%s listens only for events Rust emits', (relativePath) => {
    const listened = listenedEventNames(relativePath);
    expect(listened.length).toBeGreaterThan(0);

    const orphaned = listened.filter((name) => !hasEmitter(name));
    expect(orphaned).toEqual([]);
  });
});
