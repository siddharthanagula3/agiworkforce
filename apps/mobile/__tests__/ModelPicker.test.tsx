/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/src/features/billing/nativePurchaseAvailability', () => ({
  NATIVE_PURCHASES_AVAILABLE: true,
}));

import React from 'react';
import { act, render, fireEvent, waitFor, within } from '@testing-library/react-native';

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

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
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
  ChevronDown: jest.fn().mockReturnValue(null),
  ChevronUp: jest.fn().mockReturnValue(null),
  Star: jest.fn().mockReturnValue(null),
  Brain: jest.fn().mockReturnValue(null),
  Cpu: jest.fn().mockReturnValue(null),
  Download: jest.fn().mockReturnValue(null),
  Lock: jest.fn().mockReturnValue(null),
  Cloud: jest.fn().mockReturnValue(null),
  ArrowUpCircle: jest.fn().mockReturnValue(null),
  Shuffle: jest.fn().mockReturnValue(null),
  Zap: jest.fn().mockReturnValue(null),
  DollarSign: jest.fn().mockReturnValue(null),
  Eye: jest.fn().mockReturnValue(null),
  FileText: jest.fn().mockReturnValue(null),
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: jest.fn().mockImplementation(({ children }) => children),
    Text: jest.fn().mockImplementation(({ children }) => children),
    createAnimatedComponent: <T,>(component: T) => component,
  },
  FadeIn: { duration: jest.fn().mockReturnValue({}) },
  FadeOut: { duration: jest.fn().mockReturnValue({}) },
  Easing: { linear: (value: number) => value },
  cancelAnimation: jest.fn(),
  useAnimatedProps: (factory: () => unknown) => factory(),
  useReducedMotion: jest.fn().mockReturnValue(false),
  useSharedValue: <T,>(value: T) => ({ value }),
  withRepeat: <T,>(value: T) => value,
  withTiming: <T,>(value: T) => value,
}));

jest.mock('react-native-gesture-handler', () => {
  const pan: Record<string, () => unknown> = {};
  for (const method of ['withTestId', 'runOnJS', 'activeOffsetX', 'failOffsetY', 'onUpdate']) {
    pan[method] = () => pan;
  }
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../src/features/model-picker/components/SpeedControl', () => {
  const { View } = require('react-native');
  return { SpeedControl: () => <View testID="model-picker-speed" /> };
});

import { ModelPickerSheet } from '../src/features/model-picker/components/ModelPickerSheet';
import { useFreeQuotaCatalogueStore } from '../src/features/model-picker/freeQuotaCatalogue';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  __resetCloudAccountSessionForTests,
} from '../src/features/auth/services/cloudAccountSession';
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
  EFFORT_DESCRIPTION,
  EFFORT_LABEL,
  ROUTING_PROFILE_CHOICE_OPTIONS,
  getMinimumRequiredTier,
  getModelMetadataById,
  getModelReasoning,
  getProviderOfferings,
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
  return EFFORT_LABEL[effort as keyof typeof EFFORT_LABEL];
}

function effortDescription(effort: string): string {
  return EFFORT_DESCRIPTION[effort as keyof typeof EFFORT_DESCRIPTION];
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
  selectedModelId?: string;
  onOpenCloudAccess?: (defaultTab?: 'invite' | 'waitlist') => void;
  modelScope?: 'local' | 'cloud' | 'all';
  conversationId?: string;
  showSpeed?: boolean;
}) {
  return render(
    <ModelPickerSheet
      sheetRef={mockSheetRef as never}
      onSelect={overrides?.onSelect}
      selectedModelId={overrides?.selectedModelId}
      onOpenCloudAccess={overrides?.onOpenCloudAccess}
      modelScope={overrides?.modelScope}
      conversationId={overrides?.conversationId}
      showSpeed={overrides?.showSpeed}
    />,
  );
}

function cloudAutoLabel(mode: (typeof AUTO_MODES)[number]): string {
  const description =
    mode.id === DEFAULT_AUTO_MODE_ID
      ? ROUTING_PROFILE_CHOICE_OPTIONS.find((option) => option.choice === 'auto')!.description
      : mode.description;
  return `${mode.name}: ${description}`;
}

function revealRow(
  screen: ReturnType<typeof renderPicker>,
  model: { id: string; provider: string },
) {
  if (screen.queryByTestId(`model-row-${model.id}`)) return;
  fireEvent.press(screen.getByTestId(`model-line-${model.provider}`));
}

describe('ModelPickerSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    useFreeQuotaCatalogueStore.getState().clear();
    resetModelStore();
    useTierStore.setState({ tier: 'free' });
    useAgentControlStore.setState({ byConversation: {}, byProject: {} });
  });

  it('explains an empty provider-funded catalogue and a retryable check failure', () => {
    activateCloudAccount('account-a');
    useWaitlistStore.setState({ cloudUnlocked: true });
    useFreeQuotaCatalogueStore.setState({
      account: captureCloudAccountEpoch(),
      catalogue: null,
      loading: false,
      error: null,
    });
    const screen = renderPicker({ modelScope: 'cloud' });

    expect(
      screen.getByText('No provider-funded Free chat models are available right now.'),
    ).toBeTruthy();
    act(() => {
      useFreeQuotaCatalogueStore.setState({
        error: 'Sign in again to check provider-funded Free models.',
      });
    });

    expect(screen.getByText('Sign in again to check provider-funded Free models.')).toBeTruthy();
    expect(screen.getByLabelText('Retry loading provider-funded Free models')).toBeTruthy();
    expect(
      screen.queryByText('No provider-funded Free chat models are available right now.'),
    ).toBeNull();
  });

  it('keeps the Free catalogue notices away from a paid plan', () => {
    activateCloudAccount('account-a');
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' } as never);
    useFreeQuotaCatalogueStore.setState({
      account: captureCloudAccountEpoch(),
      catalogue: null,
      loading: false,
      error: 'Sign in again to check provider-funded Free models.',
    });

    try {
      const screen = renderPicker({ modelScope: 'cloud' });
      expect(screen.queryByText(/provider-funded Free/)).toBeNull();
      expect(screen.queryByLabelText('Retry loading provider-funded Free models')).toBeNull();
    } finally {
      useTierStore.setState({ tier: 'free' } as never);
    }
  });

  it('explains a checked catalogue whose chat offers are all unavailable', () => {
    const chatOffering = Object.entries(getProviderOfferings()).find(
      ([, offering]) => offering.category === 'chat' && offering.quotaProbeProtocol === 'chat',
    );
    if (!chatOffering) throw new Error('The registry has no promotional chat offering');
    activateCloudAccount('account-a');
    useWaitlistStore.setState({ cloudUnlocked: true });
    useFreeQuotaCatalogueStore.setState({
      account: captureCloudAccountEpoch(),
      catalogue: {
        issuer: 'AGI Cloud',
        observedOn: new Date().toISOString(),
        evidenceUrl: 'https://example.test/free-capacity',
        reportedEligible: 0,
        reportedUnavailable: 1,
        models: [
          {
            key: chatOffering[0],
            displayName: chatOffering[1].displayName,
            providerModelId: null,
            category: 'chat',
            limit: null,
            unit: null,
            consumedApproximate: null,
            expiresOn: null,
            status: 'exhausted',
          },
        ],
      },
      loading: false,
      error: null,
    });

    const screen = renderPicker({ modelScope: 'cloud' });

    expect(
      screen.getByText('No provider-funded Free chat models are available right now.'),
    ).toBeTruthy();
    expect(screen.queryByText(chatOffering[1].displayName)).toBeNull();
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

  it('offers the same registry-owned Auto modes in AGI Cloud on a paid plan', () => {
    useTierStore.setState({ tier: 'pro' });
    const { getByLabelText } = renderPicker({ modelScope: 'cloud' });

    for (const mode of AUTO_MODES) {
      expect(getByLabelText(cloudAutoLabel(mode))).toBeTruthy();
    }
  });

  it('does not offer Auto in AGI Cloud on the free plan, which the server would refuse', () => {
    const { queryByLabelText } = renderPicker({ modelScope: 'cloud' });

    for (const mode of AUTO_MODES) {
      expect(queryByLabelText(cloudAutoLabel(mode))).toBeNull();
      expect(queryByLabelText(`${mode.name}: ${mode.description}`)).toBeNull();
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

  it('keeps on-device models in their own group beside the cloud models', () => {
    const { getByText, getAllByText } = renderPicker({ modelScope: 'all' });

    expect(getByText('On device')).toBeTruthy();
    expect(getAllByText('Sign in').length).toBeGreaterThan(0);
  });

  it('shows one cloud model per provider and opens the rest from its dropdown', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const cloudModels = getModelListForCloudAccess(true, 'max').filter(
      (model) => model.surface === 'cloud_managed',
    );
    const provider = cloudModels.find(
      (model) => cloudModels.filter((other) => other.provider === model.provider).length > 1,
    )!.provider;
    const line = cloudModels.filter((model) => model.provider === provider);
    const screen = renderPicker({ modelScope: 'cloud' });
    const shown = () => line.filter((model) => screen.queryByTestId(`model-row-${model.id}`));

    expect(shown()).toHaveLength(1);
    expect(screen.getByTestId(`model-line-${provider}`).props.accessibilityState.expanded).toBe(
      false,
    );

    fireEvent.press(screen.getByTestId(`model-line-${provider}`));

    expect(shown()).toHaveLength(line.length);
    expect(screen.getByTestId(`model-line-${provider}`).props.accessibilityState.expanded).toBe(
      true,
    );

    fireEvent.press(screen.getByTestId(`model-line-${provider}`));

    expect(shown()).toHaveLength(1);
  });

  it('offers no dropdown for a provider with a single model', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const cloudModels = getModelListForCloudAccess(true, 'max').filter(
      (model) => model.surface === 'cloud_managed',
    );
    const single = cloudModels.find(
      (model) => cloudModels.filter((other) => other.provider === model.provider).length === 1,
    );
    if (!single) throw new Error('The mobile catalogue has no single-model provider');
    const screen = renderPicker({ modelScope: 'cloud' });

    expect(screen.getByTestId(`model-row-${single.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`model-line-${single.provider}`)).toBeNull();
  });

  it('shows the selected model as its provider row, then the one used last', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const cloudModels = getModelListForCloudAccess(true, 'max').filter(
      (model) => model.surface === 'cloud_managed' && model.availability !== 'locked',
    );
    const provider = cloudModels.find(
      (model) => cloudModels.filter((other) => other.provider === model.provider).length > 1,
    )!.provider;
    const line = cloudModels.filter((model) => model.provider === provider);
    const elsewhere = cloudModels.find((model) => model.provider !== provider)!;
    const lastInLine = line[line.length - 1]!;

    useModelStore.getState().setModel(lastInLine.id);
    const selected = renderPicker({ modelScope: 'cloud' });
    expect(
      selected.getByTestId(`model-row-${lastInLine.id}`).props.accessibilityState.selected,
    ).toBe(true);
    selected.unmount();

    useModelStore.getState().setModel(elsewhere.id);
    const remembered = renderPicker({ modelScope: 'cloud' });
    expect(remembered.getByTestId(`model-row-${lastInLine.id}`)).toBeTruthy();
    expect(
      remembered.getByTestId(`model-row-${lastInLine.id}`).props.accessibilityState.selected,
    ).toBe(false);
    expect(remembered.queryByText('Recent')).toBeNull();
  });

  it('starts a provider nobody has used on the tier Auto defaults to', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const everydayTier = AUTO_MODES.find((mode) => mode.id === DEFAULT_AUTO_MODE_ID)!.tier;
    const cloudModels = getModelListForCloudAccess(true, 'max').filter(
      (model) => model.surface === 'cloud_managed' && model.availability !== 'locked',
    );
    const mixed = cloudModels.find(
      (model) =>
        model.tier !== everydayTier &&
        cloudModels.some(
          (other) => other.provider === model.provider && other.tier === everydayTier,
        ),
    );
    if (!mixed) throw new Error('No provider mixes the everyday tier with another');
    const screen = renderPicker({ modelScope: 'cloud' });

    const shown = cloudModels.filter(
      (model) => model.provider === mixed.provider && screen.queryByTestId(`model-row-${model.id}`),
    );
    expect(shown).toHaveLength(1);
    expect(shown[0]!.tier).toBe(everydayTier);
  });

  it('offers Auto alone above the models, with no routing choices under it', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.setState({ selectedModel: DEFAULT_AUTO_MODE_ID });
    const screen = renderPicker({ modelScope: 'cloud' });

    for (const option of ROUTING_PROFILE_CHOICE_OPTIONS) {
      expect(screen.queryByLabelText(`Auto, ${option.label}: ${option.description}`)).toBeNull();
    }
    expect(screen.queryByTestId('model-routing-profiles')).toBeNull();
    expect(
      screen.getByText(
        ROUTING_PROFILE_CHOICE_OPTIONS.find((option) => option.choice === 'auto')!.description,
      ),
    ).toBeTruthy();
  });

  it('narrows the list to the models a filter describes, and back when it is turned off', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const cloudModels = getModelListForCloudAccess(true, 'max').filter(
      (model) => model.surface === 'cloud_managed',
    );
    const economy = cloudModels.filter((model) => model.tier === 'economy');
    const pricier = cloudModels.filter((model) => model.tier !== 'economy');
    expect(economy.length).toBeGreaterThan(0);
    expect(pricier.length).toBeGreaterThan(0);
    const screen = renderPicker({ modelScope: 'cloud' });
    const filter = screen.getByTestId('model-filter-economy');
    expect(filter.props.accessibilityState.selected).toBe(false);

    fireEvent.press(filter);

    expect(screen.getByTestId('model-filter-economy').props.accessibilityState.selected).toBe(true);
    for (const model of economy) expect(screen.getByTestId(`model-row-${model.id}`)).toBeTruthy();
    for (const model of pricier) expect(screen.queryByTestId(`model-row-${model.id}`)).toBeNull();
    expect(screen.queryByTestId(`model-line-${economy[0]!.provider}`)).toBeNull();

    fireEvent.press(screen.getByTestId('model-filter-economy'));

    expect(screen.getByTestId(`model-line-${economy[0]!.provider}`)).toBeTruthy();
  });

  it('keeps only the models that match every filter that is on', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const cloudModels = getModelListForCloudAccess(true, 'max').filter(
      (model) => model.surface === 'cloud_managed',
    );
    const both = cloudModels.filter((model) => model.tier === 'economy' && model.supportsVision);
    const onlyOne = cloudModels.filter(
      (model) => (model.tier === 'economy') !== model.supportsVision,
    );
    expect(onlyOne.length).toBeGreaterThan(0);
    const screen = renderPicker({ modelScope: 'cloud' });

    fireEvent.press(screen.getByTestId('model-filter-economy'));
    fireEvent.press(screen.getByTestId('model-filter-images'));

    for (const model of both) expect(screen.getByTestId(`model-row-${model.id}`)).toBeTruthy();
    for (const model of onlyOne) expect(screen.queryByTestId(`model-row-${model.id}`)).toBeNull();
    if (both.length === 0) expect(screen.getByTestId('model-filters-empty')).toBeTruthy();
  });

  it('lists the fastest models at their lowest effort under Instant and picks one that way', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const cloudModels = getModelListForCloudAccess(true, 'max').filter(
      (model) => model.surface === 'cloud_managed',
    );
    const fastest = cloudModels.filter(
      (model) => getModelMetadataById(model.id)?.speed === 'very-fast',
    );
    const slower = cloudModels.filter(
      (model) => getModelMetadataById(model.id)?.speed !== 'very-fast',
    );
    const pick = fastest.find(
      (model) =>
        model.availability !== 'locked' && sortedEfforts(getModelReasoning(model.id)).length > 1,
    );
    expect(pick).toBeDefined();
    const lowest = sortedEfforts(getModelReasoning(pick!.id))[0]!;
    const screen = renderPicker({ modelScope: 'cloud', conversationId: 'conv-1' });

    fireEvent.press(screen.getByTestId('model-filter-instant'));

    for (const model of fastest) expect(screen.getByTestId(`model-row-${model.id}`)).toBeTruthy();
    for (const model of slower) expect(screen.queryByTestId(`model-row-${model.id}`)).toBeNull();
    expect(
      within(screen.getByTestId(`model-row-${pick!.id}`)).getByText(effortLabel(lowest)),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId(`model-row-${pick!.id}`));

    expect(useModelStore.getState().selectedModel).toBe(pick!.id);
    expect(useAgentControlStore.getState().resolve('conv-1', null).effort).toBe(lowest);
  });

  it('offers no filters for on-device models', () => {
    const screen = renderPicker();

    expect(screen.queryByTestId('model-filters')).toBeNull();
  });

  it('carries no explanatory line under the title and no description on a model row', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const screen = renderPicker({ modelScope: 'cloud' });

    expect(screen.queryByText(/managed separately/)).toBeNull();
    expect(screen.queryByText(/^Best for /)).toBeNull();
    expect(screen.queryByText(/ context · /)).toBeNull();
    expect(screen.queryByText(/ provider$/)).toBeNull();
    expect(screen.queryByLabelText(/^Accepts /)).toBeNull();
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
    let completePreparation: (() => void) | undefined;
    const prepareModel = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          completePreparation = resolve;
        }),
    );
    useModelInstallStore.setState({
      installedModelIds: [DEFAULT_LOCAL_MODEL_ID],
      readySystemModelIds: [],
      jobs: {},
      prepareModel,
    });
    const { getByLabelText, queryByTestId } = renderPicker();
    await act(async () => {
      await Promise.resolve();
    });
    expect(queryByTestId('model-picker-loading')).toBeNull();

    fireEvent.press(getByLabelText(/AGI Lite/));

    expect(prepareModel).toHaveBeenCalledTimes(1);
    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
    await act(async () => {
      completePreparation?.();
    });
    expect(useModelStore.getState().selectedModel).toBe(LITE_MODEL_ID);
  });

  it('keeps a newer selection when an earlier download finishes afterwards', async () => {
    const completions: Array<() => void> = [];
    const prepareModel = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          completions.push(resolve);
        }),
    );
    useModelInstallStore.setState({
      installedModelIds: [DEFAULT_LOCAL_MODEL_ID],
      readySystemModelIds: [],
      jobs: {},
      prepareModel,
    });
    const { getByLabelText } = renderPicker();
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(getByLabelText(/AGI Lite/));
    expect(prepareModel).toHaveBeenCalledTimes(1);
    useModelStore.setState({ selectedModel: 'newer-selection' });
    await act(async () => {
      completions[0]?.();
    });

    expect(useModelStore.getState().selectedModel).toBe('newer-selection');
  });

  it('keeps a newer pick made through the same picker when an earlier download finishes', async () => {
    const completions: Array<() => void> = [];
    const prepareModel = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          completions.push(resolve);
        }),
    );
    useModelInstallStore.setState({
      installedModelIds: [DEFAULT_LOCAL_MODEL_ID],
      readySystemModelIds: [],
      jobs: {},
      prepareModel,
    });
    const onSelect = jest.fn();
    const { getByLabelText } = renderPicker({
      onSelect,
      selectedModelId: 'conversation-slot-model',
    });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(getByLabelText(/AGI Lite/));
    fireEvent.press(getByLabelText(/AGI Standard/));
    await act(async () => {
      completions[0]?.();
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(DEFAULT_LOCAL_MODEL_ID);
  });

  it('calls onSelect callback instead of store when provided', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = renderPicker({ onSelect });

    fireEvent.press(getByLabelText(/AGI Lite/));

    expect(onSelect).toHaveBeenCalledWith(LITE_MODEL_ID);
    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
  });

  it('delivers a tap on the store-selected model to a callback-owned slot holding another model', () => {
    useModelStore.setState({ selectedModel: DEFAULT_LOCAL_MODEL_ID });
    const onSelect = jest.fn();
    const { getByLabelText } = renderPicker({ onSelect, selectedModelId: LITE_MODEL_ID });

    fireEvent.press(getByLabelText(/AGI Standard/));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(DEFAULT_LOCAL_MODEL_ID);
    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
  });

  it('marks the callback-owned model, not the store model, as the selected row', () => {
    useModelStore.setState({ selectedModel: DEFAULT_LOCAL_MODEL_ID });
    const { getByLabelText } = renderPicker({
      onSelect: jest.fn(),
      selectedModelId: LITE_MODEL_ID,
    });

    expect(getByLabelText(/AGI Lite/).props.accessibilityState.selected).toBe(true);
    expect(getByLabelText(/AGI Standard/).props.accessibilityState.selected).toBe(false);
  });

  it('does not call the callback again when the callback-owned model is tapped', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = renderPicker({ onSelect, selectedModelId: LITE_MODEL_ID });

    fireEvent.press(getByLabelText(/AGI Lite/));

    expect(onSelect).not.toHaveBeenCalled();
    expect(mockSheetRef.current.close).toHaveBeenCalled();
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
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(auth)/login',
        params: { postAuthIntent: 'cloud-chat' },
      }),
    );
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

  it('offers the speed switch in the Cloud picker unless the caller opts out of it', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });

    const shown = renderPicker({ modelScope: 'cloud' });
    expect(shown.queryByTestId('model-picker-speed')).toBeTruthy();
    shown.unmount();

    const hidden = renderPicker({ modelScope: 'cloud', showSpeed: false });
    expect(hidden.queryByTestId('model-picker-speed')).toBeNull();
  });

  it('selects cloud rows after invite access', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    const cloudModel = LOCKED_CLOUD_MODELS[0]!;
    const renderedName = getModelByIdForCloudAccess(cloudModel.id, true, 'max')!.name;
    const screen = renderPicker({ modelScope: 'cloud' });
    revealRow(screen, cloudModel);

    fireEvent.press(screen.getAllByLabelText(renderedName)[0]!);

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

    const screen = renderPicker({ modelScope: 'cloud' });
    revealRow(screen, MAX_ONLY_MODEL);
    fireEvent.press(screen.getByText(maxOnlyForPro!.name));

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
    const screen = renderPicker({ modelScope: 'cloud' });
    revealRow(screen, MAX_ONLY_MODEL);

    const row = screen.getByLabelText(
      `${maxOnlyModel.name}, upgrade required, ${maxOnlyModel.lockReason}`,
    );
    expect(row.props.accessibilityHint).toBe('Opens plan upgrade options');
    expect(screen.getAllByText('Upgrade').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sign in')).toBeNull();
    expect(screen.queryByText(maxOnlyModel.lockReason!)).toBeNull();
  });

  it('suppresses the selected checkmark when the selected cloud model is tier-locked', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'pro' });
    useModelStore.setState({
      selectedModel: MAX_ONLY_MODEL.id,
      selectedProvider: 'cloud_managed',
    });

    const maxOnlyModel = getModelByIdForCloudAccess(MAX_ONLY_MODEL.id, true, 'pro')!;
    const screen = renderPicker({ modelScope: 'cloud' });
    revealRow(screen, MAX_ONLY_MODEL);

    const row = screen.getByLabelText(
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
    expect(queryByLabelText(`Reasoning effort ${effortLabel('high')}`)).toBeNull();
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
    expect(nextTier.props.accessibilityHint).toBe(EFFORT_DESCRIPTION[nextEffort]);

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

  it('renders a four-step model as a slider: the level named above the track, a dot for every other step, the trade-off read out not printed', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max' });
    useModelStore.getState().setModel(EXACT_EFFORT_MODEL.id);
    const { getByTestId, getByText, getByLabelText, queryByTestId } = renderPicker({
      modelScope: 'cloud',
      conversationId: 'conv-1',
    });

    const efforts = sortedEfforts(getModelReasoning(EXACT_EFFORT_MODEL.id));
    expect(efforts).toHaveLength(4);
    expect(getByTestId('model-picker-effort-selector')).toBeTruthy();
    expect(getByTestId('model-picker-effort-capsule')).toBeTruthy();
    expect(getByText('Effort')).toBeTruthy();
    const selected = useAgentControlStore.getState().resolve('conv-1', null).effort;
    expect(efforts).toContain(selected);
    for (const effort of efforts) {
      const label = effortLabel(effort);
      const tier = getByLabelText(`Reasoning effort ${label}`);
      expect(tier.props.accessibilityHint).toBe(effortDescription(effort));
      expect(tier.props.accessibilityState.selected).toBe(effort === selected);
      if (effort === selected) {
        expect(queryByTestId(`model-picker-effort-${effort}-dot`)).toBeNull();
      } else {
        expect(getByTestId(`model-picker-effort-${effort}-dot`)).toBeTruthy();
      }
    }
    expect(getByTestId('model-picker-effort-level').props.children).toBe(effortLabel(selected));
    expect(queryByTestId('model-picker-effort-description')).toBeNull();

    const next = efforts.find((effort) => effort !== selected)!;
    fireEvent.press(getByTestId(`model-picker-effort-${next}`));

    expect(getByTestId('model-picker-effort-level').props.children).toBe(effortLabel(next));
    expect(queryByTestId(`model-picker-effort-${next}-dot`)).toBeNull();
    expect(getByTestId(`model-picker-effort-${selected}-dot`)).toBeTruthy();
    expect(queryByTestId('model-picker-effort-description')).toBeNull();
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
    const screen = renderPicker({
      modelScope: 'cloud',
      conversationId: 'conv-1',
    });
    const { getByLabelText, getByTestId } = screen;

    fireEvent.press(getByLabelText(`Reasoning effort ${effortLabel('max')}`));
    expect(useAgentControlStore.getState().resolve('conv-1', null).effort).toBe('max');

    revealRow(screen, CLAMP_TARGET_MODEL);
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
    for (const provider of new Set(providerModels.map((model) => model.provider))) {
      fireEvent.press(getByTestId(`model-line-${provider}`));
      for (const model of providerModels.filter((entry) => entry.provider === provider)) {
        expect(getByTestId(`model-row-${model.id}`)).toBeTruthy();
      }
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

  it('surfaces the recently used models the store already tracks, newest first', () => {
    useModelStore.setState({ recentModels: [LITE_MODEL_ID, DEFAULT_LOCAL_MODEL_ID] });

    const { getByText, getAllByText } = renderPicker();

    expect(getByText('Recent')).toBeTruthy();
    // The recents row is the only place each model appears, so a single node
    // per name proves the grouped section below no longer repeats it.
    expect(getAllByText(LITE_MODEL.name)).toHaveLength(1);
  });

  it('hides the recents row while a search is active', () => {
    useModelStore.setState({ recentModels: [LITE_MODEL_ID] });

    const { getByLabelText, queryByText } = renderPicker();
    fireEvent.changeText(getByLabelText('Search models'), LITE_MODEL.name);

    expect(queryByText('Recent')).toBeNull();
  });

  it('renders no recents row before a model has been used', () => {
    const { queryByText } = renderPicker();

    expect(queryByText('Recent')).toBeNull();
  });
});
