/* eslint-disable @typescript-eslint/no-require-imports */

import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

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
    expect(getByText('Detailed')).toBeTruthy();
    expect(getByText('Creative')).toBeTruthy();
  });

  it('shows descriptions for each option', () => {
    const { getByText } = renderOpenStyleSelector();

    expect(getByText('Balanced, standard')).toBeTruthy();
    expect(getByText('Short, direct answers')).toBeTruthy();
    expect(getByText('Thorough explanations')).toBeTruthy();
    expect(getByText('Imaginative, expressive')).toBeTruthy();
  });

  it('has Normal selected by default', () => {
    const { getByLabelText } = renderOpenStyleSelector();

    const normalOption = getByLabelText('Normal style, selected');
    expect(normalOption).toBeTruthy();
    expect(normalOption.props.accessibilityState).toEqual({ selected: true });
  });

  it('tapping an option changes selection in chatStore', () => {
    const { getByLabelText } = renderOpenStyleSelector();

    const conciseOption = getByLabelText('Concise style');
    fireEvent.press(conciseOption);

    expect(useChatStore.getState().chatStyle).toBe('concise');
  });

  it('tapping Detailed sets chatStyle to detailed', () => {
    const { getByLabelText } = renderOpenStyleSelector();

    fireEvent.press(getByLabelText('Detailed style'));
    expect(useChatStore.getState().chatStyle).toBe('detailed');
  });

  it('tapping Creative sets chatStyle to creative', () => {
    const { getByLabelText } = renderOpenStyleSelector();

    fireEvent.press(getByLabelText('Creative style'));
    expect(useChatStore.getState().chatStyle).toBe('creative');
  });

  it('renders the "Choose Style" header', () => {
    const { getByText } = renderOpenStyleSelector();
    expect(getByText('Choose Style')).toBeTruthy();
  });
});
