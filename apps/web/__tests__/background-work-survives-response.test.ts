import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Work started after the response is sent must be handed to something that
 * holds the invocation open. Both sites below used to read `request.waitUntil`,
 * a member NextRequest does not declare and never carries, so the cast silently
 * resolved to `undefined` and every call took the detached-promise fallback —
 * which completes reliably under `next dev` (the process stays alive) and can
 * be frozen at response flush on the platform.
 */
const BACKGROUND_WORK_SITES = [
  'app/api/chat/conversations/[id]/messages/lib/generate-title.ts',
  'app/api/github/webhook/route.ts',
] as const;

function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('background work started after the response', () => {
  it.each(BACKGROUND_WORK_SITES)('%s keeps the invocation open', (relativePath) => {
    const source = sourceOf(relativePath);
    const importsAfter = /import\s*\{[^}]*\bafter\b[^}]*\}\s*from\s*'next\/server'/.test(source);
    const importsWaitUntil =
      /import\s*\{[^}]*\bwaitUntil\b[^}]*\}\s*from\s*'@vercel\/functions'/.test(source);
    expect(
      importsAfter || importsWaitUntil,
      `${relativePath} starts background work without importing next/server \`after\` or @vercel/functions \`waitUntil\``,
    ).toBe(true);
  });

  it.each(BACKGROUND_WORK_SITES)('%s never reads waitUntil off the request', (relativePath) => {
    expect(sourceOf(relativePath)).not.toMatch(/\.waitUntil\b/);
  });
});
