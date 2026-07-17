import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);

describe('Chrome side-panel interaction accessibility', () => {
  it('uses keyboard-native controls for model, attachment, and prompt actions', () => {
    expect(source).toContain("const opt = el('button', {");
    expect(source).toContain("const screenshotItem = el('button', {");
    expect(source).toContain("const fileItem = el('button', {");
    expect(source).toContain("const chip = el('button', { class: 'sp-cmd-chip', type: 'button' }, cmd)");
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

  it('requires explicit confirmation before enabling act-without-asking mode', () => {
    expect(source).toContain('Enable “Act without asking”?');
    expect(source).toContain('window.confirm');
  });
});
