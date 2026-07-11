/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for ModelPickerSheet component.
 *
 * Covers:
 *  - Local auto modes
 *  - On-device model rows from @agiworkforce/local-llm
 *  - Locked Cloud Managed rows
 *  - Local selection behavior
 *  - Fail-closed cloud selection behavior
 *  - Subscription-tier gating (free economy allowance, upgrade locks, downgrade revalidation)
 *  - Reasoning-effort selector (cloud scope)
 *  - Thinking-toggle expansion on reselect
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks - avoid React.createElement(RN.*) inside factories to prevent
// NativeWind's CSSInterop Babel transform from injecting out-of-scope vars.
// ---------------------------------------------------------------------------

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function') {
      store.persist.rehydrate();
    }
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    getNumber: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
  },
}));

jest.mock('../src/features/model-picker/service', () => {
  const actual = jest.requireActual(
    '../src/features/model-picker/service',
  ) as typeof import('../src/features/model-picker/service');
  return {
    ...actual,
    fetchModelCatalog: jest.fn(() => new Promise(() => {})),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium' },
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AfterFirstUnlockThisDeviceOnly',
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const mockBottomSheet = jest.fn().mockImplementation(({ children }) => children);
  return {
    __esModule: true,
    default: mockBottomSheet,
    BottomSheetBackdrop: jest.fn().mockReturnValue(null),
    BottomSheetScrollView: jest.fn().mockImplementation(({ children }) => children),
    BottomSheetTextInput: jest.fn().mockImplementation((props) => {
      const { TextInput } = require('react-native');
      return <TextInput {...props} />;
    }),
  };
});

jest.mock('lucide-react-native', () => ({
  Search: jest.fn().mockReturnValue(null),
  X: jest.fn().mockReturnValue(null),
  Check: jest.fn().mockReturnValue(null),
  Star: jest.fn().mockReturnValue(null),
  Brain: jest.fn().mockReturnValue(null),
  Cpu: jest.fn().mockReturnValue(null),
  Download: jest.fn().mockReturnValue(null),
  Lock: jest.fn().mockReturnValue(null),
  Cloud: jest.fn().mockReturnValue(null),
  ArrowUpCircle: jest.fn().mockReturnValue(null),
  Shuffle: jest.fn().mockReturnValue(null),
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: jest.fn().mockImplementation(({ children }) => children),
    Text: jest.fn().mockImplementation(({ children }) => children),
  },
  FadeIn: { duration: jest.fn().mockReturnValue({}) },
  FadeOut: { duration: jest.fn().mockReturnValue({}) },
  useReducedMotion: jest.fn().mockReturnValue(false),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ---------------------------------------------------------------------------
// Import modules under test AFTER mocks
// ---------------------------------------------------------------------------

import { ModelPickerSheet } from '../src/features/model-picker/components/ModelPickerSheet';
import { useModelInstallStore } from '../src/features/model-picker/installStore';
import { useModelStore } from '../src/features/model-picker/store';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useTierStore } from '../src/features/billing/store';
import { useAgentControlStore } from '../stores/agentControlStore';
import {
  AUTO_MODES,
  CLOUD_LOCK_REASON,
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
  LOCKED_CLOUD_MODELS,
  MODEL_LIST,
  getModelByIdForCloudAccess,
} from '../src/features/model-picker/service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetModelStore() {
  const hydrateInstalledModels = jest.fn<Promise<void>, []>(async () => undefined);
  useWaitlistStore.setState({
    joined: false,
    email: undefined,
    country: undefined,
    rank: undefined,
    joinedAt: undefined,
    cloudUnlocked: false,
    inviteId: undefined,
    inviteCode: undefined,
    cloudUnlockedAt: undefined,
  });
  useModelStore.setState({
    selectedModel: DEFAULT_LOCAL_MODEL_ID,
    selectedProvider: 'local',
    favorites: [],
    recentModels: [],
    thinkingModeEnabled: false,
    thinkingEnabledPerModel: {},
  });
  useModelInstallStore.setState({
    installedModelIds: [DEFAULT_LOCAL_MODEL_ID, 'llama-3.2-1b-instruct-spinquant'],
    readySystemModelIds: [],
    jobs: {},
    hydrateInstalledModels,
  });
}

const mockSheetRef = { current: { close: jest.fn(), snapToIndex: jest.fn() } };
function renderPicker(overrides?: {
  onSelect?: (id: string) => void;
  onOpenCloudAccess?: (defaultTab?: 'invite' | 'waitlist') => void;
  modelScope?: 'local' | 'cloud' | 'all';
  conversationId?: string;
}) {
  return render(
    <ModelPickerSheet
      sheetRef={mockSheetRef as never}
      onSelect={overrides?.onSelect}
      onOpenCloudAccess={overrides?.onOpenCloudAccess}
      modelScope={overrides?.modelScope}
      conversationId={overrides?.conversationId}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModelPickerSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetModelStore();
    useTierStore.setState({ tier: 'free' });
    useAgentControlStore.setState({ byConversation: {}, byProject: {} });
  });

  it('renders all local auto mode cards', () => {
    const { getAllByText, queryByText } = renderPicker();

    for (const mode of AUTO_MODES.filter((mode) => mode.id !== 'auto-premium')) {
      expect(getAllByText(mode.name).length).toBeGreaterThanOrEqual(1);
    }
    expect(queryByText('Vision')).toBeNull();
  });

  it('renders only production-ready local auto mode descriptions', () => {
    const { getAllByText, queryByText } = renderPicker();

    expect(getAllByText('Best local model for this device').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Small local model when battery matters').length).toBeGreaterThanOrEqual(1);
    expect(queryByText('On-device vision when available')).toBeNull();
  });

  it('marks the selected auto mode as selected', () => {
    useModelStore.setState({ selectedModel: 'auto-economy' });
    const { getByLabelText } = renderPicker();

    const economyCard = getByLabelText('Lite: Small local model when battery matters');
    expect(economyCard.props.accessibilityState.selected).toBe(true);
  });

  it('renders on-device model names from the local catalog', () => {
    const { getByText, queryByText } = renderPicker();

    expect(getByText('AGI Standard')).toBeTruthy();
    expect(getByText('AGI Lite')).toBeTruthy();
    // Apple Intelligence and Gemini Nano are hidden in v1 (stub native impl).
    // They are preserved in the catalog (shipsInV1:true) but filtered from the
    // picker in model-picker/service.ts until the native impl ships.
    expect(queryByText('Apple Intelligence')).toBeNull();
  });

  it('keeps the default picker scoped to local models', () => {
    const { getByText, queryByText, queryByLabelText } = renderPicker();

    expect(getByText('On device')).toBeTruthy();
    expect(queryByText('Cloud')).toBeNull();
    expect(queryByLabelText(/sign in required/i)).toBeNull();
  });

  it('renders local and locked cloud hierarchy when all models are requested', () => {
    const { getByText, getAllByText } = renderPicker({ modelScope: 'all' });

    expect(getByText('On device')).toBeTruthy();
    // Cloud models are grouped by PROVIDER (OpenAI, Anthropic, …), not under a
    // single "Cloud" header. Assert the first locked model's provider section
    // renders — derived from the catalog so it can't drift (see repeated-bug
    // class: never assert hard-coded catalog strings).
    expect(getByText(LOCKED_CLOUD_MODELS[0]!.providerLabel)).toBeTruthy();
    expect(getAllByText('Sign in').length).toBeGreaterThan(0);
  });

  it('marks the selected local model row as selected via accessibilityState', () => {
    useModelStore.setState({ selectedModel: DEFAULT_LOCAL_MODEL_ID });
    const { getByLabelText } = renderPicker();

    const standardRow = getByLabelText('AGI Standard, selected, ready');
    expect(standardRow.props.accessibilityState.selected).toBe(true);
  });

  it('does not mark a local model as selected until it is ready', () => {
    useModelStore.setState({ selectedModel: DEFAULT_LOCAL_MODEL_ID });
    useModelInstallStore.setState({ installedModelIds: [], readySystemModelIds: [], jobs: {} });
    const { getByLabelText, queryByLabelText } = renderPicker();

    expect(queryByLabelText('AGI Standard, selected, ready')).toBeNull();
    const standardRow = getByLabelText('AGI Standard, not downloaded');
    expect(standardRow.props.accessibilityState.selected).toBe(false);
  });

  it('marks cloud rows as invite-gated but tappable', () => {
    const lockedModel = LOCKED_CLOUD_MODELS[0]!;
    const { getAllByLabelText } = renderPicker({ modelScope: 'cloud' });

    // Preset display names (e.g. "Fast") repeat across providers, so scope to
    // the first matching locked row — all locked rows share the same gating.
    const lockedRow = getAllByLabelText(
      `${lockedModel.name}, sign in required, ${CLOUD_LOCK_REASON}`,
    )[0]!;
    expect(lockedRow.props.accessibilityState.disabled).toBe(false);
  });

  it('selects a local model when tapped', () => {
    const { getByLabelText } = renderPicker();

    fireEvent.press(getByLabelText(/AGI Lite/));

    expect(useModelStore.getState().selectedModel).toBe('llama-3.2-1b-instruct-spinquant');
  });

  it('does not select an unprepared downloaded model until preparation finishes', async () => {
    useModelInstallStore.setState({
      installedModelIds: [DEFAULT_LOCAL_MODEL_ID],
      readySystemModelIds: [],
      jobs: {},
    });
    const { getByLabelText } = renderPicker();

    fireEvent.press(getByLabelText(/AGI Lite/));

    await waitFor(() => {
      expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
    });
  });

  it('calls onSelect callback instead of store when provided', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = renderPicker({ onSelect });

    fireEvent.press(getByLabelText(/AGI Lite/));

    expect(onSelect).toHaveBeenCalledWith('llama-3.2-1b-instruct-spinquant');
    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
  });

  it('closes the sheet after selecting a local model', () => {
    const { getByLabelText } = renderPicker();

    fireEvent.press(getByLabelText(/AGI Lite/));

    expect(mockSheetRef.current.close).toHaveBeenCalled();
  });

  it('closes the sheet when tapping the already selected local model', () => {
    useModelStore.setState({ selectedModel: DEFAULT_LOCAL_MODEL_ID });
    const { getByLabelText } = renderPicker();

    fireEvent.press(getByLabelText('AGI Standard, selected, ready'));

    expect(mockSheetRef.current.close).toHaveBeenCalled();
  });

  it('does not select locked cloud rows and routes to sign-in (public alpha, no invite/waitlist gate)', async () => {
    const lockedModel = LOCKED_CLOUD_MODELS[0]!;
    const { getAllByLabelText } = renderPicker({ modelScope: 'cloud' });

    fireEvent.press(
      getAllByLabelText(`${lockedModel.name}, sign in required, ${CLOUD_LOCK_REASON}`)[0]!,
    );

    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
    expect(mockSheetRef.current.close).toHaveBeenCalled();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(auth)/login'));
  });

  it('delegates locked cloud rows to the parent invite surface when provided', async () => {
    const lockedModel = LOCKED_CLOUD_MODELS[0]!;
    const onOpenCloudAccess = jest.fn();
    const { getAllByLabelText } = renderPicker({
      onOpenCloudAccess,
      modelScope: 'cloud',
    });

    fireEvent.press(
      getAllByLabelText(`${lockedModel.name}, sign in required, ${CLOUD_LOCK_REASON}`)[0]!,
    );

    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
    expect(mockSheetRef.current.close).toHaveBeenCalled();
    await waitFor(() => expect(onOpenCloudAccess).toHaveBeenCalledWith('invite'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('selects cloud rows after invite access', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    // This model may be a Max-only flagship model — set the tier so this test's
    // actual intent (invite/sign-in unlock, not subscription-tier gating) holds.
    useTierStore.setState({ tier: 'max' });
    const cloudModel = LOCKED_CLOUD_MODELS[0]!;
    // At Max tier + unlocked, the row renders the REAL model name (not the
    // free-tier preset the LOCKED snapshot carries), so resolve the rendered
    // name to find the row.
    const renderedName = getModelByIdForCloudAccess(cloudModel.id, true, 'max')!.name;
    const { getAllByLabelText, getByText } = renderPicker({ modelScope: 'cloud' });

    expect(getByText('AGI Cloud models are managed separately from Local Mode.')).toBeTruthy();

    fireEvent.press(getAllByLabelText(renderedName)[0]!);

    expect(useModelStore.getState().selectedModel).toBe(cloudModel.id);
    expect(useModelStore.getState().selectedProvider).toBe('cloud_managed');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows an upgrade lock (not sign-in) for a flagship model on a Pro subscription', () => {
    // Regression: cloudUnlocked-only gating meant a Pro user could select a
    // Max-only model (Opus-class) with no upgrade indicator at all — the server
    // would then reject it. Being cloud-unlocked and tier-locked must show
    // "Upgrade required" and route to billing, not the sign-in flow.
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'pro' });

    const opusForFree = getModelByIdForCloudAccess('claude-opus-4.8', true, 'free');
    const opusForPro = getModelByIdForCloudAccess('claude-opus-4.8', true, 'pro');
    const opusForMax = getModelByIdForCloudAccess('claude-opus-4.8', true, 'max');
    expect(opusForFree?.availability).toBe('locked');
    expect(opusForPro?.availability).toBe('locked');
    expect(opusForPro?.lockReason).not.toBe(CLOUD_LOCK_REASON);
    expect(opusForPro?.detailLabel).toBe('Upgrade required');
    expect(opusForMax?.availability).toBe('ready');

    const { getByText } = renderPicker({ modelScope: 'cloud' });
    fireEvent.press(getByText(opusForPro!.name));

    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
    expect(mockSheetRef.current.close).toHaveBeenCalled();
  });

  it('shows and selects the curated free preset (nano) cloud models for a free-tier user', () => {
    // Product decision (2026-07-11): the free-tier picker is NANO-ONLY — it
    // shows the curated FREE_TIER_PRESET_MODEL_IDS (gpt-5-nano, gpt-4.1-nano,
    // gemini-3.1-flash-lite) as selectable, flagship models as locked upsells,
    // and curates non-preset economy models (e.g. the default gpt-5.4-mini) OUT
    // of the list even though the server still accepts them (see cross-surface
    // follow-up in known-flaws MOBILE-JEST-REGRESSION).
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'free' });

    // A curated free preset (nano) is ready + selectable.
    expect(getModelByIdForCloudAccess('gpt-5-nano', true, 'free')?.availability).toBe('ready');
    // Flagship models stay tier-locked for free users.
    expect(getModelByIdForCloudAccess('claude-opus-4.8', true, 'free')?.availability).toBe(
      'locked',
    );

    const { getByTestId, queryByTestId } = renderPicker({ modelScope: 'cloud' });
    // Non-preset economy model (the default) is curated out of the free picker.
    expect(queryByTestId('model-row-gpt-5.4-mini')).toBeNull();
    fireEvent.press(getByTestId('model-row-gpt-5-nano'));

    expect(useModelStore.getState().selectedModel).toBe('gpt-5-nano');
    expect(useModelStore.getState().selectedProvider).toBe('cloud_managed');
  });

  it('shows an Upgrade badge with upgrade a11y strings for tier-locked rows', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'pro' });

    const opus = getModelByIdForCloudAccess('claude-opus-4.8', true, 'pro')!;
    const { getAllByText, getByLabelText, queryByText } = renderPicker({ modelScope: 'cloud' });

    const row = getByLabelText(`${opus.name}, upgrade required, ${opus.lockReason}`);
    expect(row.props.accessibilityHint).toBe('Opens plan upgrade options');
    expect(getAllByText('Upgrade').length).toBeGreaterThan(0);
    // A signed-in tier lock must not masquerade as a sign-in lock.
    expect(queryByText('Sign in')).toBeNull();
  });

  it('suppresses the selected checkmark when the selected cloud model is tier-locked', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'pro' });
    useModelStore.setState({ selectedModel: 'claude-opus-4.8', selectedProvider: 'cloud_managed' });

    const opus = getModelByIdForCloudAccess('claude-opus-4.8', true, 'pro')!;
    const { getByLabelText } = renderPicker({ modelScope: 'cloud' });

    // No ", selected" suffix and no selected a11y state on a locked row.
    const row = getByLabelText(`${opus.name}, upgrade required, ${opus.lockReason}`);
    expect(row.props.accessibilityState.selected).toBe(false);
  });

  it('falls back to the default cloud model when a tier downgrade locks the selection', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel('claude-opus-4.8');
    expect(useModelStore.getState().selectedModel).toBe('claude-opus-4.8');

    useTierStore.setState({ tier: 'pro' });

    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_CLOUD_MODEL_ID);
    expect(useModelStore.getState().selectedProvider).toBe('cloud_managed');
  });

  it('keeps an accessible selection unchanged when the tier changes', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel('gpt-5.4-mini');

    useTierStore.setState({ tier: 'free' });

    // Economy-list models survive even a downgrade to free.
    expect(useModelStore.getState().selectedModel).toBe('gpt-5.4-mini');
  });

  it('does not render the reasoning effort selector for the local scope', () => {
    const { queryByLabelText } = renderPicker();
    expect(queryByLabelText('Reasoning effort High')).toBeNull();
  });

  it('sets a per-conversation effort override without changing the model or closing the sheet', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    // The reasoning-effort selector only renders for a reasoning-capable model
    // (component gate: modelScope==='cloud' && selectedSupportsReasoning), so
    // select one first.
    useModelStore.getState().setModel('claude-opus-4.8');
    const { getByLabelText } = renderPicker({ modelScope: 'cloud', conversationId: 'conv-1' });

    expect(getByLabelText('Reasoning effort Medium').props.accessibilityState.selected).toBe(true);

    fireEvent.press(getByLabelText('Reasoning effort High'));

    expect(useAgentControlStore.getState().resolve('conv-1', null).effort).toBe('high');
    expect(getByLabelText('Reasoning effort High').props.accessibilityState.selected).toBe(true);
    // Effort and model choice are independent: no selection change, no close.
    expect(useModelStore.getState().selectedModel).toBe('claude-opus-4.8');
    expect(mockSheetRef.current.close).not.toHaveBeenCalled();
  });

  it('writes the project-default effort when no conversation id is provided', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    // Effort selector needs a reasoning-capable model selected (see above).
    useModelStore.getState().setModel('claude-opus-4.8');
    const { getByLabelText } = renderPicker({ modelScope: 'cloud' });

    fireEvent.press(getByLabelText('Reasoning effort Low'));

    expect(useAgentControlStore.getState().byProject.__default__?.effort).toBe('low');
    expect(useAgentControlStore.getState().byConversation).toEqual({});
  });

  it('expands the thinking toggle when re-tapping the already-selected cloud model', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const thinkingModel = getModelByIdForCloudAccess('claude-opus-4.8', true, 'max')!;
    expect(thinkingModel.supportsThinking).toBe(true);
    useModelStore.getState().setModel(thinkingModel.id);

    const { getByLabelText, queryByLabelText } = renderPicker({ modelScope: 'cloud' });
    expect(queryByLabelText(`Thinking mode for ${thinkingModel.name}`)).toBeNull();

    fireEvent.press(getByLabelText(`${thinkingModel.name}, selected`));

    expect(getByLabelText(`Thinking mode for ${thinkingModel.name}`)).toBeTruthy();
    expect(useModelStore.getState().selectedModel).toBe(thinkingModel.id);
    expect(mockSheetRef.current.close).not.toHaveBeenCalled();
  });

  it('selects a local auto mode when tapped', () => {
    const { getByLabelText } = renderPicker();

    fireEvent.press(getByLabelText('Lite: Small local model when battery matters'));

    expect(useModelStore.getState().selectedModel).toBe('auto-economy');
  });

  it('does not expand thinking for auto modes', () => {
    useModelStore.setState({ selectedModel: 'auto-balanced' });
    const { getByLabelText, queryByText } = renderPicker();

    fireEvent.press(getByLabelText('Best: Best local model for this device'));

    expect(queryByText('With thinking')).toBeNull();
  });

  it('does not render thinking controls for local v1 models', () => {
    const { getByLabelText, queryByLabelText } = renderPicker();

    fireEvent.press(getByLabelText('AGI Standard, selected, ready'));

    expect(queryByLabelText('Thinking mode for AGI Standard')).toBeNull();
  });

  it('renders the Models heading', () => {
    const { getByText } = renderPicker();
    expect(getByText('Models')).toBeTruthy();
  });

  it('renders a close button', () => {
    const { getByLabelText } = renderPicker();
    expect(getByLabelText('Close model picker')).toBeTruthy();
  });

  it('renders a search input', () => {
    const { getByLabelText } = renderPicker();
    expect(getByLabelText('Search models')).toBeTruthy();
  });

  it('provides a non-actionable hint for unavailable local models', () => {
    const unavailableModel = MODEL_LIST.find((model) => model.surface === 'local');
    expect(unavailableModel).toBeDefined();

    if (!unavailableModel) {
      throw new Error(
        'Expected at least one local model in MODEL_LIST for accessibility hint test.',
      );
    }

    useModelInstallStore.setState((state) => ({
      ...state,
      jobs: {
        ...state.jobs,
        [unavailableModel.id]: {
          status: 'unavailable',
          progress: 0,
          error: 'This model package is not available on this device yet.',
        },
      },
    }));

    const { getByLabelText } = renderPicker();

    const unavailableRow = getByLabelText(new RegExp(`${unavailableModel.name}, .*unavailable`));
    expect(unavailableRow.props.accessibilityState.disabled).toBe(true);
    expect(unavailableRow.props.accessibilityHint).toBe(
      'This model package is not available on this device yet.',
    );
    expect(unavailableRow.props.accessibilityHint).not.toContain('Tap to select');
  });
});
