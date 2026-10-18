import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { APPROVAL_TIMEOUT_MS } from '../src/features/computer-use/agentLoop';
import { buildBrowserApprovalCard } from '../src/features/side-panel/computerUsePanel';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, '..', rel), 'utf8');

describe('computer-use default = ask-before-acting (trust-boundary P0)', () => {
  const background = read('src/background.ts');
  const panel = read('src/features/side-panel/computerUsePanel.ts');

  it('background treats an UNSET ask pref as ask-before-acting (default-deny)', () => {
    expect(background).toMatch(/agi_cu_ask_before_acting'\]\s*!==\s*false/);
  });

  it('background does NOT default to allow-all (the old `=== true` defect)', () => {
    expect(background).not.toMatch(/agi_cu_ask_before_acting'\]\s*===\s*true/);
  });

  it('side-panel ask checkbox defaults to ON (ask)', () => {
    expect(panel).toMatch(/askCheckbox\.checked\s*=\s*true/);
    expect(panel).not.toMatch(/askCheckbox\.checked\s*=\s*false/);
  });
});

describe('computer-use ask gate persists and rehydrates', () => {
  const panel = read('src/features/side-panel/computerUsePanel.ts');

  it('rehydrates the stored gate instead of always rendering the default', () => {
    expect(panel).toMatch(/storage\?\.local\?\.get\('agi_cu_ask_before_acting'/);
    expect(panel).toMatch(
      /askCheckbox\.checked\s*=\s*items\?\.\['agi_cu_ask_before_acting'\]\s*!==\s*false/,
    );
  });

  it('writes the gate on toggle, not only when Run Autofill escalates', () => {
    expect(panel).toMatch(/askCheckbox\.addEventListener\('change'/);
    expect(panel).toMatch(/set\(\{\s*agi_cu_ask_before_acting:\s*next\s*\}\)/);
  });

  it('rolls the control back when the authoritative storage write fails', () => {
    expect(panel).toContain('askCheckbox.checked = !next');
    expect(panel).toContain('The previous setting is still active.');
  });

  it('rehydration still uses the default-deny rule, never a bare false assignment', () => {
    expect(panel).not.toMatch(/askCheckbox\.checked\s*=\s*false/);
  });
});

describe('computer-use approval accessibility', () => {
  const panel = read('src/features/side-panel/computerUsePanel.ts');

  function approvalCard(onSettled = vi.fn(), resolve = vi.fn()) {
    const card = buildBrowserApprovalCard({
      toolName: 'click',
      description: 'Click element [4] on this page.',
      canAllowForTask: true,
      isCurrent: () => true,
      onSettled,
      resolve,
    });
    document.body.appendChild(card.element);
    return { card, onSettled, resolve };
  }

  it('announces each pending approval and moves focus to its primary decision', () => {
    const { card } = approvalCard();
    expect(card.element.getAttribute('role')).toBe('alertdialog');
    const title = document.getElementById(card.element.getAttribute('aria-labelledby')!);
    const description = document.getElementById(card.element.getAttribute('aria-describedby')!);
    expect(title?.textContent).toContain('click');
    expect(description?.textContent).toBe('Click element [4] on this page.');
    card.focus();
    expect(document.activeElement).toBe(card.element.querySelector('.sp-cu-approval-allow'));
    card.element.remove();
  });

  it('does not strand focus when an approval is decided or expires', () => {
    vi.useFakeTimers();
    try {
      const decided = approvalCard();
      decided.card.focus();
      (decided.card.element.querySelector('.sp-cu-approval-allow') as HTMLButtonElement).click();
      expect(decided.card.element.isConnected).toBe(false);
      expect(decided.onSettled).toHaveBeenCalledWith(true);
      expect(decided.resolve).toHaveBeenCalledWith('allow', undefined);

      const expired = approvalCard();
      expired.card.focus();
      vi.advanceTimersByTime(APPROVAL_TIMEOUT_MS);
      expect(expired.card.element.getAttribute('role')).toBe('status');
      expect(document.activeElement).toBe(expired.card.element);
      expect(expired.resolve).toHaveBeenCalledWith('skip');
      expired.card.element.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the panel returning focus to Stop through the shared card', () => {
    expect(panel).toContain('if (restoreFocus) stopBtn.focus()');
  });
});
