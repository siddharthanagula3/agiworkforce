/**
 * Tests for ModelPickerSheet component.
 *
 * Covers:
 *  - Renders 3 auto modes (Economy, Balanced, Best) at top
 *  - Renders flat model list without provider group headers
 *  - Shows checkmark on selected model
 *  - Shows "New" badge on new models
 *  - Tapping a model selects it
 *  - Tapping selected model expands thinking toggle
 *  - Per-model thinking toggle works
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — avoid React.createElement(RN.*) inside factories to prevent
// NativeWind's CSSInterop Babel transform from injecting out-of-scope vars.
// ---------------------------------------------------------------------------

jest.mock('../lib/mmkv', () => ({
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

jest.mock('../services/modelCatalog', () => ({
  fetchModelCatalog: jest.fn().mockResolvedValue([]),
}));

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

// Mock @gorhom/bottom-sheet — pass through children
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
}));

// Mock react-native-reanimated for ModelRow's Animated.View
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: jest.fn().mockImplementation(({ children }) => children),
    Text: jest.fn().mockImplementation(({ children }) => children),
  },
  FadeIn: { duration: jest.fn().mockReturnValue({}) },
  FadeOut: { duration: jest.fn().mockReturnValue({}) },
}));

// ---------------------------------------------------------------------------
// Import modules under test AFTER mocks
// ---------------------------------------------------------------------------

import { ModelPickerSheet } from '../components/model-picker/ModelPickerSheet';
import { useModelStore } from '../stores/modelStore';
import { AUTO_MODES, MODEL_LIST } from '../lib/models';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetModelStore() {
  useModelStore.setState({
    selectedModel: 'auto-balanced',
    selectedProvider: 'managed_cloud',
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

  // ---- Auto modes ----

  it('renders all 3 auto mode cards', () => {
    const { getByText } = renderPicker();

    for (const mode of AUTO_MODES) {
      expect(getByText(mode.name)).toBeTruthy();
    }
  });

  it('renders auto mode descriptions', () => {
    const { getByText } = renderPicker();

    expect(getByText('Best for cost')).toBeTruthy();
    expect(getByText('Best value')).toBeTruthy();
    expect(getByText('Most capable')).toBeTruthy();
  });

  it('marks the selected auto mode as selected', () => {
    useModelStore.setState({ selectedModel: 'auto-economy' });
    const { getByLabelText } = renderPicker();

    const economyCard = getByLabelText('Economy: Best for cost');
    expect(economyCard.props.accessibilityState.selected).toBe(true);
  });

  // ---- Model list ----

  it('renders model names from the flat model list', () => {
    const { getByText } = renderPicker();

    // Check a few representative models
    expect(getByText('GPT-5.4')).toBeTruthy();
    expect(getByText('Claude 4.6 Opus')).toBeTruthy();
    expect(getByText('Gemini 3.1 Pro')).toBeTruthy();
  });

  it('renders models as a flat list without provider group headers', () => {
    const { queryByText } = renderPicker();

    // Provider names should NOT appear as section headers
    // With no favorites, neither heading should appear
    expect(queryByText('Favorites')).toBeNull();
    expect(queryByText('All Models')).toBeNull();
  });

  // ---- Selected model checkmark ----

  it('marks the selected model row as selected via accessibilityState', () => {
    useModelStore.setState({ selectedModel: 'claude-opus-4.6' });
    const { getByLabelText } = renderPicker();

    const opusRow = getByLabelText('Claude 4.6 Opus, selected');
    expect(opusRow.props.accessibilityState.selected).toBe(true);
  });

  // ---- New badge ----

  it('shows "New" badge text on models with isNew flag', () => {
    const { getAllByText } = renderPicker();

    // MODEL_LIST has isNew: true for gpt-5.4 and grok-4
    const newBadges = getAllByText('New');
    const newModels = MODEL_LIST.filter((m) => m.isNew);
    expect(newBadges.length).toBe(newModels.length);
  });

  // ---- Model selection ----

  it('selects a model when tapped', () => {
    const { getByLabelText } = renderPicker();

    fireEvent.press(getByLabelText(/Claude 4\.6 Opus/));

    expect(useModelStore.getState().selectedModel).toBe('claude-opus-4.6');
  });

  it('calls onSelect callback instead of store when provided', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = renderPicker({ onSelect });

    fireEvent.press(getByLabelText(/Claude 4\.6 Opus/));

    expect(onSelect).toHaveBeenCalledWith('claude-opus-4.6');
    // Store should NOT have been updated
    expect(useModelStore.getState().selectedModel).toBe('auto-balanced');
  });

  it('closes the sheet after selecting a model', () => {
    const { getByLabelText } = renderPicker();

    fireEvent.press(getByLabelText(/Claude 4\.6 Opus/));

    expect(mockSheetRef.current.close).toHaveBeenCalled();
  });

  it('selects an auto mode when tapped', () => {
    const { getByLabelText } = renderPicker();

    fireEvent.press(getByLabelText('Economy: Best for cost'));

    expect(useModelStore.getState().selectedModel).toBe('auto-economy');
  });

  // ---- Expanded thinking toggle ----

  it('expands thinking toggle when tapping the already-selected model', () => {
    // First select claude-opus-4.6
    useModelStore.setState({ selectedModel: 'claude-opus-4.6' });

    const { getByLabelText, queryByText } = renderPicker();

    // Tap the already-selected model to expand
    fireEvent.press(getByLabelText('Claude 4.6 Opus, selected'));

    // The thinking toggle row should now be visible
    expect(queryByText('With thinking')).toBeTruthy();
  });

  it('collapses thinking toggle when tapping the expanded model again', () => {
    useModelStore.setState({ selectedModel: 'claude-opus-4.6' });

    const { getByLabelText, queryByText } = renderPicker();

    // First tap to expand
    fireEvent.press(getByLabelText('Claude 4.6 Opus, selected'));
    expect(queryByText('With thinking')).toBeTruthy();

    // Second tap to collapse
    fireEvent.press(getByLabelText('Claude 4.6 Opus, selected'));
    expect(queryByText('With thinking')).toBeNull();
  });

  it('does not expand thinking for auto modes', () => {
    useModelStore.setState({ selectedModel: 'auto-balanced' });
    const { getByLabelText, queryByText } = renderPicker();

    // Tapping the selected auto mode should NOT expand thinking
    fireEvent.press(getByLabelText('Balanced: Best value'));
    expect(queryByText('With thinking')).toBeNull();
  });

  // ---- Per-model thinking toggle ----

  it('toggles thinking for a specific model via the switch', () => {
    useModelStore.setState({ selectedModel: 'claude-opus-4.6' });

    const { getByLabelText } = renderPicker();

    // Expand the thinking toggle
    fireEvent.press(getByLabelText('Claude 4.6 Opus, selected'));

    // Find and toggle the switch
    const thinkingSwitch = getByLabelText('Thinking mode for Claude 4.6 Opus');
    fireEvent(thinkingSwitch, 'valueChange', true);

    expect(useModelStore.getState().thinkingEnabledPerModel['claude-opus-4.6']).toBe(true);
  });

  // ---- Header ----

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
