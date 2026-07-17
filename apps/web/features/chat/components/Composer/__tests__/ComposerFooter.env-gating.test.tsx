/**
 * ComposerFooter · environment-gating tests (Phase A)
 *
 * Verifies:
 *   (a) A model WITHOUT requiresEnvironment is unaffected by the env check —
 *       it remains selectable and shows no env-lock indicator.
 *   (b) A model WITH requiresEnvironment: 'e2b' is locked even when the user's
 *       tier would otherwise allow it; it shows the reason from
 *       evaluateModelEnvironment and uses the env-lock badge/styling (not the
 *       tier-upgrade badge).
 *
 * Phase A: environmentAvailability() returns { configured: false } for all
 * environments, so all env-gated models are unconditionally locked.
 *
 * These tests use the popover-always-open pattern (PopoverContent always
 * renders) so model rows are visible without simulating a click event.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// AVAILABLE_MODELS: one normal model, one env-gated model.
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
      // Select the env-gated model so it appears in selectedInMore, forcing
      // showMore=true and making the env-locked row visible in the picker.
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
    // Case (a): normal model — no requiresEnvironment
    {
      id: 'gpt-5.6-sol',
      name: 'GPT-5.6 Sol',
      provider: 'OpenAI',
      providerKey: 'openai',
      description: 'Fast and capable',
      // requiresEnvironment absent
    },
    // Case (b): env-gated model — requiresEnvironment set
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

// Billing store: return 'max' tier so both models pass the TIER check.
// The env-gated model must still be locked by the env check alone.
vi.mock('@/stores/unified/auth', () => ({
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

// LLM constants: make both models pass the tier-selectable check.
vi.mock('@shared/config/llm', () => ({
  getAllowedAutoModesForTier: () => ['auto-economy', 'auto-balanced', 'auto-premium'],
  getBestAutoModeForTier: () => 'auto-premium',
  getModelMetadata: (id: string) => {
    if (id === 'gpt-5.6-sol') {
      return { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', capabilities: { thinking: true } };
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
  // isModelAllowedForTier: both models pass on max tier
  isModelAllowedForTier: (_id: string, _tier: string) => true,
  // Reasoning-effort-capability wave: ComposerFooter now reads the per-model
  // reasoning block to drive the effort flyout. These env-gating fixtures are
  // non-reasoning, so the flyout stays hidden (irrelevant to env-lock assertions).
  getModelReasoning: (_id: string) => ({ capable: false, control: 'none' }),
  FREE_TRIAL_MODELS: [],
  normalizeModelId: (id: string) => id,
}));

vi.mock('@/lib/free-trial-config', () => ({
  FREE_TRIAL_MODELS: [],
  FREE_TRIAL_MODEL: 'gemini-3.1-flash-lite',
}));

vi.mock('@/features/chat/components/Budget/BudgetTrackerDisplay', () => ({
  BudgetTrackerDisplay: () => <div data-testid="budget-tracker-display" />,
}));

vi.mock('../StyleSelector', () => ({
  StyleSelector: () => <div data-testid="style-selector" />,
}));

// Thinking store stub
vi.mock('@shared/stores/thinking-store', () => ({
  useThinkingStore: (selector: (s: { enabled: boolean; effort: string }) => unknown) =>
    selector({ enabled: false, effort: 'medium' }),
}));

// ComposerFooter imports Popover, Switch, Tooltip and AlertDialog from the
// @agiworkforce/ui barrel (migrated off the @shared/ui forks). Stub the whole
// barrel: Popover always renders content (simulates open state); AlertDialog is
// open-gated so it stays closed by default (matching the real primitive).
vi.mock('@agiworkforce/ui', () => ({
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

describe('ComposerFooter · environment gating (Phase A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(a) normal model without requiresEnvironment is selectable — no env-lock indicator', () => {
    render(<ComposerFooter />);

    // GPT-5.6 Sol is in the recommended section (no requiresEnvironment, passes env check).
    // Its row aria-label should be just the model name, with no lock indicator and
    // no aria-disabled attribute.
    const gptRow = screen.getByRole('button', { name: 'GPT-5.6 Sol' });
    expect(gptRow).toBeInTheDocument();
    expect(gptRow).not.toHaveAttribute('aria-disabled', 'true');
    // Confirm no "environment not available" text in the aria-label
    expect(gptRow.getAttribute('aria-label')).toBe('GPT-5.6 Sol');
  });

  it('(b) env-gated model is locked and carries the evaluateModelEnvironment reason', () => {
    render(<ComposerFooter />);

    // evaluateModelEnvironment(e2b, {configured:false}) returns:
    //   { selectable: false, reason: 'Requires managed compute — currently in private beta' }
    // The row aria-label must embed this reason.
    const envLockedRow = screen.getByRole('button', {
      name: /e2b sandbox model.*requires managed compute/i,
    });
    expect(envLockedRow).toBeInTheDocument();
    expect(envLockedRow).toBeDisabled();
  });

  it('(b) env-gated model shows "Beta" badge, not "Pro" or "Upgrade"', () => {
    render(<ComposerFooter />);

    // Env-locked models use the "Beta" badge (not an upgrade path)
    expect(screen.getByText('Beta')).toBeInTheDocument();

    // No Pro/Upgrade badge should be present — both models pass the tier check
    // (mocked isModelAllowedForTier returns true for all), so the only locked
    // model is locked by env, not tier.
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
