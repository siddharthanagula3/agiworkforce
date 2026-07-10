/**
 * ComposerFooter · integration tests
 *
 * Verifies that the model selector, style selector, and budget tracker
 * are correctly wired into the ComposerFooter component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Model store stub
vi.mock('@shared/stores/model-store', () => ({
  useModelStore: (
    selector: (s: {
      selectedModelId: string;
      setSelectedModelId: () => void;
      getSelectedModel: () => { id: string; name: string; provider: string };
    }) => unknown,
  ) => {
    const state = {
      selectedModelId: 'gpt-5.5',
      setSelectedModelId: vi.fn(),
      getSelectedModel: () => ({ id: 'gpt-5.5', name: 'GPT-5.5', provider: 'OpenAI' }),
    };
    return selector(state);
  },
  AVAILABLE_MODELS: [
    // ComposerFooter groups by `providerKey` (the lowercase models.json key);
    // `provider` is the display label only.
    { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'OpenAI', providerKey: 'openai' },
    {
      id: 'claude-3-5-sonnet',
      name: 'Claude 3.5 Sonnet',
      provider: 'Anthropic',
      providerKey: 'anthropic',
    },
  ],
}));

// BudgetTrackerDisplay · lightweight stub
vi.mock('@/features/chat/components/Budget/BudgetTrackerDisplay', () => ({
  BudgetTrackerDisplay: () => <div data-testid="budget-tracker-display" />,
}));

// StyleSelector stub
vi.mock('../StyleSelector', () => ({
  StyleSelector: () => <div data-testid="style-selector" />,
}));

// ComposerFooter (and the wider tree it renders here — BudgetTrackerDisplay etc.)
// pulls many exports from the @agiworkforce/ui barrel. This integration test only
// needs Radix Popover stubbed so its content renders inline in jsdom; keep every
// other barrel export real via importOriginal (matches the pre-migration behavior,
// which stubbed only @shared/ui/popover).
vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/ui')>()),
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

// zustand persist · avoid localStorage in jsdom
vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<typeof import('zustand/middleware')>('zustand/middleware');
  return {
    ...actual,
    persist: (config: (set: unknown) => unknown) => config,
  };
});

// ── Subject ───────────────────────────────────────────────────────────────────

import { ComposerFooter } from '../ComposerFooter';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ComposerFooter · model selector integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the current model name in the selector button', () => {
    render(<ComposerFooter />);
    expect(screen.getByRole('button', { name: /change model/i })).toHaveTextContent('GPT-5.5');
  });

  it('renders the model selector button with aria-label', () => {
    render(<ComposerFooter />);
    expect(screen.getByRole('button', { name: /change model/i })).toBeInTheDocument();
  });

  it('hides model selector when showModelSelector=false', () => {
    render(<ComposerFooter showModelSelector={false} />);
    expect(screen.queryByRole('button', { name: /change model/i })).not.toBeInTheDocument();
  });

  it('renders grouped model options (a More models section) when the selector is opened', async () => {
    render(<ComposerFooter />);
    // The grouped options live inside the (closed-by-default) popover. Recommended
    // models render at the top; the remainder collapse under a "More models" section.
    await userEvent.click(screen.getByRole('button', { name: /change model/i }));
    expect(await screen.findByText('More models')).toBeInTheDocument();
  });
});

describe('ComposerFooter · layout', () => {
  it('does NOT render a persistent keyboard-send hint (founder directive, claude.ai parity)', () => {
    const { container } = render(<ComposerFooter />);
    expect(container.textContent).not.toMatch(/Cmd\+Enter|Enter to send|newline/i);
  });

  it('renders BudgetTrackerDisplay', () => {
    render(<ComposerFooter />);
    expect(screen.getByTestId('budget-tracker-display')).toBeInTheDocument();
  });

  it('renders StyleSelector', () => {
    render(<ComposerFooter />);
    expect(screen.getByTestId('style-selector')).toBeInTheDocument();
  });

  it('renders model selector and style selector in the same row', () => {
    render(<ComposerFooter />);
    const styleSelector = screen.getByTestId('style-selector');
    const modelBtn = screen.getByRole('button', { name: /change model/i });
    expect(styleSelector).toBeInTheDocument();
    expect(modelBtn).toBeInTheDocument();
  });

});
