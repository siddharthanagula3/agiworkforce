import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatComposerNew } from './ChatComposerNew';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
  }),
}));

/**
 * M11, extended by the composer parity wave. The resting composer measured
 * ~130px at 390px against ChatGPT's ~87px, and every contributing value was a
 * single unconditional class: `p-2`/`py-3` of column padding, `gap-2` between
 * the rows, a 52px input row and a 44px mic that set the control row's height
 * on its own.
 *
 * The parity wave then merged the textbox and the control row into one
 * flex-nowrap line (plus, textbox, right cluster), so the budget at 390px is
 * 2 (border) + 12 (p-1.5) + 36 (one row) = 50px at rest. Desktop keeps the
 * 12px inner padding (`sm:p-3`) and the 52px textbox row the founder approved
 * on 2026-09-05; the tighter parity target was reverted on their instruction.
 * A browser re-measure is the proof; these are the class states it measures.
 */
function box(): HTMLElement {
  const node = document.querySelector('#chat-composer');
  if (!node) throw new Error('the composer box did not render');
  return node as HTMLElement;
}

function column(): HTMLElement {
  return box().firstElementChild as HTMLElement;
}

describe('composer mobile density', () => {
  it('halves the column padding and row gap below sm and restores both above it', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    expect(column()).toHaveClass('p-1.5', 'gap-1.5', 'sm:p-3', 'sm:gap-2');
  });

  it('keeps the empty-state surface on the same mobile step', () => {
    render(<ChatComposerNew onSend={vi.fn()} emptyState />);

    expect(column()).toHaveClass('px-3', 'py-1.5', 'sm:px-5', 'sm:py-3');
  });

  it('shares the 36px mobile step, and keeps the desktop chat row at 52px', () => {
    const view = render(<ChatComposerNew onSend={vi.fn()} />);
    const row = () => screen.getByRole('textbox').parentElement as HTMLElement;

    expect(row()).toHaveClass('min-h-[36px]', 'sm:min-h-[52px]');

    view.rerender(<ChatComposerNew onSend={vi.fn()} emptyState />);
    expect(row()).toHaveClass('min-h-[36px]', 'sm:min-h-[40px]');
  });

  it('pins the empty textarea to the mobile resting height, not the desktop one', () => {
    // jsdom reports no media match, which is the desktop branch, the same one
    // the first-paint test in ChatComposerNew.test.tsx measures. Pin the mobile
    // branch explicitly so the JS height and the classes cannot drift apart.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );

    render(<ChatComposerNew onSend={vi.fn()} />);

    expect(screen.getByRole('textbox')).toHaveStyle({ height: '36px' });
    vi.unstubAllGlobals();
  });

  it('drops the control row to a single 32px height, mic included', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    // The mic was 44px and set the row's height by itself; the "+" beside it
    // was 36px. Both now match below sm and keep their old size above it.
    expect(screen.getByRole('button', { name: /Add attachments and tools/ })).toHaveClass(
      'h-8',
      'w-8',
      'sm:h-9',
      'sm:w-9',
    );
    expect(screen.getByRole('button', { name: /voice|dictat|microphone/i })).toHaveClass(
      'h-8',
      'w-8',
      'sm:h-9',
      'sm:w-9',
    );
  });
});
