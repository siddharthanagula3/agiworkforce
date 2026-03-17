/**
 * ComposerFooter — integration tests
 *
 * Verifies that AgentModeSwitcher and the model selector are correctly
 * wired into the ComposerFooter component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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
      selectedModelId: 'gpt-4o',
      setSelectedModelId: vi.fn(),
      getSelectedModel: () => ({ id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' }),
    };
    return selector(state);
  },
  AVAILABLE_MODELS: [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  ],
}));

// BudgetTrackerDisplay — lightweight stub
vi.mock('@/components/UnifiedAgenticChat/BudgetTrackerDisplay', () => ({
  BudgetTrackerDisplay: () => <div data-testid="budget-tracker-display" />,
}));

// AgentModeSwitcher stub that captures mode changes
vi.mock('../AgentModeSwitcher', () => ({
  AgentModeSwitcher: ({
    mode,
    onChange,
    disabled,
  }: {
    mode: string;
    onChange: (m: string) => void;
    disabled?: boolean;
  }) => (
    <div data-testid="agent-mode-switcher" data-mode={mode} data-disabled={String(!!disabled)}>
      <button onClick={() => onChange('engineer')} aria-label="Switch to engineer mode">
        Switch mode
      </button>
    </div>
  ),
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

describe('ComposerFooter — AgentModeSwitcher integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders AgentModeSwitcher', () => {
    render(<ComposerFooter />);
    expect(screen.getByTestId('agent-mode-switcher')).toBeInTheDocument();
  });

  it('defaults to solo mode', () => {
    render(<ComposerFooter />);
    expect(screen.getByTestId('agent-mode-switcher')).toHaveAttribute('data-mode', 'solo');
  });

  it('updates mode when AgentModeSwitcher onChange is triggered', () => {
    render(<ComposerFooter />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /switch to engineer mode/i }));
    });
    // After mode change the switcher should reflect 'engineer'
    expect(screen.getByTestId('agent-mode-switcher')).toHaveAttribute('data-mode', 'engineer');
  });
});

describe('ComposerFooter — model selector integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the current model name in the selector button', () => {
    render(<ComposerFooter />);
    // The button that triggers the popover contains the model name
    expect(screen.getByRole('button', { name: /change model/i })).toHaveTextContent('GPT-4o');
  });

  it('renders the model selector button with aria-label', () => {
    render(<ComposerFooter />);
    expect(screen.getByRole('button', { name: /change model/i })).toBeInTheDocument();
  });

  it('hides model selector when showModelSelector=false', () => {
    render(<ComposerFooter showModelSelector={false} />);
    expect(screen.queryByRole('button', { name: /change model/i })).not.toBeInTheDocument();
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

  it('renders AgentModeSwitcher and model selector in the same row', () => {
    render(<ComposerFooter />);
    const switcher = screen.getByTestId('agent-mode-switcher');
    const modelBtn = screen.getByRole('button', { name: /change model/i });
    // Both should be present simultaneously
    expect(switcher).toBeInTheDocument();
    expect(modelBtn).toBeInTheDocument();
  });
});
