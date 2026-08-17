import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CHAT_DIR = path.resolve(__dirname, '..');
const read = (relative: string) => readFileSync(path.join(CHAT_DIR, relative), 'utf8');

const WEB_CHAT_PAGE = read('pages/WebChatPage.tsx');
const SHORTCUTS_HOOK = read('hooks/use-keyboard-shortcuts.ts');

function accountMenuShortcutHint(): string {
  const item = WEB_CHAT_PAGE.slice(WEB_CHAT_PAGE.indexOf("t('common:navKeyboardShortcuts')"));
  const hint = /<span[^>]*>\{?([^<}]+)\}?<\/span>/.exec(item.slice(0, 400));
  expect(hint, 'account menu shortcut hint not found').not.toBeNull();
  return hint![1]!.trim();
}

describe('account menu keyboard shortcut hint', () => {
  it('advertises the binding the shortcut hook actually listens for', () => {
    expect(SHORTCUTS_HOOK).toContain("modifierKey && key === '/'");
    expect(SHORTCUTS_HOOK).not.toMatch(/key === '\?'/);
    expect(accountMenuShortcutHint()).toBe("shortcutLabel('/')");
  });
});
