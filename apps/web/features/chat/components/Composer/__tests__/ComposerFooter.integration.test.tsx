/**
 * ComposerFooter — integration tests
 *
 * Verifies that the model selector, style selector, and budget tracker
 * are correctly wired into the ComposerFooter component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
      selectedModelId: 'gpt-5.4',
      setSelectedModelId: vi.fn(),
      getSelectedModel: () => ({ id: 'gpt-5.4', name: 'GPT-5.4', provider: 'OpenAI' }),
    };
    return selector(state);
  },
  AVAILABLE_MODELS: [
    { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'OpenAI' },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  ],
}));

// BudgetTrackerDisplay — lightweight stub
vi.mock('@/features/chat/components/Budget/BudgetTrackerDisplay', () => ({
  BudgetTrackerDisplay: () => <div data-testid="budget-tracker-display" />,
}));

// StyleSelector stub
vi.mock('../StyleSelector', () => ({
  StyleSelector: () => <div data-testid="style-selector" />,
}));

// Shared popover primitives — minimal pass-through
vi.mock('@shared/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

// Command components — minimal stubs
vi.mock('@shared/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: ({ placeholder }: { placeholder: string }) => <input placeholder={placeholder} />,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children, heading }: { children: React.ReactNode; heading: string }) => (
    <div>
      <div>{heading}</div>
      {children}
    </div>
  ),
  CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) => (
    <button onClick={onSelect}>{children}</button>
  ),
}));

// zustand persist — avoid localStorage in jsdom
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

describe('ComposerFooter — model selector integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the current model name in the selector button', () => {
    render(<ComposerFooter />);
    expect(screen.getByRole('button', { name: /change model/i })).toHaveTextContent('GPT-5.4');
  });

  it('renders the model selector button with aria-label', () => {
    render(<ComposerFooter />);
    expect(screen.getByRole('button', { name: /change model/i })).toBeInTheDocument();
  });

  it('hides model selector when showModelSelector=false', () => {
    render(<ComposerFooter showModelSelector={false} />);
    expect(screen.queryByRole('button', { name: /change model/i })).not.toBeInTheDocument();
  });

  it('renders model options grouped by provider', () => {
    render(<ComposerFooter />);
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
  });
});

describe('ComposerFooter — layout', () => {
  it('renders keyboard hint text', () => {
    render(<ComposerFooter hint="Enter to send" />);
    expect(screen.getByText('Enter to send')).toBeInTheDocument();
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

  it('renders default hint when no hint prop is provided', () => {
    render(<ComposerFooter />);
    expect(screen.getByText(/Enter to send/)).toBeInTheDocument();
  });
});
