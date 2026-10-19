import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { APPROVAL_TIMEOUT_MS } from '../src/features/computer-use/agentLoop';
import { buildBrowserApprovalCard } from '../src/features/side-panel/computerUsePanel';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, '..', rel), 'utf8');

describe('computer-use default = Auto, crucial actions still ask', () => {
  const background = read('src/background.ts');
  const panel = read('src/features/side-panel/computerUsePanel.ts');

  it('background reads the stored mode through the one reader, so unset means Auto', () => {
    expect(background).toContain('readBrowserPermissionMode(askPref[ASK_BEFORE_ACTING_KEY])');
    expect(background).not.toMatch(/askPref\[ASK_BEFORE_ACTING_KEY\]\s*===\s*true/);
    expect(background).toMatch(/crucial: isCrucialAction\(requirement\)/);
  });

  it('the Ask before acting checkbox is off by default, which is Auto', () => {
    expect(panel).toMatch(/askCheckbox\.checked\s*=\s*false;/);
  });
});

describe('computer-use ask gate persists and rehydrates', () => {
  const panel = read('src/features/side-panel/computerUsePanel.ts');

  it('rehydrates the stored gate instead of always rendering the default', () => {
    expect(panel).toMatch(/storage\?\.local\?\.get\(ASK_BEFORE_ACTING_KEY/);
    expect(panel).toMatch(
      /askCheckbox\.checked\s*=\s*readBrowserPermissionMode\(items\?\.\[ASK_BEFORE_ACTING_KEY\]\) === 'ask'/,
    );
  });

  it('writes the gate on toggle: on is Ask first, off is Auto, never Full access', () => {
    expect(panel).toMatch(/askCheckbox\.addEventListener\('change'/);
    expect(panel).toContain(
      "[ASK_BEFORE_ACTING_KEY]: browserPermissionModeToStored(next ? 'ask' : 'auto')",
    );
  });

  it('rolls the control back when the authoritative storage write fails', () => {
    expect(panel).toContain('askCheckbox.checked = !next');
    expect(panel).toContain('The previous setting is still active.');
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
      vi.advanceTimersByTime(60_000);
      expect(expired.resolve).not.toHaveBeenCalled();
      vi.advanceTimersByTime(APPROVAL_TIMEOUT_MS - 60_000);
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
