/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Personalization Page — component tests
 *
 * Covers:
 *   - Renders 4 text inputs (Full Name, Nickname, Occupation, Custom Instructions)
 *   - Renders 4 sliders (Warmth, Enthusiasm, Headers/Lists, Emoji)
 *   - Save button commits to settingsStore
 *   - Pre-fills values from settingsStore
 */

import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — must be before component import
// ---------------------------------------------------------------------------

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    canGoBack: jest.fn().mockReturnValue(true),
    back: mockBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));

jest.mock('@react-native-community/slider', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: { value?: number; testID?: string }) => (
      <View testID={props.testID ?? 'slider'} accessibilityValue={{ now: props.value }} />
    ),
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return { ArrowLeft: icon, Check: icon };
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

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import PersonalizationScreen from '../app/(app)/settings/personalization';
import { useSettingsStore } from '../stores/settingsStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetSettingsStore() {
  useSettingsStore.setState({
    personalization: {
      fullName: '',
      nickname: '',
      occupation: '',
      instructions: '',
      warmth: 50,
      enthusiasm: 50,
      headersLists: 50,
      emoji: 50,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Personalization page', () => {
  beforeEach(() => {
    resetSettingsStore();
    jest.clearAllMocks();
  });

  it('renders the Personalization header', () => {
    const { getByText } = render(<PersonalizationScreen />);
    expect(getByText('Personalization')).toBeTruthy();
  });

  it('renders 4 text input labels', () => {
    const { getByText } = render(<PersonalizationScreen />);

    expect(getByText('Full Name')).toBeTruthy();
    expect(getByText('Nickname')).toBeTruthy();
    expect(getByText('Occupation')).toBeTruthy();
    expect(getByText('Custom Instructions')).toBeTruthy();
  });

  it('renders 4 slider labels', () => {
    const { getByText } = render(<PersonalizationScreen />);

    expect(getByText('Warmth')).toBeTruthy();
    expect(getByText('Enthusiasm')).toBeTruthy();
    expect(getByText('Headers / Lists')).toBeTruthy();
    expect(getByText('Emoji')).toBeTruthy();
  });

  it('renders slider range labels', () => {
    const { getByText } = render(<PersonalizationScreen />);

    // Warmth slider
    expect(getByText('Cold')).toBeTruthy();
    expect(getByText('Warm')).toBeTruthy();

    // Enthusiasm slider
    expect(getByText('Neutral')).toBeTruthy();
    expect(getByText('Enthusiastic')).toBeTruthy();

    // Headers/Lists slider
    expect(getByText('Prose')).toBeTruthy();
    expect(getByText('Structured')).toBeTruthy();

    // Emoji slider
    expect(getByText('None')).toBeTruthy();
    expect(getByText('Frequent')).toBeTruthy();
  });

  it('pre-fills text inputs from settingsStore', () => {
    useSettingsStore.setState({
      personalization: {
        fullName: 'John Doe',
        nickname: 'JD',
        occupation: 'Engineer',
        instructions: 'Be brief',
        warmth: 50,
        enthusiasm: 50,
        headersLists: 50,
        emoji: 50,
      },
    });

    const { getByDisplayValue } = render(<PersonalizationScreen />);

    expect(getByDisplayValue('John Doe')).toBeTruthy();
    expect(getByDisplayValue('JD')).toBeTruthy();
    expect(getByDisplayValue('Engineer')).toBeTruthy();
    expect(getByDisplayValue('Be brief')).toBeTruthy();
  });

  it('Save button commits text changes to settingsStore', () => {
    const { getByPlaceholderText, getByLabelText } = render(<PersonalizationScreen />);

    // Type into the Full Name field using its placeholder
    const nameInput = getByPlaceholderText('Your full name');
    fireEvent.changeText(nameInput, 'Alice Wonder');

    // Tap Save
    fireEvent.press(getByLabelText('Save personalization settings'));

    // Verify the store was updated
    const { personalization } = useSettingsStore.getState();
    expect(personalization.fullName).toBe('Alice Wonder');
  });

  it('Save button navigates back', () => {
    const { getByLabelText } = render(<PersonalizationScreen />);

    fireEvent.press(getByLabelText('Save personalization settings'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('renders the Save button', () => {
    const { getByText } = render(<PersonalizationScreen />);

    const saveText = getByText('Save');
    expect(saveText).toBeTruthy();
  });

  it('renders the Response Style section header', () => {
    const { getByText } = render(<PersonalizationScreen />);
    expect(getByText('Response Style')).toBeTruthy();
  });
});
