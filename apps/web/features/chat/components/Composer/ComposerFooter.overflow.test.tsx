import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ComposerFooter } from './ComposerFooter';
import { useModelStore, AVAILABLE_MODELS } from '@shared/stores/model-store';

/**
 * Composer bottom-row layout invariants (Send-button overflow + narrow-width model
 * selector collapse).
 *
 * WHY STRUCTURAL, NOT PIXEL: jsdom has no layout engine, so it cannot measure a real
 * wrap, element width, or overlap. These tests assert the STRUCTURAL invariants that
 * guarantee the fixed behavior; the real-browser proof (elementFromPoint + bounding
 * boxes at 375px and 320px with the longest / a 42-char injected model name) lives in
 * the Playwright verification for this change.
 *
 * The two invariants:
 *   1. Unbroken `min-w-0` shrink chain from the footer root down to the model trigger,
 *      so the trigger CAN shrink instead of forcing the Send button to wrap.
 *   2. The model NAME has a guaranteed min-width FLOOR (`min-w-[3.5rem]`) plus
 *      `truncate`, so it can never collapse to 0px (the old bug: name → 0px left only a
 *      ~12px provider icon that overflowed UNDER the Send button at 375px). It still
 *      truncates (capped at `max-w-[140px]`) so long names don't force a wrap.
 *
 * Also guards the founder directive: the persistent "Cmd+Enter to send" keyboard hint
 * must NOT render in the composer.
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

describe('ComposerFooter inline — bottom row stays a single usable line', () => {
  beforeEach(() => {
    useModelStore.setState({ selectedModelId: longestModel.id });
  });

  it('keeps an unbroken min-w-0 shrink chain from the footer root to the model trigger', () => {
    const { container } = renderFooter();
    const trigger = container.querySelector('#model-selector') as HTMLElement | null;
    expect(trigger).toBeTruthy();

    // Every flex ancestor between the model trigger and the footer root MUST carry
    // min-w-0, or the trigger can't shrink and the Send button wraps.
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

  it('floors the model name width so it can never collapse to 0px, but still truncates', () => {
    const { container } = renderFooter();
    const trigger = container.querySelector('#model-selector') as HTMLElement | null;
    expect(trigger).toBeTruthy();

    const nameSpan = trigger!.querySelector('span.truncate') as HTMLElement | null;
    expect(nameSpan).toBeTruthy();
    // Guaranteed floor: the label can never shrink to 0 (only-icon-under-Send bug).
    expect(nameSpan!.className).toContain('min-w-[3.5rem]');
    // Still truncates + capped so a long name doesn't force the Send button to wrap.
    expect(nameSpan!.className).toContain('truncate');
    expect(nameSpan!.className).toContain('max-w-[140px]');
    // The old zero-collapse floor (`min-w-0` directly on the name) must be gone.
    expect(nameSpan!.className).not.toContain('min-w-0');
  });

  it('does NOT render the persistent "Cmd+Enter to send" keyboard hint', () => {
    const { container } = renderFooter();
    expect(container.textContent).not.toContain('Cmd+Enter');
    expect(container.textContent?.toLowerCase()).not.toContain('to send');
  });

  it('hides the response-style selector below sm so the model selector keeps width', () => {
    const { container } = renderFooter();
    const styleBtn = container.querySelector(
      'button[aria-label="Response style"]',
    ) as HTMLElement | null;
    expect(styleBtn).toBeTruthy();
    // Its wrapper is display:none until sm (mobile composer drops it, claude.ai-style).
    const wrapper = styleBtn!.closest('.hidden') as HTMLElement | null;
    expect(wrapper).toBeTruthy();
    expect(wrapper!.className).toContain('sm:block');
  });
});
