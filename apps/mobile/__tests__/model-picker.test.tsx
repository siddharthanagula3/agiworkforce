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
  getDefaultCloudModelIdForTier,
  getModelByIdForCloudAccess,
  getModelListForCloudAccess,
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

  it('renders all registry-owned auto mode cards in Local mode', () => {
    const { getAllByText, queryByText } = renderPicker();

    for (const mode of AUTO_MODES) {
      expect(getAllByText(mode.name).length).toBeGreaterThanOrEqual(1);
    }
    expect(queryByText('Vision')).toBeNull();
  });

  it('renders boundary-neutral registry descriptions for Auto modes', () => {
    const { getAllByText } = renderPicker();

    for (const mode of AUTO_MODES) {
      expect(getAllByText(mode.description).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('offers the same registry-owned Auto modes in AGI Cloud', () => {
    const { getByLabelText } = renderPicker({ modelScope: 'cloud' });

    for (const mode of AUTO_MODES) {
      expect(getByLabelText(`${mode.name}: ${mode.description}`)).toBeTruthy();
    }
  });

  it('marks the selected auto mode as selected', () => {
    useModelStore.setState({ selectedModel: 'auto' });
    const { getByLabelText } = renderPicker();

    const autoCard = getByLabelText(
      'Auto: Automatically routes each message to the best model for the task, your plan, and cost',
    );
    expect(autoCard.props.accessibilityState.selected).toBe(true);
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

    const opusForFree = getModelByIdForCloudAccess('claude-opus-5', true, 'free');
    const opusForPro = getModelByIdForCloudAccess('claude-opus-5', true, 'pro');
    const opusForMax = getModelByIdForCloudAccess('claude-opus-5', true, 'max');
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

  it('shows and selects registry-admitted cloud models for a free-tier user', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'free' });

    const models = getModelListForCloudAccess(true, 'free').filter(
      (model) => model.surface === 'cloud_managed',
    );
    const readyModel = models.find((model) => model.availability === 'ready');
    const lockedModel = models.find((model) => model.availability === 'locked');
    expect(readyModel).toBeDefined();
    expect(lockedModel).toBeDefined();

    const { getByTestId } = renderPicker({ modelScope: 'cloud' });
    fireEvent.press(getByTestId(`model-row-${readyModel!.id}`));

    expect(useModelStore.getState().selectedModel).toBe(readyModel!.id);
    expect(useModelStore.getState().selectedProvider).toBe('cloud_managed');
  });

  it('shows an Upgrade badge with upgrade a11y strings for tier-locked rows', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'pro' });

    const opus = getModelByIdForCloudAccess('claude-opus-5', true, 'pro')!;
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
    useModelStore.setState({ selectedModel: 'claude-opus-5', selectedProvider: 'cloud_managed' });

    const opus = getModelByIdForCloudAccess('claude-opus-5', true, 'pro')!;
    const { getByLabelText } = renderPicker({ modelScope: 'cloud' });

    // No ", selected" suffix and no selected a11y state on a locked row.
    const row = getByLabelText(`${opus.name}, upgrade required, ${opus.lockReason}`);
    expect(row.props.accessibilityState.selected).toBe(false);
  });

  it('falls back to the default cloud model when a tier downgrade locks the selection', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel('claude-opus-5');
    expect(useModelStore.getState().selectedModel).toBe('claude-opus-5');

    useTierStore.setState({ tier: 'pro' });

    expect(useModelStore.getState().selectedModel).toBe(getDefaultCloudModelIdForTier('pro'));
    expect(useModelStore.getState().selectedProvider).toBe('cloud_managed');
  });

  it('keeps an accessible selection unchanged when the tier changes', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const freeReadyModel = getModelListForCloudAccess(true, 'free').find(
      (model) => model.surface === 'cloud_managed' && model.availability === 'ready',
    );
    expect(freeReadyModel).toBeDefined();
    useModelStore.getState().setModel(freeReadyModel!.id);

    useTierStore.setState({ tier: 'free' });

    expect(useModelStore.getState().selectedModel).toBe(freeReadyModel!.id);
  });

  it('does not render the reasoning effort selector for the local scope', () => {
    const { queryByLabelText } = renderPicker();
    expect(queryByLabelText('Reasoning effort High')).toBeNull();
  });

  it('sets a per-conversation effort override through one discrete slider', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    // The reasoning-effort selector only renders for a reasoning-capable model
    // (component gate: modelScope==='cloud' && selectedSupportsReasoning), so
    // select one first.
    useModelStore.getState().setModel('claude-opus-5');
    const { getByLabelText } = renderPicker({ modelScope: 'cloud', conversationId: 'conv-1' });

    const slider = getByLabelText('Reasoning effort');
    expect(slider.props.accessibilityValue).toEqual({ min: 0, max: 4, now: 1, text: 'Medium' });

    fireEvent(slider, 'valueChange', 2);

    expect(useAgentControlStore.getState().resolve('conv-1', null).effort).toBe('high');
    // Effort and model choice are independent: no selection change, no close.
    expect(useModelStore.getState().selectedModel).toBe('claude-opus-5');
    expect(mockSheetRef.current.close).not.toHaveBeenCalled();
  });

  it('writes the project-default effort when no conversation id is provided', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    // Effort selector needs a reasoning-capable model selected (see above).
    useModelStore.getState().setModel('claude-opus-5');
    const { getByLabelText } = renderPicker({ modelScope: 'cloud' });

    fireEvent(getByLabelText('Reasoning effort'), 'valueChange', 0);

    expect(useAgentControlStore.getState().byProject.__default__?.effort).toBe('low');
    expect(useAgentControlStore.getState().byConversation).toEqual({});
  });

  it('renders the full current GPT-5.6 Sol effort ladder, including none and max', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel('gpt-5.6-sol');
    const { getByLabelText } = renderPicker({ modelScope: 'cloud' });

    expect(getByLabelText('Reasoning effort').props.accessibilityValue).toEqual({
      min: 0,
      max: 5,
      now: 2,
      text: 'Medium',
    });
  });

  it('shows the exact reasoning effort control for Gemini 3.5 Flash-Lite', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel('gemini-3.5-flash-lite');
    const { getByTestId, getByText, getByLabelText } = renderPicker({ modelScope: 'cloud' });

    expect(getByTestId('model-picker-effort-selector')).toBeTruthy();
    expect(getByText('Effort')).toBeTruthy();
    expect(getByLabelText('Reasoning effort').props.accessibilityValue).toEqual({
      min: 0,
      max: 3,
      now: 2,
      text: 'Medium',
    });
  });

  it('shows no effort selector for Claude Haiku 4.5', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel('claude-haiku-4.5');
    const { queryByTestId, getByLabelText } = renderPicker({ modelScope: 'cloud' });

    expect(queryByTestId('model-picker-effort-selector')).toBeNull();
    fireEvent.press(getByLabelText('Claude 4.5 Haiku, selected'));
    expect(getByLabelText('Thinking mode for Claude 4.5 Haiku')).toBeTruthy();
  });

  it('clamps the reasoning effort to the new model default when switching to a model that lacks the previous value', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel('claude-opus-5');
    const { getByLabelText, getByTestId } = renderPicker({
      modelScope: 'cloud',
      conversationId: 'conv-1',
    });

    fireEvent(getByLabelText('Reasoning effort'), 'valueChange', 4);
    expect(useAgentControlStore.getState().resolve('conv-1', null).effort).toBe('max');

    // Gemini 3.5 Flash's supportedEfforts has no 'max' — selecting it must clamp
    // the conversation's effort to the new model's own defaultEffort instead
    // of silently keeping a value the new model doesn't support.
    fireEvent.press(getByTestId('model-row-gemini-3.6-flash'));

    expect(useAgentControlStore.getState().resolve('conv-1', null).effort).toBe('medium');
    expect(getByLabelText('Reasoning effort').props.accessibilityValue.text).toBe('Medium');
  });

  it('expands the thinking toggle when re-tapping the already-selected cloud model', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const thinkingModel = getModelByIdForCloudAccess('claude-opus-5', true, 'max')!;
    expect(thinkingModel.supportsThinking).toBe(true);
    useModelStore.getState().setModel(thinkingModel.id);

    const { getByLabelText, queryByLabelText } = renderPicker({ modelScope: 'cloud' });
    expect(queryByLabelText(`Thinking mode for ${thinkingModel.name}`)).toBeNull();

    fireEvent.press(getByLabelText(`${thinkingModel.name}, selected`));

    expect(getByLabelText(`Thinking mode for ${thinkingModel.name}`)).toBeTruthy();
    expect(useModelStore.getState().selectedModel).toBe(thinkingModel.id);
    expect(mockSheetRef.current.close).not.toHaveBeenCalled();
  });

  it('shows Fable 5 reasoning as always on and never renders an off switch', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel('claude-fable-5');

    const { getByLabelText, getByText, queryByLabelText } = renderPicker({
      modelScope: 'cloud',
    });
    fireEvent.press(getByLabelText('Claude Fable 5, selected'));

    expect(getByText('Reasoning always on')).toBeTruthy();
    expect(queryByLabelText('Thinking mode for Claude Fable 5')).toBeNull();
    expect(useModelStore.getState().thinkingEnabledPerModel['claude-fable-5']).toBe(true);
  });

  it('renders the current OpenAI and Anthropic roster without stale coming-soon copy', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const { getByTestId, queryByText } = renderPicker({ modelScope: 'cloud' });

    for (const id of [
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'claude-fable-5',
      'claude-opus-5',
      'claude-sonnet-5',
      'claude-haiku-4.5',
    ]) {
      expect(getByTestId(`model-row-${id}`)).toBeTruthy();
    }
    expect(queryByText('Coming soon')).toBeNull();
  });

  it('selects Auto when tapped in Local mode', () => {
    const { getByLabelText } = renderPicker();

    fireEvent.press(
      getByLabelText(
        'Auto: Automatically routes each message to the best model for the task, your plan, and cost',
      ),
    );

    expect(useModelStore.getState().selectedModel).toBe('auto');
  });

  it('does not expand thinking for auto modes', () => {
    useModelStore.setState({ selectedModel: 'auto' });
    const { getByLabelText, queryByText } = renderPicker();

    fireEvent.press(
      getByLabelText(
        'Auto: Automatically routes each message to the best model for the task, your plan, and cost',
      ),
    );

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
