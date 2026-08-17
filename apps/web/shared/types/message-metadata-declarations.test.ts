import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

const WEB_ROOT = path.resolve(__dirname, '../..');
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  'coverage',
  'playwright-report',
  'test-results',
]);
const DECLARATION = /^export\s+(?:interface|type)\s+MessageMetadata\b/m;

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      found.push(...sourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) found.push(full);
  }
  return found;
}

describe('MessageMetadata declarations', () => {
  const declaringFiles = sourceFiles(WEB_ROOT)
    .filter((file) => DECLARATION.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(WEB_ROOT, file).split(path.sep).join('/'))
    .sort();

  it('exists exactly once, in the live chat write path', () => {
    expect(declaringFiles).toEqual(['shared/stores/web-chat-store.ts']);
  });

  it('is the shape re-exported by the chat feature barrel', async () => {
    const featureBarrel = readFileSync(path.join(WEB_ROOT, 'features/chat/types/index.ts'), 'utf8');
    expect(featureBarrel).toMatch(
      /export type \{ MessageMetadata \} from '@shared\/stores\/web-chat-store';/,
    );
  });
});
