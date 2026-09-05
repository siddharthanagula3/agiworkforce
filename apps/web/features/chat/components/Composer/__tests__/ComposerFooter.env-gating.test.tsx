import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@shared/stores/model-store', () => ({
  useModelStore: (
    selector: (s: {
      selectedModelId: string;
      setSelectedModelId: () => void;
      getSelectedModel: () => {
        id: string;
        name: string;
        provider: string;
        providerKey: string;
        description: string;
        requiresEnvironment?: 'e2b' | 'local-runtime';
      };
    }) => unknown,
  ) => {
    const state = {
      selectedModelId: 'hypothetical-e2b-model',
      setSelectedModelId: vi.fn(),
      getSelectedModel: () => ({
        id: 'hypothetical-e2b-model',
        name: 'E2B Sandbox Model',
        provider: 'Anthropic',
        providerKey: 'anthropic',
        description: 'Requires E2B sandbox',
        requiresEnvironment: 'e2b' as const,
      }),
    };
    return selector(state);
  },
  AVAILABLE_MODELS: [
    {
      id: 'fixture-standard-model',
      name: 'Standard Model',
      provider: 'OpenAI',
      providerKey: 'openai',
      description: 'Fast and capable',
      // requiresEnvironment absent
    },
    {
      id: 'hypothetical-e2b-model',
      name: 'E2B Sandbox Model',
      provider: 'Anthropic',
      providerKey: 'anthropic',
      description: 'Requires E2B sandbox',
      requiresEnvironment: 'e2b' as const,
    },
  ],
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (
    selector: (s: {
      subscription: { tier: string } | null;
      dailyUsage_cents: number;
      dailyLimit_cents: number;
    }) => unknown,
  ) => {
    const state = {
      subscription: { tier: 'max' },
      dailyUsage_cents: 0,
      dailyLimit_cents: 0,
    };
    return selector(state);
  },
}));

vi.mock('@shared/config/llm', async (importOriginal) => ({
  ...(await importOriginal()),
  getAllowedAutoModesForTier: () => ['auto-economy', 'auto-balanced', 'auto-premium'],
  getBestAutoModeForTier: () => 'auto-premium',
  getModelMetadata: (id: string) => {
    if (id === 'fixture-standard-model') {
      return {
        id: 'fixture-standard-model',
        name: 'Standard Model',
        capabilities: { thinking: true },
      };
    }
    if (id === 'hypothetical-e2b-model') {
      return {
        id: 'hypothetical-e2b-model',
        name: 'E2B Sandbox Model',
        capabilities: { thinking: false },
        requiresEnvironment: 'e2b',
      };
    }
    return null;
  },
  isModelAllowedForTier: (_id: string, _tier: string) => true,
  splitEffortsByEntitlement: () => ({ allowed: [], gated: [] }),
  getModelReasoning: (_id: string) => ({ capable: false, control: 'none' }),
  FREE_TRIAL_MODELS: [],
  normalizeModelId: (id: string) => id,
}));

vi.mock('@/lib/free-trial-config', () => ({
  FREE_TRIAL_MODELS: [],
  FREE_TRIAL_MODEL: 'fixture-free-trial-model',
}));

vi.mock('../StyleSelector', () => ({
  StyleSelector: () => <div data-testid="style-selector" />,
}));

vi.mock('@shared/stores/thinking-store', () => ({
  useThinkingStore: (selector: (s: { enabled: boolean; effort: string }) => unknown) =>
    selector({ enabled: false, effort: 'medium' }),
}));

vi.mock('@agiworkforce/ui', () => ({
  useMenuKeyboard: () => undefined,
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
  Switch: () => <div data-testid="switch" />,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <>{children}</> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock('@shared/components/ProviderMark', () => ({
  ProviderMark: () => null,
  hasProviderMark: () => false,
}));

vi.mock('@shared/components/agi/AgiMark', () => ({
  AgiMark: () => null,
}));

vi.mock('@agiworkforce/provider-protocol', () => ({
  supportsOpenAIReasoningEffort: () => false,
}));

vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<typeof import('zustand/middleware')>('zustand/middleware');
  return {
    ...actual,
    persist: (config: (set: unknown) => unknown) => config,
  };
});

import { ComposerFooter } from '../ComposerFooter';

describe('ComposerFooter · environment gating (Phase A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(a) normal model without requiresEnvironment is selectable, no env-lock indicator', () => {
    render(<ComposerFooter />);

    const gptRow = screen.getByRole('button', { name: 'Standard Model' });
    expect(gptRow).toBeInTheDocument();
    expect(gptRow).not.toHaveAttribute('aria-disabled', 'true');
    expect(gptRow.getAttribute('aria-label')).toBe('Standard Model');
  });

  it('(b) env-gated model is locked and carries the evaluateModelEnvironment reason', () => {
    render(<ComposerFooter />);

    const envLockedRow = screen.getByRole('button', {
      name: /e2b sandbox model.*requires managed compute/i,
    });
    expect(envLockedRow).toBeInTheDocument();
    expect(envLockedRow).toBeDisabled();
  });

  it('(b) env-gated model shows "Beta" badge, not "Pro" or "Upgrade"', () => {
    render(<ComposerFooter />);

    expect(screen.getByText('Beta')).toBeInTheDocument();

    expect(screen.queryByText(/^(Upgrade|Pro)$/i)).not.toBeInTheDocument();
  });

  it('(b) env-gated model row uses native disabled semantics (not an upgrade path)', () => {
    render(<ComposerFooter />);

    const envLockedRow = screen.getByRole('button', {
      name: /e2b sandbox model/i,
    });
    expect(envLockedRow).toBeDisabled();
  });
});
