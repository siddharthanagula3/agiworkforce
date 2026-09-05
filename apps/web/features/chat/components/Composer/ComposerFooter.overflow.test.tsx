import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ComposerFooter } from './ComposerFooter';
import { useModelStore, AVAILABLE_MODELS } from '@shared/stores/model-store';

const longestModel = [...AVAILABLE_MODELS].sort((a, b) => b.name.length - a.name.length)[0]!;

function renderFooter() {
  return render(
    <div style={{ width: 320 }}>
      <ComposerFooter inline showModelSelector />
    </div>,
  );
}

describe('ComposerFooter inline, bottom row stays a single usable line', () => {
  beforeEach(() => {
    useModelStore.setState({ selectedModelId: longestModel.id });
  });

  it('keeps an unbroken min-w-0 shrink chain from the footer root to the model trigger', () => {
    const { container } = renderFooter();
    const trigger = container.querySelector('#model-selector') as HTMLElement | null;
    expect(trigger).toBeTruthy();

    const root = container.firstElementChild as HTMLElement;
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
    expect(nameSpan!.className).toContain('min-w-[3.5rem]');
    expect(nameSpan!.className).toContain('truncate');
    expect(nameSpan!.className).toContain('max-w-[140px]');
    expect(nameSpan!.className).not.toContain('min-w-0');
  });

  it('does NOT render the persistent "Cmd+Enter to send" keyboard hint', () => {
    const { container } = renderFooter();
    expect(container.textContent).not.toContain('Cmd+Enter');
    expect(container.textContent?.toLowerCase()).not.toContain('to send');
  });

  it('hides the response-style selector below sm so the control row stays one line', () => {
    const { container } = renderFooter();
    const styleBtn = container.querySelector(
      'button[aria-label="Response style"]',
    ) as HTMLElement | null;
    expect(styleBtn).toBeTruthy();
    const wrapper = styleBtn!.closest('.hidden') as HTMLElement | null;
    expect(wrapper).toBeTruthy();
    expect(wrapper!.className).toContain('sm:block');
  });
});
