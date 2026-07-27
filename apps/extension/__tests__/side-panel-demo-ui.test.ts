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

  it('lets users explicitly refresh the Sync Host session after web sign-in', () => {
    expect(source).toContain("'Check sign-in'");
    expect(source).toContain('refreshCloudAccountUI(true)');
    expect(source).not.toContain('Your account refreshes automatically.');
  });

  it('routes visible managed-tool decisions through the durable approval message', () => {
    expect(source).toContain("type: 'RESOLVE_CHAT_APPROVAL'");
    expect(source).toContain('cloudRun: run');
    expect(source).toContain('toolApprovals');
    expect(source).not.toContain("id: 'sp-action-mode-toggle'");
  });

  it('uses the canonical Pro developer-surface gate before enabling the composer', () => {
    expect(source).toContain(
      "canUseBillingPlanCapability(access.subscriptionTier, 'developer_surfaces')",
    );
    expect(source).toContain('AGI in Chrome requires Pro or higher.');
  });

  it('shows canonical account usage and truthful Web handoffs for cloud connectors and teams', () => {
    expect(source).toContain('access.usagePercentage');
    expect(source).toContain('Manage usage');
    expect(source).toContain('Connect apps');
    expect(source).toContain('Cloud connectors open on Web');
    expect(source).toContain('Team & Enterprise');
    expect(source).toContain('https://agiworkforce.com/connectors?from=chrome-extension');
    expect(source).toContain('https://agiworkforce.com/teams?from=chrome-extension');
  });

  it('routes inactive retained subscriptions to billing instead of enabling paid Chrome access', () => {
    expect(source).toContain('!isEntitledSubscriptionStatus(access.subscriptionStatus)');
    expect(source).toContain('Manage billing');
    expect(source).toContain('https://agiworkforce.com/settings/billing?from=chrome-extension');
  });
});

/**
 * Four separate strings promised "/ for commands" — the placeholder in two
 * places, the empty-state copy, and the composer placeholder — while nothing in
 * the panel listened for the key. The commands existed and expanded correctly on
 * submit, so they worked only for someone who already knew their names.
 */
describe('Chrome side-panel slash commands', () => {
  it('drives the menu and the expander from one command list', () => {
    expect(source).toContain('const SLASH_COMMANDS: Record<string, SlashCommandMeta>');
    // expandSlashCommand must read the shared list, not a private copy.
    expect(source).toContain('const exact = SLASH_COMMANDS[trimmed]');
    expect(source).toContain('for (const [cmd, meta] of Object.entries(SLASH_COMMANDS))');
  });

  it('renders an autocomplete menu that reacts to typing', () => {
    expect(source).toContain("id: 'sp-slash-menu'");
    expect(source).toContain("inputEl.addEventListener('input', refreshSlashMenu)");
    expect(source).toContain('composerShell.appendChild(slashMenu)');
  });

  it('supports keyboard selection and does not send the raw fragment', () => {
    expect(source).toContain("e.key === 'ArrowDown'");
    expect(source).toContain("e.key === 'ArrowUp'");
    expect(source).toContain("e.key === 'Escape'");
    // Without this the send handler also fires and dispatches "/su" as a message.
    expect(source).toContain('e.stopImmediatePropagation()');
  });

  it('exposes the menu to assistive technology', () => {
    expect(source).toContain("role: 'listbox'");
    expect(source).toContain("role: 'option'");
    expect(source).toContain("inputEl.setAttribute('aria-activedescendant'");
  });
});
