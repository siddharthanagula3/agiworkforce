/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ToolAccessSelector — component tests
 *
 * Covers:
 *   - Renders 3 options (Auto, On demand, Always available)
 *   - Auto selected by default
 *   - Tapping option changes selection in chatStore
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

import { ToolAccessSelector } from '../components/chat/ToolAccessSelector';
import { useChatStore } from '../stores/chatStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetChatStore() {
  useChatStore.setState({ toolAccess: 'auto' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToolAccessSelector', () => {
  beforeEach(() => {
    resetChatStore();
    jest.clearAllMocks();
  });

  it('renders 3 tool access options', () => {
    const { getByText } = render(<ToolAccessSelector />);

    expect(getByText('Auto')).toBeTruthy();
    expect(getByText('On demand')).toBeTruthy();
    expect(getByText('Always available')).toBeTruthy();
  });

  it('shows descriptions for each option', () => {
    const { getByText } = render(<ToolAccessSelector />);

    expect(getByText('AI chooses for you')).toBeTruthy();
    expect(getByText('Load when needed. More messages, lower accuracy')).toBeTruthy();
    expect(getByText('All tools loaded')).toBeTruthy();
  });

  it('has Auto selected by default', () => {
    const { getByLabelText } = render(<ToolAccessSelector />);

    const autoOption = getByLabelText('Auto, selected');
    expect(autoOption).toBeTruthy();
    expect(autoOption.props.accessibilityState).toEqual({ selected: true });
  });

  it('tapping On demand changes selection in chatStore', () => {
    const { getByLabelText } = render(<ToolAccessSelector />);

    fireEvent.press(getByLabelText('On demand'));
    expect(useChatStore.getState().toolAccess).toBe('on-demand');
  });

  it('tapping Always available changes selection in chatStore', () => {
    const { getByLabelText } = render(<ToolAccessSelector />);

    fireEvent.press(getByLabelText('Always available'));
    expect(useChatStore.getState().toolAccess).toBe('always');
  });

  it('renders the "Tool Access" header', () => {
    const { getByText } = render(<ToolAccessSelector />);
    expect(getByText('Tool Access')).toBeTruthy();
  });
});
