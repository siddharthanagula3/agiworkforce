import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { KEYBOARD_SHORTCUT_DOCS } from '../hooks/use-keyboard-shortcuts';

const CHAT_DIR = path.resolve(__dirname, '..');
const read = (relative: string) => readFileSync(path.join(CHAT_DIR, relative), 'utf8');

// The keyboard-shortcuts item lives in the shared AccountMenuItems component
// (apps/web/shared/components/layout/AccountMenuItems.tsx), not on this page
// directly — WebChatPage's and WebAppShell's account menus both render it
// from there so the two cannot drift into different menus.
const ACCOUNT_MENU_ITEMS = readFileSync(
  path.resolve(CHAT_DIR, '../../shared/components/layout/AccountMenuItems.tsx'),
  'utf8',
);
const SHORTCUTS_HOOK = read('hooks/use-keyboard-shortcuts.ts');

function accountMenuShortcutHint(): string {
  const item = ACCOUNT_MENU_ITEMS.slice(
    ACCOUNT_MENU_ITEMS.indexOf("t('common:navKeyboardShortcuts')"),
  );
  const hint = /<span[^>]*>\{?([^<}]+)\}?<\/span>/.exec(item.slice(0, 400));
  expect(hint, 'account menu shortcut hint not found').not.toBeNull();
  return hint![1]!.trim();
}

describe('account menu keyboard shortcut hint', () => {
  it('advertises the binding the shortcut hook actually listens for', () => {
    // The matcher is now driven by KEYBOARD_SHORTCUT_DOCS rather than a
    // parallel hardcoded list, so the registry entry IS the binding. Asserting
    // against it is stricter than the old string match on the matcher body:
    // that string could be edited without the shown shortcut changing, and the
    // registry cannot.
    const doc = KEYBOARD_SHORTCUT_DOCS.find((entry) => entry.id === 'show-shortcuts');
    expect(doc?.key).toBe('/');
    expect(doc?.meta || doc?.ctrl).toBe(true);
    expect(SHORTCUTS_HOOK).not.toMatch(/key === '\?'/);
    expect(accountMenuShortcutHint()).toBe("shortcutLabel('/')");
  });
});
