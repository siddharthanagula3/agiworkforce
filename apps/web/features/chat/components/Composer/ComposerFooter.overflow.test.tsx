import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ComposerFooter } from './ComposerFooter';
import { useModelStore, AVAILABLE_MODELS } from '@shared/stores/model-store';

/**
 * Bug 1 (composer overflow — Send button drops to a 2nd row inside a conversation).
 *
 * WHY THE PRIOR "single-line by construction" FIX FAILED: it added `min-w-0` only to
 * the outermost ComposerFooter wrapper and the model trigger button, but truncation
 * needs an UNBROKEN `min-w-0` chain — the two intermediate flex divs between them had
 * `min-w-0: auto`, so they refused to shrink below their content. The model-name
 * span's own `max-w-[140px] truncate` masked that (it self-clips regardless), so the
 * empty homepage (wide column, no sidebar) looked fine — but the ALWAYS-visible
 * keyboard hint was a rigid `whitespace-nowrap` with no max-width, and inside a real
 * conversation the sidebar narrows the composer column enough that the rigid hint +
 * model pill pushed the Send button onto a second row.
 *
 * jsdom has no layout, so this can't measure a real wrap. Instead it asserts the
 * STRUCTURAL invariant that guarantees no-wrap: the shrink chain from the footer root
 * down to the model name is unbroken, and the hint is shrinkable rather than rigid.
 * A real-browser check (1440 w/ sidebar + 375, longest model name) verifies behavior.
 */

// Longest model name in the catalog — the worst case for the control row width.
const longestModel = [...AVAILABLE_MODELS].sort((a, b) => b.name.length - a.name.length)[0]!;

function renderFooter() {
  return render(
    <div style={{ width: 320 }}>
      <ComposerFooter inline showModelSelector />
    </div>,
  );
}

describe('ComposerFooter inline — bottom row stays a single line', () => {
  beforeEach(() => {
    useModelStore.setState({ selectedModelId: longestModel.id });
  });

  it('keeps an unbroken min-w-0 shrink chain from the footer root to the model name', () => {
    const { container } = renderFooter();
    const trigger = container.querySelector('#model-selector') as HTMLElement | null;
    expect(trigger).toBeTruthy();

    // The model-name span shrinks/clips within a bounded width.
    const nameSpan = trigger!.querySelector('span.truncate') as HTMLElement | null;
    expect(nameSpan).toBeTruthy();
    expect(nameSpan!.className).toContain('min-w-0');
    expect(nameSpan!.className).toContain('max-w-[140px]');

    // Every flex ancestor between the model trigger and the footer root MUST carry
    // min-w-0, or the name can't shrink and the Send button wraps. This is the exact
    // invariant the prior fix violated at the two intermediate divs.
    const root = container.firstElementChild as HTMLElement; // the width wrapper
    let el: HTMLElement | null = trigger;
    while (el && el !== root) {
      if (el.classList.contains('flex')) {
        expect(
          el.className.includes('min-w-0'),
          `flex ancestor missing min-w-0 (breaks the shrink chain): "${el.className}"`,
        ).toBe(true);
      }
      el = el.parentElement;
    }
  });

  it('renders the keyboard hint as shrinkable (truncate + min-w-0), not rigid nowrap', () => {
    const { container } = renderFooter();
    const hint = Array.from(container.querySelectorAll('span')).find((s) =>
      s.textContent?.includes('Cmd+Enter'),
    ) as HTMLElement | undefined;
    expect(hint).toBeTruthy();
    expect(hint!.className).toContain('truncate');
    expect(hint!.className).toContain('min-w-0');
    // The rigid nowrap-with-no-max-width hint is what forced the wrap; it must be gone.
    expect(hint!.className).not.toContain('whitespace-nowrap');
  });
});
