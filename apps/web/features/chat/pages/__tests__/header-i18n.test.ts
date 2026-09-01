import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  /**
   * The drawer is the shared Sheet (Radix dialog), not a hand-rolled overlay —
   * the same primitive WebAppShell uses. Radix owns role/aria-modal, the focus
   * trap, Escape and the scroll lock, so what this page still has to get right
   * is the trigger's relationship to the panel and the focus hand-back that
   * Radix cannot do on its own (the trigger lives outside the sheet).
   */
  it('renders the mobile drawer through the shared Sheet rather than a hand-rolled overlay', () => {
    expect(SOURCE).toContain('<Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>');
    expect(SOURCE).toContain('id={MOBILE_NAV_DRAWER_ID}');
    expect(SOURCE).toContain('mobileNavTriggerRef.current?.focus()');
    expect(SOURCE).toContain('aria-expanded={mobileNavOpen}');
    expect(SOURCE).toContain('aria-controls={MOBILE_NAV_DRAWER_ID}');
    expect(SOURCE).not.toContain('chat-mobile-drawer');
    expect(SOURCE).not.toContain("document.addEventListener('keydown', handleKeyDown)");
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
