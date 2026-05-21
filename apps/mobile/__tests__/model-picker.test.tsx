/**
 * Tests for ModelPickerSheet component.
 *
 * Covers:
 *  - Local auto modes
 *  - On-device model rows from @agiworkforce/local-llm
 *  - Locked Cloud Managed rows
 *  - Local selection behavior
 *  - Fail-closed cloud selection behavior
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

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

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
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
  CloudOff: jest.fn().mockReturnValue(null),
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

// ---------------------------------------------------------------------------
// Import modules under test AFTER mocks
// ---------------------------------------------------------------------------

import { ModelPickerSheet } from '../src/features/model-picker/components/ModelPickerSheet';
import { useModelStore } from '../src/features/model-picker/store';
import {
  AUTO_MODES,
  DEFAULT_LOCAL_MODEL_ID,
  LOCKED_CLOUD_MODELS,
} from '../src/features/model-picker/service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetModelStore() {
  useModelStore.setState({
    selectedModel: DEFAULT_LOCAL_MODEL_ID,
    selectedProvider: 'local',
    favorites: [],
    recentModels: [],
    thinkingModeEnabled: false,
    thinkingEnabledPerModel: {},
  });
}

const mockSheetRef = { current: { close: jest.fn(), snapToIndex: jest.fn() } };
function renderPicker(overrides?: { onSelect?: (id: string) => void }) {
  return render(
    <ModelPickerSheet sheetRef={mockSheetRef as never} onSelect={overrides?.onSelect} />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModelPickerSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetModelStore();
  });

  it('renders all local auto mode cards', () => {
    const { getAllByText } = renderPicker();

    for (const mode of AUTO_MODES) {
      expect(getAllByText(mode.name).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('renders local auto mode descriptions', () => {
    const { getAllByText } = renderPicker();

    expect(getAllByText('Best local model for this device').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Small local model when battery matters').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('On-device vision when available').length).toBeGreaterThanOrEqual(1);
  });

  it('marks the selected auto mode as selected', () => {
    useModelStore.setState({ selectedModel: 'auto-economy' });
    const { getByLabelText } = renderPicker();

    const economyCard = getByLabelText('Lite: Small local model when battery matters');
    expect(economyCard.props.accessibilityState.selected).toBe(true);
  });

  it('renders on-device model names from the local catalog', () => {
    const { getByText } = renderPicker();

    expect(getByText('AGI Standard')).toBeTruthy();
    expect(getByText('AGI Lite')).toBeTruthy();
    expect(getByText('Apple Intelligence')).toBeTruthy();
  });

  it('renders local and locked cloud hierarchy immediately', () => {
    const { getByText, getAllByText } = renderPicker();

    expect(getByText('On device')).toBeTruthy();
    expect(getByText('Cloud Managed (locked)')).toBeTruthy();
    expect(getAllByText('Locked').length).toBeGreaterThan(0);
  });

  it('marks the selected local model row as selected via accessibilityState', () => {
    useModelStore.setState({ selectedModel: DEFAULT_LOCAL_MODEL_ID });
    const { getByLabelText } = renderPicker();

    const standardRow = getByLabelText('AGI Standard, selected');
    expect(standardRow.props.accessibilityState.selected).toBe(true);
  });

  it('marks cloud rows as locked and disabled', () => {
    const lockedModel = LOCKED_CLOUD_MODELS[0]!;
    const { getByLabelText } = renderPicker();

    const lockedRow = getByLabelText(
      `${lockedModel.name}, locked, Cloud Managed and BYOK are disabled in Mobile v1`,
    );
    expect(lockedRow.props.accessibilityState.disabled).toBe(true);
  });

  it('selects a local model when tapped', () => {
    const { getByLabelText } = renderPicker();

    fireEvent.press(getByLabelText(/AGI Lite/));

    expect(useModelStore.getState().selectedModel).toBe('llama-3.2-1b-instruct-spinquant');
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

  it('does not select or close for locked cloud rows', () => {
    const lockedModel = LOCKED_CLOUD_MODELS[0]!;
    const { getByLabelText } = renderPicker();

    fireEvent.press(
      getByLabelText(
        `${lockedModel.name}, locked, Cloud Managed and BYOK are disabled in Mobile v1`,
      ),
    );

    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
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

    fireEvent.press(getByLabelText('AGI Standard, selected'));

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
});
