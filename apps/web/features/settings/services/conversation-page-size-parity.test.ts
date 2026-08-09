/**
 * HARD-012 — cross-surface pagination parity for `/api/chat/conversations`.
 *
 * Web, Desktop and Mobile all list conversations from the same route, and that
 * route derives its own default and ceiling from the wire contract
 * (`apps/web/app/api/chat/conversations/route.ts`). Each surface used to write
 * its own `50` next to the request, so a contract change moved the server while
 * three clients silently kept asking for the old number.
 *
 * Values alone cannot catch that — three stale copies of `50` still equal `50`.
 * This asserts the *derivation*: every conversations page size must be spelled
 * as the contract constant, and no client may re-declare the literal.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE,
  MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE,
} from '@agiworkforce/cloud-contracts';

// This file lives at apps/web/features/settings/services/, so the repo root is
// five levels up. Resolving from the repo root keeps the Desktop and Mobile
// paths readable and makes a moved file fail loudly instead of silently
// skipping the surface.
const REPO_ROOT = path.resolve(__dirname, '../../../../..');

const CONVERSATION_PAGE_SIZE_SITES = [
  'apps/web/lib/hooks/useConversations.ts',
  'apps/web/features/settings/services/conversation-data-service.ts',
  'apps/desktop/src/api/cloudAccountSettings.ts',
  'apps/mobile/src/features/archived-chats/service.ts',
] as const;

function readSurface(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('conversations page size parity', () => {
  it.each(CONVERSATION_PAGE_SIZE_SITES)(
    '%s takes its page size from the wire contract',
    (relativePath) => {
      expect(readSurface(relativePath)).toContain('MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE');
    },
  );

  it.each(CONVERSATION_PAGE_SIZE_SITES)(
    '%s does not re-declare a conversations page size literal',
    (relativePath) => {
      const source = readSurface(relativePath);
      // Both the `const X = 50` and the inline `limit=50` / `limit: 50` forms
      // that previously appeared at these call sites.
      const literalPageSize =
        /(?:PAGE_SIZE\s*(?::\s*number)?\s*=\s*\d+)|(?:limit[=:]\s*\d+)|(?:limit=\$\{?\d)/;
      expect(source).not.toMatch(literalPageSize);
    },
  );

  it('asks for the contract ceiling, never a larger number the route would clamp', () => {
    const source = readSurface('apps/web/lib/hooks/useConversations.ts');
    expect(source).toContain('MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE');
    expect(MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(
      MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE,
    );
  });

  it('keeps the route default anchored to the same contract constant', () => {
    const route = readSurface('apps/web/app/api/chat/conversations/route.ts');
    expect(route).toContain('MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE');
    expect(route).toContain('MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE');
  });
});
