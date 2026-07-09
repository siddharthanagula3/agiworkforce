/**
 * AdvancedModeToggle component tests.
 *
 * Covers:
 * 1. Toggle hidden when tier is 'free' or 'hobby' (allowManualSelection: false)
 * 2. Toggle visible + interactive when tier is 'pro' or 'max'
 * 3. Dropdown only renders when toggle is ON
 * 4. Dropdown items match the tier's allowedSlots resolved through SLOT_REGISTRY
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const modelFixtureIds = vi.hoisted(() => ({
  fast: 'test-model-fast',
  balanced: 'test-model-balanced',
  premium: 'test-model-premium',
  image: 'test-model-image',
}));

// ---------------------------------------------------------------------------
// Mock @agiworkforce/types
// We mock getTierPolicy and SLOT_REGISTRY at the module boundary so the
// test does not trigger the module-load drift check against models.json.
// ---------------------------------------------------------------------------

vi.mock('@agiworkforce/types', () => {
  const FREE_POLICY = {
    tier: 'free',
    surfacedUx: 'auto_only',
    allowedSlots: ['workhorse_general'],
    allowManualSelection: false,
    manualModelSelection: false,
    allowBrowserDom: false,
    allowComputerUse: false,
    allowSearch: false,
    allowMediaGeneration: false,
  };

  const HOBBY_POLICY = {
    tier: 'hobby',
    surfacedUx: 'auto_only',
    allowedSlots: ['workhorse_general', 'escalation_coding', 'reasoning_premium'],
    allowManualSelection: false,
    manualModelSelection: false,
    allowBrowserDom: false,
    allowComputerUse: false,
    allowSearch: true,
    allowMediaGeneration: true,
  };

  const PRO_POLICY = {
    tier: 'pro',
    surfacedUx: 'auto_plus_manual',
    allowedSlots: ['workhorse_general', 'general_balanced_pro', 'coding_premium_pro'],
    allowManualSelection: true,
    manualModelSelection: true,
    allowBrowserDom: true,
    allowComputerUse: true,
    allowSearch: true,
    allowMediaGeneration: true,
  };

  const MAX_POLICY = {
    tier: 'max',
    surfacedUx: 'auto_plus_manual',
    allowedSlots: ['general_fast', 'general_balanced', 'general_premium', 'image_generation'],
    allowManualSelection: true,
    manualModelSelection: true,
    allowBrowserDom: true,
    allowComputerUse: true,
    allowSearch: true,
    allowMediaGeneration: true,
  };

  const POLICIES: Record<string, typeof FREE_POLICY> = {
    free: FREE_POLICY,
    hobby: HOBBY_POLICY,
    pro: PRO_POLICY,
    max: MAX_POLICY,
  };

  function getTierPolicy(tier: string | null | undefined) {
    const key = (tier ?? 'free').toLowerCase();
    return POLICIES[key] ?? FREE_POLICY;
  }

  // Slot registry aligned with PRO_POLICY + MAX_POLICY allowedSlots.
  // image_generation is intentionally excluded from picker (specialty slot).
  const SLOT_REGISTRY: Record<string, { slot: string; label: string; modelId: string }> = {
    workhorse_general: {
      slot: 'workhorse_general',
      label: 'Workhorse (general)',
      modelId: modelFixtureIds.fast,
    },
    general_balanced_pro: {
      slot: 'general_balanced_pro',
      label: 'Pro balanced',
      modelId: modelFixtureIds.balanced,
    },
    coding_premium_pro: {
      slot: 'coding_premium_pro',
      label: 'Pro coding',
      modelId: modelFixtureIds.balanced,
    },
    general_fast: {
      slot: 'general_fast',
      label: 'General fast',
      modelId: modelFixtureIds.fast,
    },
    general_balanced: {
      slot: 'general_balanced',
      label: 'General balanced',
      modelId: modelFixtureIds.balanced,
    },
    general_premium: {
      slot: 'general_premium',
      label: 'General premium',
      modelId: modelFixtureIds.premium,
    },
    image_generation: {
      slot: 'image_generation',
      label: 'Image generation',
      modelId: modelFixtureIds.image,
    },
  };

  return { getTierPolicy, SLOT_REGISTRY };
});

// ---------------------------------------------------------------------------
// Mock @/constants/llm · getModelMetadata
// ---------------------------------------------------------------------------

vi.mock('@/constants/llm', () => ({
  getModelMetadata: (modelId: string) => {
    const names: Record<string, string> = {
      [modelFixtureIds.fast]: 'Fixture Fast Model',
      [modelFixtureIds.balanced]: 'Fixture Balanced Model',
      [modelFixtureIds.premium]: 'Fixture Premium Model',
      [modelFixtureIds.image]: 'Fixture Image Model',
    };
    return names[modelId] ? { name: names[modelId] } : null;
  },
}));

// ---------------------------------------------------------------------------
// Mock @/stores/settingsStore
// ---------------------------------------------------------------------------

const mockSettingsState: {
  advancedMode: boolean;
  advancedModelId: string | null;
  setAdvancedMode: ReturnType<typeof vi.fn>;
  setAdvancedModelId: ReturnType<typeof vi.fn>;
} = {
  advancedMode: false,
  advancedModelId: null,
  setAdvancedMode: vi.fn(),
  setAdvancedModelId: vi.fn(),
};

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: typeof mockSettingsState) => unknown) =>
    selector(mockSettingsState),
}));

// ---------------------------------------------------------------------------
// Mock shared/ui primitives
// ---------------------------------------------------------------------------

// AdvancedModeToggle imports Switch, Select*, Label, and Badge from the
// @agiworkforce/ui barrel (migrated off the @shared/ui forks). These are the only
// barrel exports it uses, so a full-module stub is safe.
vi.mock('@agiworkforce/ui', () => {
  const Switch = ({
    checked,
    onCheckedChange,
    id,
    'aria-label': ariaLabel,
    ...rest
  }: {
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
    id?: string;
    'aria-label'?: string;
  }) => (
    <button
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onCheckedChange(!checked)}
      data-testid="advanced-mode-switch"
      {...rest}
    />
  );
  const Select = ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => (
    <div data-testid="model-select" data-value={value}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
              _onValueChange: onValueChange,
            })
          : child,
      )}
    </div>
  );
  const SelectTrigger = ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <button id={id} data-testid="select-trigger">
      {children}
    </button>
  );
  const SelectValue = ({ placeholder }: { placeholder?: string }) => (
    <span data-testid="select-value">{placeholder}</span>
  );
  const SelectContent = ({
    children,
    _onValueChange,
  }: {
    children: React.ReactNode;
    _onValueChange?: (v: string) => void;
  }) => (
    <div data-testid="select-content">
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
              _onValueChange,
            })
          : child,
      )}
    </div>
  );
  const SelectItem = ({
    children,
    value,
    _onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    _onValueChange?: (v: string) => void;
  }) => (
    <div
      data-testid={`select-item-${value}`}
      role="option"
      aria-selected="false"
      onClick={() => _onValueChange?.(value)}
    >
      {children}
    </div>
  );
  const Label = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  );
  const Badge = ({ children, ...rest }: { children: React.ReactNode }) => (
    <span data-testid="tier-badge" {...rest}>
      {children}
    </span>
  );
  return { Switch, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Label, Badge };
});

// ---------------------------------------------------------------------------
// Import component under test (after all mocks are set up)
// ---------------------------------------------------------------------------

import { AdvancedModeToggle } from './AdvancedModeToggle';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdvancedModeToggle', () => {
  beforeEach(() => {
    mockSettingsState.advancedMode = false;
    mockSettingsState.advancedModelId = null;
    mockSettingsState.setAdvancedMode.mockReset();
    mockSettingsState.setAdvancedModelId.mockReset();
  });

  // -------------------------------------------------------------------------
  // 1. Toggle hidden for non-manual-selection tiers
  // -------------------------------------------------------------------------

  it('renders nothing for free tier (allowManualSelection: false)', () => {
    const { container } = render(<AdvancedModeToggle tier="free" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for hobby tier (allowManualSelection: false)', () => {
    const { container } = render(<AdvancedModeToggle tier="hobby" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for null tier (defaults to free, allowManualSelection: false)', () => {
    const { container } = render(<AdvancedModeToggle tier={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for undefined tier (defaults to free, allowManualSelection: false)', () => {
    const { container } = render(<AdvancedModeToggle tier={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 2. Toggle visible + interactive for manual-selection tiers
  // -------------------------------------------------------------------------

  it('renders the toggle for pro tier (allowManualSelection: true)', () => {
    render(<AdvancedModeToggle tier="pro" />);
    expect(screen.getByTestId('advanced-mode-section')).toBeDefined();
    expect(screen.getByTestId('advanced-mode-switch')).toBeDefined();
  });

  it('renders the toggle for max tier (allowManualSelection: true)', () => {
    render(<AdvancedModeToggle tier="max" />);
    expect(screen.getByTestId('advanced-mode-section')).toBeDefined();
    expect(screen.getByTestId('advanced-mode-switch')).toBeDefined();
  });

  it('shows the "Advanced mode" label text for pro tier', () => {
    render(<AdvancedModeToggle tier="pro" />);
    expect(screen.getByText('Advanced mode')).toBeDefined();
  });

  it('shows the Pro tier badge', () => {
    render(<AdvancedModeToggle tier="pro" />);
    expect(screen.getByTestId('tier-badge')).toBeDefined();
  });

  it('calls setAdvancedMode(true) when toggle is clicked while OFF', () => {
    mockSettingsState.advancedMode = false;
    render(<AdvancedModeToggle tier="pro" />);
    fireEvent.click(screen.getByTestId('advanced-mode-switch'));
    expect(mockSettingsState.setAdvancedMode).toHaveBeenCalledWith(true);
  });

  it('calls setAdvancedMode(false) when toggle is clicked while ON', () => {
    mockSettingsState.advancedMode = true;
    render(<AdvancedModeToggle tier="pro" />);
    fireEvent.click(screen.getByTestId('advanced-mode-switch'));
    expect(mockSettingsState.setAdvancedMode).toHaveBeenCalledWith(false);
  });

  it('calls setAdvancedModelId(null) when toggle is turned OFF', () => {
    mockSettingsState.advancedMode = true;
    render(<AdvancedModeToggle tier="pro" />);
    fireEvent.click(screen.getByTestId('advanced-mode-switch'));
    expect(mockSettingsState.setAdvancedModelId).toHaveBeenCalledWith(null);
  });

  // -------------------------------------------------------------------------
  // 3. Dropdown only renders when toggle is ON
  // -------------------------------------------------------------------------

  it('does not render model dropdown when toggle is OFF', () => {
    mockSettingsState.advancedMode = false;
    render(<AdvancedModeToggle tier="pro" />);
    expect(screen.queryByTestId('model-select')).toBeNull();
  });

  it('renders model dropdown when toggle is ON', () => {
    mockSettingsState.advancedMode = true;
    render(<AdvancedModeToggle tier="pro" />);
    expect(screen.getByTestId('model-select')).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 4. Dropdown items match tier's allowedSlots resolved through SLOT_REGISTRY
  // -------------------------------------------------------------------------

  it('renders dropdown items for pro tier allowedSlots (deduped, excluding specialty)', () => {
    mockSettingsState.advancedMode = true;
    render(<AdvancedModeToggle tier="pro" />);
    // Pro allowedSlots: ['workhorse_general', 'general_balanced_pro', 'coding_premium_pro']
    // coding_premium_pro resolves to the same fixture model as general_balanced_pro.
    expect(screen.getByTestId(`select-item-${modelFixtureIds.fast}`)).toBeDefined();
    expect(screen.getByTestId(`select-item-${modelFixtureIds.balanced}`)).toBeDefined();
  });

  it('shows model friendly name in dropdown for pro tier', () => {
    mockSettingsState.advancedMode = true;
    render(<AdvancedModeToggle tier="pro" />);
    expect(screen.getByText('Fixture Fast Model')).toBeDefined();
    expect(screen.getByText('Fixture Balanced Model')).toBeDefined();
  });

  it('renders dropdown items for max tier, excluding image_generation slot', () => {
    mockSettingsState.advancedMode = true;
    render(<AdvancedModeToggle tier="max" />);
    // Max allowedSlots include image_generation but it should be excluded from picker
    expect(screen.queryByTestId(`select-item-${modelFixtureIds.image}`)).toBeNull();
    // Other slots should be present (deduped by modelId)
    expect(screen.getByTestId(`select-item-${modelFixtureIds.fast}`)).toBeDefined();
    expect(screen.getByTestId(`select-item-${modelFixtureIds.balanced}`)).toBeDefined();
    expect(screen.getByTestId(`select-item-${modelFixtureIds.premium}`)).toBeDefined();
  });

  it('shows model friendly names for max tier', () => {
    mockSettingsState.advancedMode = true;
    render(<AdvancedModeToggle tier="max" />);
    expect(screen.getByText('Fixture Fast Model')).toBeDefined();
    expect(screen.getByText('Fixture Balanced Model')).toBeDefined();
    expect(screen.getByText('Fixture Premium Model')).toBeDefined();
  });
});
