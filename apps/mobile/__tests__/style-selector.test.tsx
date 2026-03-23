/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * StyleSelector — component tests
 *
 * Covers:
 *   - Renders 4 style options (Normal, Concise, Detailed, Creative)
 *   - Normal selected by default
 *   - Tapping option changes selection in chatStore
 *   - Shows descriptions for each option
 */

import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — must be before component import
// ---------------------------------------------------------------------------

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
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { StyleSelector } from '../components/chat/StyleSelector';
import { useChatStore } from '../stores/chatStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetChatStore() {
  useChatStore.setState({ chatStyle: 'normal' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StyleSelector', () => {
  beforeEach(() => {
    resetChatStore();
    jest.clearAllMocks();
  });

  it('renders 4 style options', () => {
    const { getByText } = render(<StyleSelector />);

    expect(getByText('Normal')).toBeTruthy();
    expect(getByText('Concise')).toBeTruthy();
    expect(getByText('Detailed')).toBeTruthy();
    expect(getByText('Creative')).toBeTruthy();
  });

  it('shows descriptions for each option', () => {
    const { getByText } = render(<StyleSelector />);

    expect(getByText('Balanced, standard')).toBeTruthy();
    expect(getByText('Short, direct answers')).toBeTruthy();
    expect(getByText('Thorough explanations')).toBeTruthy();
    expect(getByText('Imaginative, expressive')).toBeTruthy();
  });

  it('has Normal selected by default', () => {
    const { getByLabelText } = render(<StyleSelector />);

    const normalOption = getByLabelText('Normal style, selected');
    expect(normalOption).toBeTruthy();
    expect(normalOption.props.accessibilityState).toEqual({ selected: true });
  });

  it('tapping an option changes selection in chatStore', () => {
    const { getByLabelText } = render(<StyleSelector />);

    // Tap Concise
    const conciseOption = getByLabelText('Concise style');
    fireEvent.press(conciseOption);

    expect(useChatStore.getState().chatStyle).toBe('concise');
  });

  it('tapping Detailed sets chatStyle to detailed', () => {
    const { getByLabelText } = render(<StyleSelector />);

    fireEvent.press(getByLabelText('Detailed style'));
    expect(useChatStore.getState().chatStyle).toBe('detailed');
  });

  it('tapping Creative sets chatStyle to creative', () => {
    const { getByLabelText } = render(<StyleSelector />);

    fireEvent.press(getByLabelText('Creative style'));
    expect(useChatStore.getState().chatStyle).toBe('creative');
  });

  it('renders the "Choose Style" header', () => {
    const { getByText } = render(<StyleSelector />);
    expect(getByText('Choose Style')).toBeTruthy();
  });
});
