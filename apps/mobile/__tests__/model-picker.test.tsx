/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

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
  DEFAULT_AUTO_MODE_ID,
  LOCKED_CLOUD_MODELS,
  MODEL_LIST,
  getDefaultCloudModelIdForTier,
  getModelByIdForCloudAccess,
  getModelListForCloudAccess,
} from '../src/features/model-picker/service';
import {
  getMinimumRequiredTier,
  getModelReasoning,
  type ModelReasoning,
} from '@agiworkforce/types';
import { requireLocalModel, requireMobileCloudModel } from '../test-utils/modelFixtures';

const LITE_MODEL_ID = requireLocalModel(
  (model) => model.role === 'lite-mode',
  'lite-mode model',
).id;
const LITE_MODEL = MODEL_LIST.find((model) => model.id === LITE_MODEL_ID);
if (!LITE_MODEL) throw new Error('Mobile picker does not expose the catalog lite-mode model');

const MAX_ONLY_MODEL = requireMobileCloudModel(
  (model) =>
    getMinimumRequiredTier(model.id) === 'max' &&
    getModelReasoning(model.id).control === 'effort_levels',
  'Max-only effort model',
);
const EFFORT_MODEL = requireMobileCloudModel((model) => {
  const reasoning = getModelReasoning(model.id);
  return (
    reasoning.control === 'effort_levels' &&
    reasoning.canDisableThinking !== false &&
    reasoning.supportedEfforts?.length === 5 &&
    reasoning.supportedEfforts.includes('low') &&
    reasoning.supportedEfforts.includes('medium') &&
    reasoning.supportedEfforts.includes('high') &&
    reasoning.supportedEfforts.includes('max')
  );
}, 'five-step effort model');
const EFFORT_MODEL_REASONING = getModelReasoning(EFFORT_MODEL.id);
const FULL_LADDER_MODEL = requireMobileCloudModel((model) => {
  const efforts = getModelReasoning(model.id).supportedEfforts ?? [];
  return efforts.includes('none') && efforts.includes('max');
}, 'effort model with none and max');
const EXACT_EFFORT_MODEL = requireMobileCloudModel((model) => {
  const reasoning = getModelReasoning(model.id);
  const efforts = reasoning.supportedEfforts ?? [];
  return (
    reasoning.control === 'effort_levels' &&
    efforts.length === 4 &&
    efforts.includes('minimal') &&
    efforts.includes('medium')
  );
}, 'four-step exact effort model');
const THINKING_TOGGLE_MODEL = requireMobileCloudModel(
  (model) => getModelReasoning(model.id).control === 'thinking_toggle',
  'thinking-toggle model',
);
const CLAMP_TARGET_MODEL = requireMobileCloudModel((model) => {
  const reasoning = getModelReasoning(model.id);
  const efforts = reasoning.supportedEfforts ?? [];
  return (
    reasoning.control === 'effort_levels' &&
    !efforts.includes('max') &&
    reasoning.defaultEffort === 'medium'
  );
}, 'effort model without max and with a medium default');
const MANDATORY_REASONING_MODEL = requireMobileCloudModel((model) => {
  const reasoning = getModelReasoning(model.id);
  return reasoning.control === 'effort_levels' && reasoning.canDisableThinking === false;
}, 'model with mandatory reasoning');

function sortedEfforts(reasoning: ModelReasoning): readonly string[] {
  const order = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  return [...(reasoning.supportedEfforts ?? [])].sort(
    (left, right) => order.indexOf(left) - order.indexOf(right),
  );
}

function effortLabel(effort: string): string {
  if (effort === 'xhigh') return 'xHigh';
  return `${effort.charAt(0).toUpperCase()}${effort.slice(1)}`;
}

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
    installedModelIds: [DEFAULT_LOCAL_MODEL_ID, LITE_MODEL_ID],
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
    useModelStore.setState({ selectedModel: DEFAULT_AUTO_MODE_ID });
    const { getByLabelText } = renderPicker();

    const autoCard = getByLabelText(
      'Auto: Automatically routes each message to the best model for the task, your plan, and cost',
    );
    expect(autoCard.props.accessibilityState.selected).toBe(true);
  });

  it('renders on-device model names from the local catalog', () => {
    const { getByText } = renderPicker();

    expect(getByText('AGI Standard')).toBeTruthy();
    expect(getByText('AGI Lite')).toBeTruthy();
    expect(getByText('Apple Intelligence')).toBeTruthy();
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

    const lockedRow = getAllByLabelText(
      `${lockedModel.name}, sign in required, ${CLOUD_LOCK_REASON}`,
    )[0]!;
    expect(lockedRow.props.accessibilityState.disabled).toBe(false);
  });

  it('selects a local model when tapped', () => {
    const { getByLabelText } = renderPicker();

    fireEvent.press(getByLabelText(/AGI Lite/));

    expect(useModelStore.getState().selectedModel).toBe(LITE_MODEL_ID);
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

    expect(onSelect).toHaveBeenCalledWith(LITE_MODEL_ID);
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
    useTierStore.setState({ tier: 'max' });
    const cloudModel = LOCKED_CLOUD_MODELS[0]!;
    const renderedName = getModelByIdForCloudAccess(cloudModel.id, true, 'max')!.name;
    const { getAllByLabelText, getByText } = renderPicker({ modelScope: 'cloud' });

    expect(getByText('AGI Cloud models are managed separately from Local Mode.')).toBeTruthy();

    fireEvent.press(getAllByLabelText(renderedName)[0]!);

    expect(useModelStore.getState().selectedModel).toBe(cloudModel.id);
    expect(useModelStore.getState().selectedProvider).toBe('cloud_managed');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows an upgrade lock (not sign-in) for a Max-only model on a Pro subscription', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'pro' });

    const maxOnlyForFree = getModelByIdForCloudAccess(MAX_ONLY_MODEL.id, true, 'free');
    const maxOnlyForPro = getModelByIdForCloudAccess(MAX_ONLY_MODEL.id, true, 'pro');
    const maxOnlyForMax = getModelByIdForCloudAccess(MAX_ONLY_MODEL.id, true, 'max');
    expect(maxOnlyForFree?.availability).toBe('locked');
    expect(maxOnlyForPro?.availability).toBe('locked');
    expect(maxOnlyForPro?.lockReason).not.toBe(CLOUD_LOCK_REASON);
    expect(maxOnlyForPro?.detailLabel).toBe('Upgrade required');
    expect(maxOnlyForMax?.availability).toBe('ready');

    const { getByText } = renderPicker({ modelScope: 'cloud' });
    fireEvent.press(getByText(maxOnlyForPro!.name));

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

    const maxOnlyModel = getModelByIdForCloudAccess(MAX_ONLY_MODEL.id, true, 'pro')!;
    const { getAllByText, getByLabelText, queryByText } = renderPicker({ modelScope: 'cloud' });

    const row = getByLabelText(
      `${maxOnlyModel.name}, upgrade required, ${maxOnlyModel.lockReason}`,
    );
    expect(row.props.accessibilityHint).toBe('Opens plan upgrade options');
    expect(getAllByText('Upgrade').length).toBeGreaterThan(0);
    expect(queryByText('Sign in')).toBeNull();
  });

  it('suppresses the selected checkmark when the selected cloud model is tier-locked', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'pro' });
    useModelStore.setState({
      selectedModel: MAX_ONLY_MODEL.id,
      selectedProvider: 'cloud_managed',
    });

    const maxOnlyModel = getModelByIdForCloudAccess(MAX_ONLY_MODEL.id, true, 'pro')!;
    const { getByLabelText } = renderPicker({ modelScope: 'cloud' });

    const row = getByLabelText(
      `${maxOnlyModel.name}, upgrade required, ${maxOnlyModel.lockReason}`,
    );
    expect(row.props.accessibilityState.selected).toBe(false);
  });

  it('falls back to the default cloud model when a tier downgrade locks the selection', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel(MAX_ONLY_MODEL.id);
    expect(useModelStore.getState().selectedModel).toBe(MAX_ONLY_MODEL.id);

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

  it('sets a per-conversation effort override by tapping a labelled tier', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel(EFFORT_MODEL.id);
    const { getByLabelText } = renderPicker({ modelScope: 'cloud', conversationId: 'conv-1' });

    const selectedEffort = 'medium';
    const nextEffort = 'high';
    expect(
      getByLabelText(`Reasoning effort ${effortLabel(selectedEffort)}`).props.accessibilityState
        .selected,
    ).toBe(true);
    const nextTier = getByLabelText(`Reasoning effort ${effortLabel(nextEffort)}`);
    expect(nextTier.props.accessibilityState.selected).toBe(false);

    fireEvent.press(nextTier);

    expect(useAgentControlStore.getState().resolve('conv-1', null).effort).toBe(nextEffort);
    expect(
      getByLabelText(`Reasoning effort ${effortLabel(nextEffort)}`).props.accessibilityState
        .selected,
    ).toBe(true);
    expect(
      getByLabelText(`Reasoning effort ${effortLabel(selectedEffort)}`).props.accessibilityState
        .selected,
    ).toBe(false);
    expect(useModelStore.getState().selectedModel).toBe(EFFORT_MODEL.id);
    expect(mockSheetRef.current.close).not.toHaveBeenCalled();
  });

  it('writes the project-default effort when no conversation id is provided', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel(EFFORT_MODEL.id);
    const { getByLabelText } = renderPicker({ modelScope: 'cloud' });

    const lowestEffort = sortedEfforts(EFFORT_MODEL_REASONING)[0];
    fireEvent.press(getByLabelText(`Reasoning effort ${effortLabel(lowestEffort)}`));

    expect(useAgentControlStore.getState().byProject.__default__?.effort).toBe(lowestEffort);
    expect(useAgentControlStore.getState().byConversation).toEqual({});
  });

  it('renders the full catalog effort ladder, including none and max', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel(FULL_LADDER_MODEL.id);
    const { getByLabelText, queryByLabelText } = renderPicker({ modelScope: 'cloud' });

    const efforts = sortedEfforts(getModelReasoning(FULL_LADDER_MODEL.id));
    expect(efforts.length).toBeGreaterThan(1);
    for (const effort of efforts) {
      const tier = getByLabelText(`Reasoning effort ${effortLabel(effort)}`);
      expect(tier.props.accessibilityRole).toBe('button');
      expect(tier.props.accessibilityState.selected).toBe(effort === 'medium');
    }
    const unsupported = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].filter(
      (effort) => !efforts.includes(effort),
    );
    for (const effort of unsupported) {
      expect(queryByLabelText(`Reasoning effort ${effortLabel(effort)}`)).toBeNull();
    }
  });

  it('explains the trade-off next to every effort tier of a four-step model', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel(EXACT_EFFORT_MODEL.id);
    const { getByTestId, getByText, getByLabelText } = renderPicker({ modelScope: 'cloud' });

    const efforts = sortedEfforts(getModelReasoning(EXACT_EFFORT_MODEL.id));
    expect(getByTestId('model-picker-effort-selector')).toBeTruthy();
    expect(getByText('Effort')).toBeTruthy();
    for (const effort of efforts) {
      const label = effortLabel(effort);
      const tier = getByLabelText(`Reasoning effort ${label}`);
      const tradeoff = tier.props.accessibilityHint;
      expect(typeof tradeoff).toBe('string');
      expect(tradeoff.length).toBeGreaterThan(0);
      expect(getByText(label)).toBeTruthy();
      expect(getByText(tradeoff)).toBeTruthy();
    }
  });

  it('shows a thinking toggle and no effort selector for a thinking_toggle model', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel(THINKING_TOGGLE_MODEL.id);
    const { queryByTestId, getByLabelText } = renderPicker({ modelScope: 'cloud' });

    expect(queryByTestId('model-picker-effort-selector')).toBeNull();
    fireEvent.press(getByLabelText(`${THINKING_TOGGLE_MODEL.name}, selected`));
    expect(getByLabelText(`Thinking mode for ${THINKING_TOGGLE_MODEL.name}`)).toBeTruthy();
  });

  it('clamps the reasoning effort to the new model default when switching to a model that lacks the previous value', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel(EFFORT_MODEL.id);
    const { getByLabelText, getByTestId } = renderPicker({
      modelScope: 'cloud',
      conversationId: 'conv-1',
    });

    fireEvent.press(getByLabelText(`Reasoning effort ${effortLabel('max')}`));
    expect(useAgentControlStore.getState().resolve('conv-1', null).effort).toBe('max');

    fireEvent.press(getByTestId(`model-row-${CLAMP_TARGET_MODEL.id}`));

    const targetDefault = getModelReasoning(CLAMP_TARGET_MODEL.id).defaultEffort!;
    expect(useAgentControlStore.getState().resolve('conv-1', null).effort).toBe(targetDefault);
    expect(
      getByLabelText(`Reasoning effort ${effortLabel(targetDefault)}`).props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it('expands the thinking toggle when re-tapping the already-selected cloud model', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const thinkingModel = getModelByIdForCloudAccess(EFFORT_MODEL.id, true, 'max')!;
    expect(thinkingModel.supportsThinking).toBe(true);
    useModelStore.getState().setModel(thinkingModel.id);

    const { getByLabelText, queryByLabelText } = renderPicker({ modelScope: 'cloud' });
    expect(queryByLabelText(`Thinking mode for ${thinkingModel.name}`)).toBeNull();

    fireEvent.press(getByLabelText(`${thinkingModel.name}, selected`));

    expect(getByLabelText(`Thinking mode for ${thinkingModel.name}`)).toBeTruthy();
    expect(useModelStore.getState().selectedModel).toBe(thinkingModel.id);
    expect(mockSheetRef.current.close).not.toHaveBeenCalled();
  });

  it('shows mandatory reasoning as always on and never renders an off switch', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel(MANDATORY_REASONING_MODEL.id);

    const { getByLabelText, getByText, queryByLabelText } = renderPicker({
      modelScope: 'cloud',
    });
    fireEvent.press(getByLabelText(`${MANDATORY_REASONING_MODEL.name}, selected`));

    expect(getByText('Reasoning always on')).toBeTruthy();
    expect(queryByLabelText(`Thinking mode for ${MANDATORY_REASONING_MODEL.name}`)).toBeNull();
    expect(useModelStore.getState().thinkingEnabledPerModel[MANDATORY_REASONING_MODEL.id]).toBe(
      true,
    );
  });

  it('renders the catalog OpenAI and Anthropic roster without stale coming-soon copy', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const { getByTestId, queryByText } = renderPicker({ modelScope: 'cloud' });

    const providerModels = getModelListForCloudAccess(true, 'max').filter(
      (model) =>
        model.surface === 'cloud_managed' &&
        (model.provider === 'openai' || model.provider === 'anthropic'),
    );
    expect(providerModels.length).toBeGreaterThan(0);
    for (const model of providerModels) {
      expect(getByTestId(`model-row-${model.id}`)).toBeTruthy();
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

    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_AUTO_MODE_ID);
  });

  it('does not expand thinking for auto modes', () => {
    useModelStore.setState({ selectedModel: DEFAULT_AUTO_MODE_ID });
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
