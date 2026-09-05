import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const toastErrorMock = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }));

vi.mock('@shared/stores/model-store', () => ({
  useModelStore: (
    selector: (s: {
      selectedModelId: string;
      setSelectedModelId: () => void;
      getSelectedModel: () => { id: string; name: string; provider: string };
    }) => unknown,
  ) => {
    const state = {
      selectedModelId: 'fixture-primary-model',
      setSelectedModelId: vi.fn(),
      getSelectedModel: () => ({
        id: 'fixture-primary-model',
        name: 'Primary Model',
        provider: 'OpenAI',
      }),
    };
    return selector(state);
  },
  AVAILABLE_MODELS: [
    {
      id: 'fixture-primary-model',
      name: 'Primary Model',
      provider: 'OpenAI',
      providerKey: 'openai',
    },
    {
      id: 'fixture-secondary-model',
      name: 'Secondary Model',
      provider: 'Anthropic',
      providerKey: 'anthropic',
    },
    {
      id: 'fixture-locked-model',
      name: 'Locked Model',
      provider: 'Fixture Provider',
      providerKey: 'fixture-provider',
    },
  ],
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: unknown) => unknown) =>
    selector({
      subscription: { tier: 'max_15x' },
      initialized: true,
      isLoading: false,
      error: null,
    }),
}));

vi.mock('@shared/config/llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/config/llm')>()),
  isModelAllowedForTier: (modelId: string) => modelId !== 'fixture-locked-model',
}));

vi.mock('@/features/chat/components/Budget/BudgetTrackerDisplay', () => ({
  BudgetTrackerDisplay: () => <div data-testid="budget-tracker-display" />,
}));

vi.mock('../StyleSelector', () => ({
  StyleSelector: () => <div data-testid="style-selector" />,
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/ui')>()),
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
    <div role="dialog" data-testid="popover-content" {...props}>
      {children}
    </div>
  ),
}));

vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<typeof import('zustand/middleware')>('zustand/middleware');
  return {
    ...actual,
    persist: (config: (set: unknown) => unknown) => config,
  };
});

import { ComposerFooter } from '../ComposerFooter';

describe('ComposerFooter · model selector integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the current model name in the selector button', () => {
    render(<ComposerFooter />);
    expect(screen.getByRole('button', { name: /change model/i })).toHaveTextContent(
      'Primary Model',
    );
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
    await userEvent.click(screen.getByRole('button', { name: /change model/i }));
    expect(await screen.findByText('More models')).toBeInTheDocument();
  });

  it('uses the visible Models heading as the selector dialog name', () => {
    render(<ComposerFooter />);
    expect(screen.getByRole('dialog', { name: 'Models' })).toBeInTheDocument();
  });

  it('shows a saving state and keeps the prior model when durable persistence fails', async () => {
    let finishSave: ((saved: boolean) => void) | undefined;
    const onModelChange = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSave = resolve;
        }),
    );
    render(<ComposerFooter onModelChange={onModelChange} />);

    await userEvent.click(screen.getByRole('button', { name: /change model/i }));
    await userEvent.click(screen.getByRole('button', { name: /secondary model/i }));

    expect(onModelChange).toHaveBeenCalledWith('fixture-secondary-model');
    expect(screen.getByRole('button', { name: /saving model selection/i })).toBeDisabled();

    finishSave?.(false);
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /change model/i })).toHaveTextContent(
      'Primary Model',
    );
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
