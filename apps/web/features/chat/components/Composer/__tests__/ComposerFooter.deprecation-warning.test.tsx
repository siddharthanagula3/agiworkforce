/**
 * ComposerFooter · deprecation advance-warning (CLR-01 / mqp-08)
 *
 * `deprecation_date` is a real catalog field, but its only consumer used to
 * be `isCurrentModel()` in model-store.ts, which filters a model out of the
 * picker entirely once the date passes, a selected model could vanish with
 * zero warning. model-store.ts now propagates a still-future date onto
 * `AIModel.deprecationDate`; this file verifies ComposerFooter's row
 * renderer actually surfaces it as a "Leaving on <date>" badge ahead of the
 * deadline (matching ChatGPT's in-picker countdown), and stays silent
 * outside the warning window or when the field is absent.
 *
 * Follows the mocking pattern established by ComposerFooter.env-gating.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// vi.mock factories below are hoisted above normal top-level declarations, so
// the fixture dates they close over must be computed inside vi.hoisted().
const { nearDeprecationDate, farDeprecationDate } = vi.hoisted(() => {
  const DAY_MS = 1000 * 60 * 60 * 24;
  return {
    nearDeprecationDate: new Date(Date.now() + 10 * DAY_MS).toISOString(),
    farDeprecationDate: new Date(Date.now() + 90 * DAY_MS).toISOString(),
  };
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

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
      };
    }) => unknown,
  ) => {
    const state = {
      selectedModelId: 'fixture-live-model',
      setSelectedModelId: vi.fn(),
      getSelectedModel: () => ({
        id: 'fixture-live-model',
        name: 'Live Model',
        provider: 'OpenAI',
        providerKey: 'openai',
        description: 'No scheduled retirement',
      }),
    };
    return selector(state);
  },
  AVAILABLE_MODELS: [
    // No deprecationDate at all, must show no badge.
    {
      id: 'fixture-live-model',
      name: 'Live Model',
      provider: 'OpenAI',
      providerKey: 'openai',
      description: 'No scheduled retirement',
    },
    // Within the 30-day warning window, must show the badge.
    {
      id: 'fixture-near-deprecation-model',
      name: 'Sunsetting Model',
      provider: 'OpenAI',
      providerKey: 'openai',
      description: 'Retiring soon',
      deprecationDate: nearDeprecationDate,
    },
    // Scheduled, but outside the warning window, must show no badge yet.
    {
      id: 'fixture-far-deprecation-model',
      name: 'Far Future Model',
      provider: 'OpenAI',
      providerKey: 'openai',
      description: 'Retiring eventually',
      deprecationDate: farDeprecationDate,
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
    const state = { subscription: { tier: 'max' }, dailyUsage_cents: 0, dailyLimit_cents: 0 };
    return selector(state);
  },
}));

vi.mock('@shared/config/llm', async (importOriginal) => ({
  ...(await importOriginal()),
  getAllowedAutoModesForTier: () => ['auto-economy', 'auto-balanced', 'auto-premium'],
  getBestAutoModeForTier: () => 'auto-premium',
  getModelMetadata: (id: string) => ({
    id,
    name: id,
    capabilities: { thinking: false },
  }),
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

// ── Subject ───────────────────────────────────────────────────────────────────

import { ComposerFooter } from '../ComposerFooter';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ComposerFooter · deprecation advance-warning (CLR-01 / mqp-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows no "Leaving" badge for a model with no scheduled retirement', () => {
    render(<ComposerFooter />);

    const row = screen.getByRole('button', { name: 'Live Model' });
    expect(row).toBeInTheDocument();
    expect(row.getAttribute('aria-label')).toBe('Live Model');
  });

  it('shows a "Leaving <date>" badge for a model inside the warning window', () => {
    render(<ComposerFooter />);

    const expectedShortLabel = new Date(nearDeprecationDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const expectedFullLabel = new Date(nearDeprecationDate).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    expect(screen.getByText(`Leaving ${expectedShortLabel}`)).toBeInTheDocument();

    const row = screen.getByRole('button', {
      name: new RegExp(`Sunsetting Model.*Leaving on`, 'i'),
    });
    expect(row).toBeInTheDocument();
    expect(row.getAttribute('aria-label')).toBe(
      `Sunsetting Model - Leaving on ${expectedFullLabel}`,
    );
    // Still fully selectable, the warning is informational, not a lock.
    expect(row).not.toBeDisabled();
  });

  it('shows no badge yet for a model scheduled outside the warning window', () => {
    render(<ComposerFooter />);

    const row = screen.getByRole('button', { name: 'Far Future Model' });
    expect(row).toBeInTheDocument();
    expect(row.getAttribute('aria-label')).toBe('Far Future Model');
  });
});
