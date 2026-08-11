import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * WebChatPage is ~3,300 lines of client component and is stubbed everywhere it
 * is rendered under test (see chat-route.test.tsx), so its copy is pinned at
 * the source level instead: the header's share control kept raw English long
 * after the rest of the file was wired to i18next, which is exactly the kind of
 * regression a render test would never have caught here.
 */
const SOURCE = readFileSync(resolve(process.cwd(), 'features/chat/pages/WebChatPage.tsx'), 'utf8');

const BUNDLES: Record<string, unknown> = {
  chat: JSON.parse(
    readFileSync(resolve(process.cwd(), '../../packages/ui/i18n/locales/en/chat.json'), 'utf8'),
  ) as unknown,
  common: JSON.parse(
    readFileSync(resolve(process.cwd(), '../../packages/ui/i18n/locales/en/common.json'), 'utf8'),
  ) as unknown,
};

function lookup(namespace: string, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, segment) => (node as Record<string, unknown> | undefined)?.[segment],
      BUNDLES[namespace],
    );
}

describe('WebChatPage header copy', () => {
  it('translates the share control instead of baking English into the header', () => {
    expect(SOURCE).toContain("aria-label={t('chat:shareConversation')}");
    expect(SOURCE).toContain("{t('common:share')}");
    expect(SOURCE).not.toContain('aria-label="Share conversation"');
    expect(SOURCE).not.toContain('<span className="hidden text-xs sm:inline">Share</span>');
  });

  it('translates the narrow-viewport navigation control', () => {
    expect(SOURCE).toContain("aria-label={t('chat:openNavigation')}");
    expect(SOURCE).not.toContain('aria-label="Open navigation"');
  });

  it('keeps the closed mobile drawer inert and exposes the open drawer as a modal', () => {
    expect(SOURCE).toContain("role={isNarrowViewport && mobileNavOpen ? 'dialog' : undefined}");
    expect(SOURCE).toContain('inert={isNarrowViewport && !mobileNavOpen ? true : undefined}');
    expect(SOURCE).toContain('aria-expanded={mobileNavOpen}');
    expect(SOURCE).toContain('aria-controls="chat-mobile-navigation"');
  });

  it('asks only for chat and common keys the English corpus actually defines', () => {
    const referenced = [...SOURCE.matchAll(/t\('(chat|common):([^']+)'/g)];
    expect(referenced.length).toBeGreaterThan(0);

    for (const [, namespace, key] of referenced) {
      expect(typeof lookup(namespace!, key!), `${namespace}.json is missing '${key}'`).toBe(
        'string',
      );
    }
  });
});
