import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);

describe('Chrome side-panel interaction accessibility', () => {
  it('uses keyboard-native controls for model, attachment, and slash-command actions', () => {
    expect(source).toContain("const opt = el('button', {");
    expect(source).toContain("const screenshotItem = el('button', {");
    expect(source).toContain("const fileItem = el('button', {");
    expect(source).toContain("const item = el('button', {");
    expect(source).toContain("class: `sp-slash-item${i === slashActive ? ' active' : ''}`");
  });

  it('names the composer controls and announces streamed chat updates', () => {
    expect(source).toMatch(
      /id: 'sp-messages',[\s\S]{0,80}role: 'log',[\s\S]{0,80}'aria-live': 'polite'/,
    );
    expect(source).toContain("'aria-label': 'Message AGI'");
    expect(source).toContain("'aria-label': 'Send message'");
    expect(source).toContain("'aria-label': 'Add attachment'");
    expect(source).toContain("'aria-label': 'Voice input'");
  });

  it('does not expose an autonomy selector whose value is not connected to execution', () => {
    expect(source).not.toContain("id: 'sp-action-mode-toggle'");
    expect(source).not.toContain('Act without asking');
  });

  it('keeps the create-shortcut modal contained and restores keyboard focus', () => {
    expect(source).toContain("'aria-labelledby': 'sp-create-shortcut-title'");
    expect(source).toContain("'aria-modal': 'true'");
    expect(source).toContain("createShortcutModal.addEventListener('keydown'");
    expect(source).toContain("if (event.key === 'Escape')");
    expect(source).toContain("if (event.key !== 'Tab') return");
    expect(source).toContain('createShortcutReturnFocus.focus()');
  });

  it('keeps the create-shortcut dialog open when background persistence is rejected', () => {
    expect(source).toContain('if (runtimeError || !response?.success)');
    expect(source).toContain(
      "response?.error ?? runtimeError?.message ?? t('spShortcutSaveFailed')",
    );
  });
});
