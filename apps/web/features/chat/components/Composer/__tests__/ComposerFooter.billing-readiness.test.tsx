import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

interface BillingState {
  subscription: { tier: string } | null;
  initialized: boolean;
  isLoading: boolean;
  error: string | null;
  unauthenticated?: boolean;
  dailyUsage_cents: number;
  dailyLimit_cents: number;
}

const billingState: BillingState = {
  subscription: null,
  initialized: true,
  isLoading: false,
  error: null,
  dailyUsage_cents: 0,
  dailyLimit_cents: 0,
};

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (s: BillingState) => unknown) => selector(billingState),
}));

vi.mock('@shared/stores/model-store', () => ({
  useModelStore: (
    selector: (s: {
      selectedModelId: string;
      setSelectedModelId: () => void;
      getSelectedModel: () => unknown;
    }) => unknown,
  ) =>
    selector({
      selectedModelId: 'fixture-economy-auto',
      setSelectedModelId: vi.fn(),
      getSelectedModel: () => ({
        id: 'fixture-economy-auto',
        name: 'Economy Auto',
        provider: 'AGI',
        providerKey: 'managed_cloud',
        description: 'Cheapest routed mode',
      }),
    }),
  AVAILABLE_MODELS: [
    {
      id: 'fixture-economy-auto',
      name: 'Economy Auto',
      provider: 'AGI',
      providerKey: 'managed_cloud',
      description: 'Cheapest routed mode',
    },
    {
      id: 'fixture-premium-model',
      name: 'Premium Model',
      provider: 'OpenAI',
      providerKey: 'openai',
      description: 'Paid plans only',
    },
  ],
}));

vi.mock('@shared/config/llm', () => ({
  getAllowedAutoModesForTier: () => ['fixture-economy-auto'],
  getBestAutoModeForTier: () => 'fixture-economy-auto',
  getModelMetadata: () => null,
  getModelReasoning: () => ({ capable: false, control: 'none' }),
  isModelAllowedForTier: () => true,
  splitEffortsByEntitlement: () => ({ allowed: [], gated: [] }),
  normalizeModelId: (id: string) => id,
  FREE_TRIAL_MODELS: [],
}));

vi.mock('@/lib/free-trial-config', () => ({
  FREE_TRIAL_MODELS: [],
  FREE_TRIAL_MODEL: 'fixture-economy-auto',
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
  Slider: () => <div data-testid="slider" />,
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

import { ComposerFooter } from '../ComposerFooter';

function premiumRowLabel(): string {
  const moreModels = screen.queryByRole('button', { name: /More models/i });
  if (moreModels) fireEvent.click(moreModels);
  const row = screen.getByRole('button', { name: /Premium Model/i });
  return row.getAttribute('aria-label') ?? '';
}

describe('ComposerFooter · plan claims wait for billing readiness', () => {
  beforeEach(() => {
    billingState.subscription = null;
    billingState.initialized = true;
    billingState.isLoading = false;
    billingState.error = null;
    billingState.unauthenticated = undefined;
  });

  it('does not claim an upgrade is required while /api/me is still loading', () => {
    billingState.initialized = false;
    billingState.isLoading = true;

    render(<ComposerFooter />);

    expect(premiumRowLabel()).toBe('Premium Model');
  });

  it('does not claim an upgrade is required when the account request failed', () => {
    billingState.error = 'Network request failed';

    render(<ComposerFooter />);

    expect(premiumRowLabel()).toBe('Premium Model');
  });

  it('applies free-tier locks for a signed-out visitor', () => {
    billingState.unauthenticated = true;

    render(<ComposerFooter />);

    expect(premiumRowLabel()).toBe('Premium Model - requires upgrade');
  });

  it('applies free-tier locks once the free plan is confirmed', () => {
    billingState.subscription = { tier: 'free' };

    render(<ComposerFooter />);

    expect(premiumRowLabel()).toBe('Premium Model - requires upgrade');
  });
});
