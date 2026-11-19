/* eslint-disable @typescript-eslint/no-require-imports */

import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { READING_COLUMN_MAX_WIDTH } from '../src/shared/layout/contentColumn';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

let mockWindowWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWindowWidth, height: 874, scale: 3, fontScale: 1 }),
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const { View } = require('react-native');
  const { forwardRef } = require('react');
  const MockBottomSheet = forwardRef(function MockBottomSheet(
    { children }: { children: React.ReactNode },
    _ref: React.Ref<unknown>,
  ) {
    return <View testID="bottom-sheet">{children}</View>;
  });
  const MockBackdrop = () => null;
  return {
    __esModule: true,
    default: MockBottomSheet,
    BottomSheetBackdrop: MockBackdrop,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = ({ size, color }: { size?: number; color?: string }) => (
    <Text>{`icon-${size}-${color}`}</Text>
  );
  return { X: icon };
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
}));

import { StyleSelector } from '../src/features/chat/components/StyleSelector';
import { useChatStore } from '../stores/chatStore';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function resetChatStore() {
  useChatStore.setState({ chatStyle: 'normal' });
}

function renderOpenStyleSelector() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <StyleSelector openSignal={1} />
    </SafeAreaProvider>,
  );
}

describe('StyleSelector', () => {
  beforeEach(() => {
    resetChatStore();
    jest.clearAllMocks();
  });

  it('renders 4 style options', () => {
    const { getByText } = renderOpenStyleSelector();

    expect(getByText('Normal')).toBeTruthy();
    expect(getByText('Concise')).toBeTruthy();
    expect(getByText('Explanatory')).toBeTruthy();
    expect(getByText('Formal')).toBeTruthy();
  });

  it('shows descriptions for each option', () => {
    const { getByText } = renderOpenStyleSelector();

    expect(getByText('Your style from Personalization')).toBeTruthy();
    expect(getByText('Short, direct answers')).toBeTruthy();
    expect(getByText('Reasoning and context')).toBeTruthy();
    expect(getByText('Formal register')).toBeTruthy();
  });

  it('has Normal selected by default', () => {
    const { getByLabelText } = renderOpenStyleSelector();

    const normalOption = getByLabelText('Normal style, selected');
    expect(normalOption).toBeTruthy();
    expect(normalOption.props.accessibilityRole).toBe('radio');
    expect(normalOption.props.accessibilityState).toEqual({ checked: true });
    expect(getByLabelText('Concise style').props.accessibilityState).toEqual({ checked: false });
  });

  it('tapping an option changes selection in chatStore', () => {
    const { getByLabelText } = renderOpenStyleSelector();

    const conciseOption = getByLabelText('Concise style');
    fireEvent.press(conciseOption);

    expect(useChatStore.getState().chatStyle).toBe('concise');
  });

  it('tapping Explanatory sets chatStyle to explanatory', () => {
    const { getByLabelText } = renderOpenStyleSelector();

    fireEvent.press(getByLabelText('Explanatory style'));
    expect(useChatStore.getState().chatStyle).toBe('explanatory');
  });

  it('tapping Learning sets chatStyle to learning', () => {
    const { getByLabelText } = renderOpenStyleSelector();

    fireEvent.press(getByLabelText('Learning style'));
    expect(useChatStore.getState().chatStyle).toBe('learning');
  });

  it('tapping Formal sets chatStyle to formal', () => {
    const { getByLabelText } = renderOpenStyleSelector();

    fireEvent.press(getByLabelText('Formal style'));
    expect(useChatStore.getState().chatStyle).toBe('formal');
  });

  it('renders the "Choose Style" header', () => {
    const { getByText } = renderOpenStyleSelector();
    expect(getByText('Choose Style')).toBeTruthy();
  });

  it('stops the sheet at the reading column on a wide window', () => {
    const { getByTestId } = renderOpenStyleSelector();

    expect(StyleSheet.flatten(getByTestId('style-selector-sheet').props.style)).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
    });
  });

  it('closes when the dimmed area beside the sheet is tapped on a wide window', () => {
    mockWindowWidth = 1376;
    const { getByTestId, queryByText } = renderOpenStyleSelector();

    const sideScrim = getByTestId('style-selector-side-scrim');
    expect(StyleSheet.flatten(sideScrim.props.style)).toMatchObject({
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
    expect(sideScrim.props.accessible).toBe(false);
    fireEvent.press(sideScrim);

    expect(queryByText('Choose Style')).toBeNull();
    mockWindowWidth = 402;
  });

  it('keeps the phone tree: one close area above the sheet and no side scrim', () => {
    mockWindowWidth = 402;
    const { getAllByLabelText, queryByTestId } = renderOpenStyleSelector();

    expect(queryByTestId('style-selector-side-scrim')).toBeNull();
    const dismiss = getAllByLabelText('Close style selector')[0]!;
    expect(StyleSheet.flatten(dismiss.props.style)).toEqual({ flex: 1 });
  });
});
