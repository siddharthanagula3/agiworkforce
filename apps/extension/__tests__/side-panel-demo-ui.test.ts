import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);

describe('Chrome side-panel demo surface', () => {
  it('exposes conversation history directly from the header', () => {
    expect(source).toContain("id: 'sp-history-btn'");
    expect(source).toContain("'aria-label': 'Recent chats'");
    expect(source).toContain('openDrawer(historyBtn)');
  });

  it('labels the navigation drawer as an AGI menu instead of settings', () => {
    expect(source).toContain("'aria-label': 'AGI menu'");
    expect(source).toContain("el('div', { id: 'sp-drawer-title' }, 'AGI in Chrome')");
    expect(source).toContain("'aria-label': 'Open AGI menu'");
  });

  it('does not expose unfinished console or desktop actions in the public drawer', () => {
    expect(source).not.toContain('chatActionsRow.appendChild(drawerConsoleBtn)');
    expect(source).not.toContain('chatActionsRow.appendChild(drawerOpenDesktopBtn)');
  });

  it('uses an honest signed-out model picker label', () => {
    expect(source).toMatch(/providerCount === 0\s*\?\s*'Sign in for models'/);
  });
});
