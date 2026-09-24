import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const globalsCss = readFileSync(resolve(repoRoot, 'apps/web/app/globals.css'), 'utf8');
const chatCss = readFileSync(resolve(repoRoot, 'packages/ui/design-tokens/src/chat.css'), 'utf8');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.(?:css|ts|tsx)$/.test(entry.name)) return [];
    if (/\.(?:test|spec)\./.test(entry.name)) return [];
    return [path];
  });
}

describe('focus ring ownership', () => {
  it('routes every web ring alias through the foundation focus role', () => {
    expect(globalsCss).toContain('--color-ring: var(--focus-ring);');
    expect(globalsCss).not.toMatch(/^\s*--ring:/m);
    expect(globalsCss).not.toMatch(/^\s*--chat-accent-secondary:/m);
    expect(globalsCss.match(/^\s*--chat-focus-ring:\s*var\(--focus-ring\);/gm)).toHaveLength(2);
    expect(chatCss.match(/^\s*--chat-focus-ring:\s*var\(--focus-ring\);/gm)).toHaveLength(3);
  });

  it('keeps component focus states off accent and legacy ring roles', () => {
    const files = [
      ...sourceFiles(resolve(repoRoot, 'apps/web')),
      ...sourceFiles(resolve(repoRoot, 'packages/ui/ui/src')),
      ...sourceFiles(resolve(repoRoot, 'packages/ui/unified-chat/src')),
    ];
    const forbidden = [
      'focus-visible:ring-primary',
      'focus:ring-primary',
      'focus-within:ring-primary',
      'focus-visible:ring-[var(--chat-accent-primary)]',
      'focus:ring-[var(--chat-accent-primary)]',
      'focus-within:ring-[var(--chat-accent-primary)]',
      'focus-visible:ring-[var(--chat-accent-secondary)]',
      'focus:ring-[var(--chat-accent-secondary)]',
      'focus-within:ring-[var(--chat-accent-secondary)]',
      'ring-[hsl(var(--ring))]',
    ];

    const violations = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return forbidden
        .filter((fragment) => source.includes(fragment))
        .map((fragment) => ({
          file: file.slice(repoRoot.length + 1),
          fragment,
        }));
    });

    expect(violations).toEqual([]);
  });
});
